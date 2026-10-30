import app from '../server';

export default function handler(req: any, res: any) {
  // Normalize URL if Vercel serverless environment rewrote or stripped the path
  const matchedPath = req.headers['x-matched-path'];
  if (matchedPath && typeof matchedPath === 'string') {
    req.url = matchedPath;
  }
  return app(req, res);
}
