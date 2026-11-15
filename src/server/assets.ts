import { resolve, sep } from 'node:path';

/** Allowlisted local model/runtime assets in development; production uses dist/client. */
export async function serveAsset(request: Request, root: string): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method)) return;
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Invalid path', { status: 400 }); }
  if (!['/models/', '/vendor/', '/whistle/', '/assets/'].some(prefix => pathname.startsWith(prefix))) return;
  const path = resolve(root, '.' + pathname);
  if (!path.startsWith(resolve(root) + sep) || pathname.split('/').some(part => part.startsWith('.'))) return new Response('Not found', { status: 404 });
  const file = Bun.file(path);
  if (!await file.exists()) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : file);
}
