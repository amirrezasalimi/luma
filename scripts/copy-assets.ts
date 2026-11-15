import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const out = resolve(root, 'dist/client');
await mkdir(out, { recursive: true });
for (const name of ['models', 'vendor', 'whistle']) {
  await cp(resolve(root, name), resolve(out, name), {
    recursive: true,
    filter: (path) => !path.split('/').some(part =>
      ['.cache', '__pycache__', '.gitattributes', '.DS_Store'].includes(part)),
  });
}
await Bun.write(resolve(out, '.nojekyll'), '');
