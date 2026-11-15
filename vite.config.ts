import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { serveAsset } from './src/server/assets';
import { Readable } from 'node:stream';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    strictPort: true,
  },
  plugins: [
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: '/index.html' } } }),
    react(),
    {
      name: 'jarvis-local-assets',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method });
            const response = await serveAsset(request, process.cwd());
            if (!response) return next();
            res.statusCode = response.status;
            response.headers.forEach((value, name) => res.setHeader(name, value));
            if (response.body) Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream).pipe(res);
            else res.end();
          } catch (error) { next(error as Error); }
        });
      },
    },
    {
      name: 'jarvis-runtime-reload',
      handleHotUpdate({ file, server }) {
        // The imperative scene owns workers, audio and global listeners. Never mount it twice.
        if (file.includes('/src/shared/services/')) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  ],
});
