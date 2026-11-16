import { os } from '@orpc/server';
import { z } from 'zod';
import { getDatabase } from './database';
import { hostRouter } from './host-router';
import { indexConversation } from './services/session-history';
import { forgetGraphFact, graphMemoryPage } from './services/graph-memory';

const key = z.string().min(1).max(200);
const entry = z.object({ key, value: z.string() });
const session = z.object({ id: z.string().min(1), name: z.string(), updatedAt: z.number().optional() }).passthrough();

export const router = {
  host: hostRouter,
  graphMemory: {
    page: os.input(z.object({ session: key, profile: key.optional(), query: z.string().max(300).optional(), after: z.number().int().min(0).optional() }))
      .handler(({ input }) => graphMemoryPage(input)),
    forget: os.input(z.object({ session: key, profile: key.optional(), id: z.number().int().positive() }))
      .handler(({ input }) => forgetGraphFact(input)),
  },
  persistence: {
    preferences: os.handler(() => getDatabase().query<{ key: string; value: string }, []>("SELECT key,value FROM preferences WHERE key NOT LIKE 'luma-actions-%'").all()),
    preference: os.input(z.object({ key })).handler(({ input }) => {
      // Do not materialize or serialize oversized legacy undo blobs into the RPC response.
      const row = getDatabase().query<{ value: string | null; bytes: number }, [string]>(
        'SELECT CASE WHEN length(CAST(value AS BLOB)) <= 2097152 THEN value ELSE NULL END AS value, length(CAST(value AS BLOB)) AS bytes FROM preferences WHERE key=?',
      ).get(input.key);
      return { value: row?.value ?? null, oversized: (row?.bytes || 0) > 2097152 };
    }),
    writePreferences: os.input(z.array(entry).max(200)).handler(({ input }) => {
      const db = getDatabase();
      db.transaction(() => {
        const query = db.query('INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
        for (const item of input) query.run(item.key, item.value);
      })();
    }),
    get: os.input(z.object({ store: z.enum(['sessions', 'meta']), key })).handler(({ input }): unknown => {
      const db = getDatabase();
      const row = input.store === 'sessions'
        ? db.query<{ document: string }, [string]>('SELECT document FROM sessions WHERE id=?').get(input.key)
        : db.query<{ document: string }, [string]>('SELECT document FROM metadata WHERE key=?').get(input.key);
      if (!row) return null;
      const document = JSON.parse(row.document);
      if (input.store === 'sessions' && document.snapshot) {
        const visual = db.query<{ value: string }, []>("SELECT value FROM preferences WHERE key='luma-workspace-appearance'").get();
        if (visual) Object.assign(document.snapshot, JSON.parse(visual.value));
      }
      return document;
    }),
    listSessions: os.handler(() => getDatabase().query<{ id: string; name: string; updatedAt: number }, []>('SELECT id,name,updated_at AS updatedAt FROM sessions ORDER BY updated_at DESC').all()),
    commit: os.input(z.object({ sessions: z.array(session).max(100), meta: z.array(z.object({ key }).passthrough()).max(100) })).handler(({ input }) => {
      const db = getDatabase();
      db.transaction(() => {
        for (const row of input.sessions) {
          const appearance = row.snapshot as Record<string, unknown> | undefined;
          if (appearance) {
            const shared = Object.fromEntries(['background', 'hologram', 'palettes', 'sceneDefaults'].filter(key => appearance[key] !== undefined).map(key => [key, appearance[key]]));
            db.query("INSERT INTO preferences(key,value) VALUES ('luma-workspace-appearance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(shared));
          }
          db.query('INSERT INTO sessions(id,name,updated_at,document) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,document=excluded.document')
            .run(row.id, row.name, row.updatedAt || Date.now(), JSON.stringify(row));
          const snapshot = row.snapshot as { history?: { role: string; content: string }[] } | undefined;
          indexConversation('session:' + row.id, row.id, snapshot?.history || []);
        }
        for (const row of input.meta) db.query('INSERT INTO metadata(key,document) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(row.key, JSON.stringify(row));
      })();
    }),
  },
};
