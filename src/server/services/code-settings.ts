import { getDatabase } from '../database';

/** The saved Settings switch is the authority for host coding access. */
export function codeAgentEnabled(): boolean {
  const row = getDatabase().query<{ value: string }, [string]>('SELECT value FROM preferences WHERE key=?').get('luma-ext');
  try { return JSON.parse(row?.value || '{}').code === true; }
  catch { return false; }
}
