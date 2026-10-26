import os
import sys
import time
import json
import re
import hashlib
import queue
import threading
import asyncio
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PIPER_BIN = os.path.join(ROOT_DIR, 'bin/piper/piper')
PIPER_MODEL = os.path.join(ROOT_DIR, 'models/piper/es_AR-daniela-high.onnx')
PIPER_CONFIG = os.path.join(ROOT_DIR, 'models/piper/es_AR-daniela-high.onnx.json')
CACHE_DIR = os.path.join(ROOT_DIR, 'audio_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

PORT = 5005
VOICE_EDGE = "es-AR-ElenaNeural"
VOICE_PIPER = "es_AR-daniela-high"

prefetch_queue = queue.Queue()
is_ready = False
piper_proc = None
piper_lock = threading.Lock()

def compute_hash(text: str) -> str:
    clean = text.strip()
    return hashlib.sha256(clean.encode('utf-8')).hexdigest()

def split_sentences(text: str) -> list:
    cleaned = text.strip()
    if not cleaned:
        return []
    parts = re.split(r'(?<=[.?!])\s+', cleaned)
    return [p.strip() for p in parts if p.strip()]

def get_audio_duration(file_path: str) -> float:
    try:
        res = subprocess.check_output(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return float(res)
    except:
        return 0.0

def start_piper_daemon_if_needed():
    global piper_proc
    if piper_proc and piper_proc.poll() is None:
        return
    try:
        if os.path.exists(PIPER_BIN) and os.path.exists(PIPER_MODEL):
            cmd = [
                PIPER_BIN,
                '--model', PIPER_MODEL,
                '--config', PIPER_CONFIG,
                '--sentence_silence', '0.2',
                '--json-input'
            ]
            piper_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True
            )
            # Warmup
            warmup_wav = os.path.join(CACHE_DIR, 'piper_warmup.wav')
            req = json.dumps({'text': 'FAROS Argentina.', 'output_file': warmup_wav}) + '\n'
            with piper_lock:
                piper_proc.stdin.write(req)
                piper_proc.stdin.flush()
                piper_proc.stdout.readline()
            if os.path.exists(warmup_wav):
                try: os.remove(warmup_wav)
                except: pass
    except Exception as e:
        sys.stderr.write(f"[PIPER INIT WARN] {e}\n")

def synthesize_with_piper(text: str, out_mp3: str) -> bool:
    global piper_proc
    start_piper_daemon_if_needed()
    if not piper_proc or piper_proc.poll() is not None:
        return False
    temp_wav = out_mp3 + f'.tmp.{int(time.time()*1000)}.wav'
    req_json = json.dumps({'text': text, 'output_file': temp_wav}) + '\n'
    try:
        with piper_lock:
            piper_proc.stdin.write(req_json)
            piper_proc.stdin.flush()
            piper_proc.stdout.readline()
        if os.path.exists(temp_wav) and os.path.getsize(temp_wav) > 100:
            # Transcode WAV to 64k mono MP3
            subprocess.run([
                'ffmpeg', '-y', '-i', temp_wav, '-b:a', '64k', '-ac', '1', out_mp3
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 100
    except Exception as err:
        sys.stderr.write(f"[PIPER SYNTH ERR] {err}\n")
    finally:
        if os.path.exists(temp_wav):
            try: os.remove(temp_wav)
            except: pass
    return False

async def synthesize_with_edge_async(text: str, out_mp3: str) -> bool:
    try:
        import edge_tts
    except ImportError:
        return False
    temp_mp3 = out_mp3 + f'.tmp.{int(time.time()*1000)}.mp3'
    try:
        communicate = edge_tts.Communicate(text, VOICE_EDGE)
        await communicate.save(temp_mp3)
        if os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 500:
            os.replace(temp_mp3, out_mp3)
            return True
    except Exception as e:
        sys.stderr.write(f"[EDGE-TTS ERR] {e}\n")
    finally:
        if os.path.exists(temp_mp3):
            try: os.remove(temp_mp3)
            except: pass
    return False

def synthesize_text_sync(text: str, out_mp3: str) -> dict:
    t0 = time.time()
    # 1. Primary engine: Microsoft Edge Neuronal TTS (Elena es-AR)
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        ok = loop.run_until_complete(synthesize_with_edge_async(text, out_mp3))
        loop.close()
        if ok and os.path.exists(out_mp3):
            dur = get_audio_duration(out_mp3)
            return {
                "success": True,
                "engine": "Microsoft Edge Neuronal TTS",
                "voice": VOICE_EDGE,
                "duration": dur,
                "elapsed": time.time() - t0,
                "file_size": os.path.getsize(out_mp3)
            }
    except Exception as edge_err:
        sys.stderr.write(f"[EDGE-TTS EXCEPTION] {edge_err}\n")

    # 2. Fallback engine: Piper TTS In-Memory (Daniela es_AR)
    sys.stdout.write("[TTS] Edge-TTS unavailable, falling back to local Piper TTS...\n")
    sys.stdout.flush()
    ok_piper = synthesize_with_piper(text, out_mp3)
    if ok_piper and os.path.exists(out_mp3):
        dur = get_audio_duration(out_mp3)
        return {
            "success": True,
            "engine": "Piper TTS (In-Memory)",
            "voice": VOICE_PIPER,
            "duration": dur,
            "elapsed": time.time() - t0,
            "file_size": os.path.getsize(out_mp3)
        }

    raise RuntimeError("Ambos motores de síntesis (Edge-TTS y Piper) no pudieron generar el archivo de audio.")

def background_prefetch_worker():
    while True:
        try:
            item = prefetch_queue.get()
            if item is None:
                break
            text = item.get('text', '').strip()
            script_hash = item.get('hash') or compute_hash(text)
            final_mp3 = os.path.join(CACHE_DIR, f"{script_hash}.mp3")

            if not os.path.exists(final_mp3) or os.path.getsize(final_mp3) < 500:
                sys.stdout.write(f"[PREFETCH] Generando audio en segundo plano: {script_hash[:10]}...\n")
                sys.stdout.flush()
                try:
                    res = synthesize_text_sync(text, final_mp3)
                    sys.stdout.write(f"[PREFETCH] Cacheado con éxito ({res['engine']}, {res['duration']:.1f}s, {res['file_size']} bytes)\n")
                    sys.stdout.flush()
                except Exception as err:
                    sys.stderr.write(f"[PREFETCH FAIL] {err}\n")
            prefetch_queue.task_done()
        except Exception as e:
            sys.stderr.write(f"[PREFETCH WORKER ERR] {e}\n")
            time.sleep(1)

class TTSHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, status: int, data: dict):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/health', '/api/health'):
            self.send_json(200, {
                "ready": is_ready,
                "engine": "Microsoft Edge Neuronal TTS (Primary) + Piper TTS (Fallback)",
                "voice": VOICE_EDGE,
                "queue_size": prefetch_queue.qsize()
            })
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length).decode('utf-8')
        try:
            payload = json.loads(raw)
        except:
            payload = {}

        if self.path == '/prefetch':
            items = payload.get('items', [])
            count = 0
            for it in items:
                text = it.get('text', '').strip()
                if text:
                    h = it.get('hash') or compute_hash(text)
                    final_mp3 = os.path.join(CACHE_DIR, f"{h}.mp3")
                    if not os.path.exists(final_mp3) or os.path.getsize(final_mp3) < 500:
                        prefetch_queue.put({'text': text, 'hash': h})
                        count += 1
            self.send_json(200, {"success": True, "enqueued": count, "queue_size": prefetch_queue.qsize()})
            return

        if self.path == '/synthesize':
            text = payload.get('text', '').strip()
            if not text:
                self.send_json(400, {"success": False, "error": "Texto vacío"})
                return

            script_hash = payload.get('hash') or compute_hash(text)
            final_mp3 = os.path.join(CACHE_DIR, f"{script_hash}.mp3")

            # 1. Instant Cache Hit: Return in < 3ms
            if os.path.exists(final_mp3) and os.path.getsize(final_mp3) > 500:
                dur = get_audio_duration(final_mp3)
                self.send_json(200, {
                    "success": True,
                    "cached": True,
                    "hash": script_hash,
                    "filename": f"{script_hash}.mp3",
                    "duration": dur,
                    "file_size": os.path.getsize(final_mp3),
                    "engine": "Microsoft Edge Neuronal TTS (Cache)",
                    "voice": VOICE_EDGE
                })
                return

            stream_first_sentence = payload.get('stream_first_sentence', True)
            sentences = split_sentences(text)

            # 2. Multi-sentence Streaming: Generate sentence 0 (< 0.8s start) while remainder finishes
            if stream_first_sentence and len(sentences) > 1:
                chunk0_mp3 = os.path.join(CACHE_DIR, f"{script_hash}_chunk_0.mp3")
                t_start = time.time()
                dur0 = 0.0

                if os.path.exists(chunk0_mp3) and os.path.getsize(chunk0_mp3) > 500:
                    dur0 = get_audio_duration(chunk0_mp3)
                else:
                    try:
                        res0 = synthesize_text_sync(sentences[0], chunk0_mp3)
                        dur0 = res0.get('duration', 0.0)
                    except Exception as err:
                        sys.stderr.write(f"[CHUNK 0 FAIL] {err}\n")
                        self.send_json(500, {"success": False, "error": str(err)})
                        return

                # Background thread generates the full audio file
                def generate_remaining():
                    try:
                        synthesize_text_sync(text, final_mp3)
                    except Exception as e_bg:
                        sys.stderr.write(f"[BACKGROUND FULL ERR] {e_bg}\n")

                threading.Thread(target=generate_remaining, daemon=True).start()

                self.send_json(200, {
                    "success": True,
                    "cached": False,
                    "isStreaming": True,
                    "chunkIndex": 0,
                    "totalChunks": len(sentences),
                    "chunkFilename": f"{script_hash}_chunk_0.mp3",
                    "chunkDuration": dur0,
                    "fullFilename": f"{script_hash}.mp3",
                    "hash": script_hash,
                    "timeToFirstChunk": time.time() - t_start,
                    "engine": "Microsoft Edge Neuronal TTS (Streaming)",
                    "voice": VOICE_EDGE
                })
                return

            # 3. Single sentence or direct generation
            try:
                res = synthesize_text_sync(text, final_mp3)
                self.send_json(200, {
                    "success": True,
                    "cached": False,
                    "hash": script_hash,
                    "filename": f"{script_hash}.mp3",
                    "duration": res.get('duration', 0.0),
                    "file_size": res.get('file_size', 0),
                    "engine": res.get('engine', 'Microsoft Edge Neuronal TTS'),
                    "voice": res.get('voice', VOICE_EDGE)
                })
            except Exception as e:
                sys.stderr.write(f"[SYNTH ERR] {e}\n")
                self.send_json(500, {
                    "success": False,
                    "error": "Error al sintetizar audio",
                    "notice": str(e)
                })
            return

        self.send_json(404, {"error": "Endpoint no encontrado"})

def warmup():
    global is_ready
    try:
        warmup_file = os.path.join(CACHE_DIR, 'warmup.mp3')
        synthesize_text_sync("FAROS Argentina.", warmup_file)
        if os.path.exists(warmup_file):
            try: os.remove(warmup_file)
            except: pass
        sys.stdout.write(f"[TTS_WORKER] Warmup completado. Motor listo en RAM.\n")
        sys.stdout.flush()
        is_ready = True
    except Exception as err:
        sys.stderr.write(f"[TTS_WORKER WARMUP WARN] {err}\n")
        is_ready = True

def main():
    warmup()
    t_pref = threading.Thread(target=background_prefetch_worker, daemon=True)
    t_pref.start()

    try:
        HTTPServer.allow_reuse_address = True
        server = HTTPServer(('127.0.0.1', PORT), TTSHTTPHandler)
    except OSError as e:
        if e.errno == 98:
            sys.stdout.write(f"[TTS_WORKER] Port {PORT} already bound by running instance. Exiting safely.\n")
            return
        raise
    sys.stdout.write(f"[TTS_WORKER] Listo y escuchando en http://127.0.0.1:{PORT}\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try: server.server_close()
        except: pass
        if piper_proc:
            try: piper_proc.kill()
            except: pass

if __name__ == '__main__':
    main()
