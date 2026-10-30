import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './src/server/app';
import {
  getNowAR,
  setSimulatedDayOffset,
  getSimulatedDayOffset
} from './src/utils/dateAR';
import {
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  verifySourceUrl,
  purgeUrlVerificationCache,
  getArgentinaDateInfo
} from './src/utils/urlResolver';
import {
  getBondSchedule,
  validateSource,
  getVerifiedCalendarEvents,
  buildCalendarCacheKey
} from './src/utils/calendarGrounding';
import { checkReminders } from './src/utils/calendarReminders';
import { ensurePiperDaemon } from './src/server/ttsEngine';

// Re-export required functions as specified in deliverables
export {
  getNowAR,
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  validateSource,
  getBondSchedule,
  checkReminders,
  setSimulatedDayOffset,
  getSimulatedDayOffset
};

export default app;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

async function startServer() {
  // Warm up audio engine safely in background
  ensurePiperDaemon().catch(() => {});

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FAROS server running on http://0.0.0.0:${PORT}`);
  });
}

// Start standalone server only when not executing in a Vercel serverless function
if (process.env.VERCEL !== '1' && !process.env.NOW_REGION) {
  startServer();
}
