import start from '../../dist/server/server.js';
import { serveAsset } from './assets';
import { resolve } from 'node:path';

// Transport only: routing and all API procedures belong to TanStack Start.
const port = Number(process.env.PORT || 3000);
Bun.serve({
  hostname: '127.0.0.1', port,
  async fetch(request) {
    return await serveAsset(request, resolve(process.cwd(), 'dist/client')) ?? start.fetch(request);
  },
});
console.log(`Luma: http://localhost:${port}`);
