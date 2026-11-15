import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let database: Database | undefined;

export function getDatabase(): Database {
  if (database) return database;
  const path = resolve(Bun.env.JARVIS_DATABASE || 'data/jarvis.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  database = new Database(path, { create: true, strict: true });
  chmodSync(path, 0o600);
  database.run('PRAGMA journal_mode = WAL');
  database.run('PRAGMA synchronous = FULL');
  database.exec(`CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at INTEGER NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, document TEXT NOT NULL);`);
  return database;
}
