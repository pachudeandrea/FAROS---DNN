import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function buildRevision() {
  if (process.env.VERCEL_GIT_COMMIT_SHA || process.env.FAROS_BUILD_REVISION) return process.env.VERCEL_GIT_COMMIT_SHA || process.env.FAROS_BUILD_REVISION;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

export default defineConfig(() => {
  return {
    define: { __FAROS_REVISION__: JSON.stringify(buildRevision()) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
