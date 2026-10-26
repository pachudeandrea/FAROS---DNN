import os
import sys
import time
import json
import re
import hashlib
import queue
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PIPER_BIN = os.path.join(ROOT_DIR, 'bin/piper/piper')
MODEL_PATH = os.path.join(ROOT_DIR, 'models/piper/es_AR-daniela-high.onnx')
CONFIG_PATH = os.path.join(ROOT_DIR, 'models/piper/es_AR-daniela-high.onnx.json')
CACHE_DIR = os.path.join(ROOT_DIR, 'audio_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

PORT = 5005

# Global persistent process
piper_proc = None
piper_lock = threading.Lock()
is_ready = False
prefetch_queue = queue.Queue()

def compute_hash(text: str) -> str:
    clean = text.strip()
    return hashlib.sha256(clean.encode('utf-8')).hexdigest()

def split_sentences(text: str) -> list:
    cleaned = text.strip()
    if not cleaned:
        return []
    parts = re.split(r'(?<=[.?!])\s+', cleaned)
    return [p.strip() for p in parts if p.strip()]

def get_mp3_duration(file_path: str) -> float:
    try:
        res = subprocess.check_output(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return float(res)
    except:
        return 0.0

def wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    try:
        temp_mp3 = mp3_path + f'.tmp.{int(time.time()*1000)}.mp3'
        cmd = [
            'ffmpeg', '-y',
            '-i', wav_path,
            '-b:a', '64k',
            '-ac', '1',
            temp_mp3
        ]
        ret = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ret.returncode == 0 and os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 100:
            os.replace(temp_mp3, mp3_path)
            return True
        if os.path.exists(temp_mp3):
            os.remove(temp_mp3)
        return False
    except Exception as e:
        sys.stderr.write(f"[FFMPEG TRANSCODE ERROR] {e}\n")
        return False
    finally:
        if os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except:
                pass

def start_persistent_piper():
    global piper_proc, is_ready
    try:
        sys.stdout.write(f"[PIPER] Starting persistent C++ Piper with {MODEL_PATH}...\n")
        sys.stdout.flush()
        t0 = time.time()
        cmd = [
            PIPER_BIN,
            '--model', MODEL_PATH,
            '--config', CONFIG_PATH,
            '--sentence_silence', '0.35',
            '--json-input'
        ]
        piper_proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True
        )

        # Warmup sentence
        warmup_wav = os.path.join(CACHE_DIR, 'warmup.wav')
        req = json.dumps({'text': 'FAROS Argentina, sistema de audio iniciado.', 'output_file': warmup_wav}) + '\n'
        with piper_lock:
            piper_proc.stdin.write(req)
            piper_proc.stdin.flush()
            piper_proc.stdout.readline()

        if os.path.exists(warmup_wav):
            try: os.remove(warmup_wav)
            except: pass

        t_end = time.time()
        sys.stdout.write(f"[PIPER] Warmup complete in {t_end - t0:.2f}s. Persistent Piper Engine is READY in RAM.\n")
        sys.stdout.flush()
        is_ready = True
    except Exception as e:
        sys.stderr.write(f"[PIPER START ERROR] {e}\n")
        sys.stdout.flush()
        is_ready = False

def synthesize_text_piper(text: str, output_mp3: str) -> dict:
    global piper_proc
    if not piper_proc or piper_proc.poll() is not None:
        start_persistent_piper()

    temp_wav = output_mp3 + f'.tmp.{int(time.time()*1000)}.wav'
    req_json = json.dumps({'text': text, 'output_file': temp_wav}) + '\n'

    t0 = time.time()
    with piper_lock:
        piper_proc.stdin.write(req_json)
        piper_proc.stdin.flush()
        line = piper_proc.stdout.readline()

    t_synth = time.time() - t0
    if not os.path.exists(temp_wav) or os.path.getsize(temp_wav) < 100:
        raise RuntimeError("Piper did not generate output WAV")

    t_trans0 = time.time()
    ok = wav_to_mp3(temp_wav, output_mp3)
    t_trans = time.time() - t_trans0

    if not ok or not os.path.exists(output_mp3):
        raise RuntimeError("Failed to transcode output to 64k MP3")

    dur = get_mp3_duration(output_mp3)
    return {
        "success": True,
        "engine": "Piper TTS (In-Memory)",
        "voice": "es_AR-daniela-high",
        "synth_time": t_synth,
        "transcode_time": t_trans,
        "duration": dur,
        "file_size": os.path.getsize(output_mp3)
    }

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
                sys.stdout.write(f"[PREFETCH] Background generating hash {script_hash[:10]}...\n")
                sys.stdout.flush()
                try:
                    synthesize_text_piper(text, final_mp3)
                    sys.stdout.write(f"[PREFETCH] Cached {script_hash[:10]}.mp3 successfully.\n")
                    sys.stdout.flush()
                except Exception as err:
                    sys.stderr.write(f"[PREFETCH FAIL] {err}\n")
            prefetch_queue.task_done()
        except Exception as e:
            sys.stderr.write(f"[PREFETCH WORKER ERR] {e}\n")
            time.sleep(1)

class PiperHTTPHandler(BaseHTTPRequestHandler):
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
                "engine": "Piper TTS (In-Memory)",
                "voice": "es_AR-daniela-high",
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
                    if not os.path.exists(final_mp3):
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

            # 1. Instant Cache Hit: Return in < 5ms!
            if os.path.exists(final_mp3) and os.path.getsize(final_mp3) > 500:
                dur = get_mp3_duration(final_mp3)
                self.send_json(200, {
                    "success": True,
                    "cached": True,
                    "hash": script_hash,
                    "filename": f"{script_hash}.mp3",
                    "duration": dur,
                    "engine": "Piper TTS (Cache)",
                    "voice": "es_AR-daniela-high"
                })
                return

            stream_first_sentence = payload.get('stream_first_sentence', True)
            sentences = split_sentences(text)

            # 2. Multi-sentence Streaming (Requirement 2): produce sentence 0 immediately
            if stream_first_sentence and len(sentences) > 1:
                chunk0_mp3 = os.path.join(CACHE_DIR, f"{script_hash}_chunk_0.mp3")
                t_start = time.time()
                dur0 = 0.0

                if os.path.exists(chunk0_mp3) and os.path.getsize(chunk0_mp3) > 100:
                    dur0 = get_mp3_duration(chunk0_mp3)
                else:
                    try:
                        res0 = synthesize_text_piper(sentences[0], chunk0_mp3)
                        dur0 = res0.get('duration', 0.0)
                    except Exception as err:
                        sys.stderr.write(f"[PIPER CHUNK 0 FAIL] {err}\n")
                        self.send_json(500, {"success": False, "error": str(err)})
                        return

                # Background thread finishes remaining sentences and merges full file
                def generate_remaining():
                    try:
                        synthesize_text_piper(text, final_mp3)
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
                    "engine": "Piper TTS (Streaming)",
                    "voice": "es_AR-daniela-high"
                })
                return

            # 3. Single sentence or direct full generation
            try:
                res = synthesize_text_piper(text, final_mp3)
                self.send_json(200, {
                    "success": True,
                    "cached": False,
                    "hash": script_hash,
                    "filename": f"{script_hash}.mp3",
                    "duration": res.get('duration', 0.0),
                    "engine": "Piper TTS (In-Memory)",
                    "voice": "es_AR-daniela-high"
                })
            except Exception as e:
                sys.stderr.write(f"[PIPER SYNTH ERR] {e}\n")
                self.send_json(500, {
                    "success": False,
                    "error": "Error al sintetizar con Piper TTS",
                    "notice": f"Detalle técnico: {str(e)}"
                })
            return

        self.send_json(404, {"error": "Endpoint no encontrado"})

def main():
    start_persistent_piper()
    t_pref = threading.Thread(target=background_prefetch_worker, daemon=True)
    t_pref.start()

    server = HTTPServer(('127.0.0.1', PORT), PiperHTTPHandler)
    sys.stdout.write(f"[PIPER_DAEMON] Ready and listening on http://127.0.0.1:{PORT}\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if piper_proc:
            try: piper_proc.kill()
            except: pass

if __name__ == '__main__':
    main()
