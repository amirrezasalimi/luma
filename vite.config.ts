import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { serveAsset } from './src/server/assets.ts';
import { Readable } from 'node:stream';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  // Mnemopi ships Bun-native TypeScript and text imports, not browser code.
  // Keep its dependency tree out of Rolldown's browser prebundler and let
  // Bun resolve it at runtime on the server.
  optimizeDeps: {
    exclude: ['@oh-my-pi/pi-mnemopi', '@oh-my-pi/pi-ai', '@oh-my-pi/pi-utils', '@oh-my-pi/pi-catalog', '@oh-my-pi/pi-natives'],
  },
  ssr: {
    external: ['@oh-my-pi/pi-mnemopi', '@oh-my-pi/pi-ai', '@oh-my-pi/pi-utils', '@oh-my-pi/pi-catalog', '@oh-my-pi/pi-natives'],
  },
  environments: {
    ssr: {
      resolve: {
        // fetchModule checks builtins before transforming source packages.
        builtins: [/^node:/, /^bun:/, /^@oh-my-pi\//],
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    strictPort: true,
  },
  plugins: [
    {
      name: 'luma-bun-memory-externals',
      enforce: 'pre',
      resolveId(source, _importer, options) {
        // TanStack's SSR bundling can override ssr.external for source
        // packages. Preserve all OMP entry points, including subpaths.
        if (options.ssr && source.startsWith('@oh-my-pi/')) {
          return { id: source, external: true };
        }
      },
    },
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: '/index.html' } } }),
    react(),
    {
      name: 'luma-local-assets',
      async closeBundle() {
        if (this.environment.name !== 'client') return;
        const out = resolve('dist/client');
        await mkdir(out, { recursive: true });
        for (const name of ['models', 'vendor', 'whistle']) {
          await cp(resolve(name), resolve(out, name), {
            recursive: true,
            filter: path => !path.split('/').some(part =>
              ['.cache', '__pycache__', '.gitattributes', '.DS_Store'].includes(part)),
          });
        }
      },
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
      name: 'luma-runtime-reload',
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
