import { os } from '@orpc/server';
import { z } from 'zod';
import { getDatabase } from './database';
import { hostRouter } from './host-router';

const key = z.string().min(1).max(200);
const entry = z.object({ key, value: z.string() });
const session = z.object({ id: z.string().min(1), name: z.string(), updatedAt: z.number().optional() }).passthrough();

export const router = {
  host: hostRouter,
  persistence: {
    preferences: os.handler(() => getDatabase().query<{ key: string; value: string }, []>('SELECT key,value FROM preferences').all()),
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
      return row ? JSON.parse(row.document) : null;
    }),
    listSessions: os.handler(() => getDatabase().query<{ id: string; name: string; updatedAt: number }, []>('SELECT id,name,updated_at AS updatedAt FROM sessions ORDER BY updated_at DESC').all()),
    commit: os.input(z.object({ sessions: z.array(session).max(100), meta: z.array(z.object({ key }).passthrough()).max(100) })).handler(({ input }) => {
      const db = getDatabase();
      db.transaction(() => {
        for (const row of input.sessions) db.query('INSERT INTO sessions(id,name,updated_at,document) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,document=excluded.document')
          .run(row.id, row.name, row.updatedAt || Date.now(), JSON.stringify(row));
        for (const row of input.meta) db.query('INSERT INTO metadata(key,document) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(row.key, JSON.stringify(row));
      })();
    }),
  },
};
