import { rpc } from './rpc';
import { create } from 'zustand';

// A hydrated, in-memory working set; SQLite is the only persistent destination.
const values = new Map<string, string>();
const pending = new Map<string, string>();
let writing: Promise<void> | undefined;
export const usePersistenceStatus = create<{ saving: boolean; error: string }>(() => ({ saving: false, error: '' }));

export async function initializePersistence(): Promise<void> {
  const entries = await rpc.persistence.preferences();
  values.clear();
  for (const entry of entries) values.set(entry.key, entry.value);
}

export function readPreference(key: string): string | null {
  return values.get(key) ?? null;
}

export function writePreference(key: string, value: string): void {
  values.set(key, value);
  pending.set(key, value);
  if (!writing) void flushPreferences().catch(() => {});
}

function reportFailure(error: unknown) {
  console.error('SQLite persistence failed:', error);
  usePersistenceStatus.setState({ error: String(error) });
}

export async function flushPreferences(): Promise<void> {
  if (writing) return writing;
  usePersistenceStatus.setState({ saving: true });
  writing = (async () => {
    while (pending.size) {
      const batch = [...pending].map(([key, value]) => ({ key, value }));
      await rpc.persistence.writePreferences(batch);
      for (const entry of batch) if (pending.get(entry.key) === entry.value) pending.delete(entry.key);
    }
    usePersistenceStatus.setState({ error: '' });
  })();
  try { await writing; }
  catch (error) { reportFailure(error); throw error; }
  finally { writing = undefined; usePersistenceStatus.setState({ saving: false }); }
}
