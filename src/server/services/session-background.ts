import { z } from 'zod';
import { getDatabase } from '../database';

export const backgroundInput = z.object({
  operation: z.enum(['get', 'set', 'remove']),
  url: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  opacity: z.number().min(0).max(1).optional(), light: z.number().min(0).max(2).optional(),
});
function database() {
  const db = getDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS session_backgrounds(session_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,config TEXT NOT NULL)');
  return db;
}
export function readBackground(session: string): { revision: number; config: Record<string, any> } | null {
  const db = database();
  // Seed the shared background from the active session on first access.
  db.query(`INSERT OR IGNORE INTO session_backgrounds(session_id,revision,config)
    SELECT 'workspace',revision,config FROM session_backgrounds WHERE session_id=?`).run(session);
  const row: any = db.query("SELECT revision,config FROM session_backgrounds WHERE session_id='workspace'").get();
  return row ? { revision: row.revision, config: JSON.parse(row.config) } : null;
}
export function changeBackground(session: string, raw: z.input<typeof backgroundInput>) {
  const input = backgroundInput.parse(raw), db = database();
  readBackground(session);
  if (input.operation === 'get') return readBackground(session);
  if (input.operation === 'set' && !input.url) throw new Error('An HTTP(S) image URL is required');
  const config = input.operation === 'remove' ? {} : { src: input.url, opacity: input.opacity ?? 1, light: input.light ?? .5 };
  db.query(`INSERT INTO session_backgrounds VALUES (?,1,?) ON CONFLICT(session_id)
    DO UPDATE SET revision=revision+1,config=excluded.config`).run('workspace', JSON.stringify(config));
  return { ...readBackground(session), status: 'saved', note: 'Desired background saved on the backend. Graphical clients apply it on sync/reconnect. Image download/rendering is not yet verified; do not claim it is visibly loaded.' };
}
