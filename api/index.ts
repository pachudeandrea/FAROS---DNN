import app from '../src/server/app';

export default function handler(req: any, res: any) {
  // Normalize URL if Vercel serverless environment rewrote or stripped the path
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (matchedPath && typeof matchedPath === 'string' && matchedPath.startsWith('/api')) {
    req.url = matchedPath;
  }
  return app(req, res);
}
