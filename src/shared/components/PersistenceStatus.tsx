import { flushPreferences, usePersistenceStatus } from '../services/persistence';

export function PersistenceStatus() {
  const error = usePersistenceStatus(state => state.error);
  const saving = usePersistenceStatus(state => state.saving);
  if (!error) return null;
  return <aside role="alert" style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 300, background: '#321020', color: 'white', padding: 12 }}>
    <p>Server saving failed. Keep this page open: {error}</p>
    <button type="button" disabled={saving} onClick={() => { void flushPreferences().catch(() => {}); }}>RETRY SAVE</button>
  </aside>;
}
