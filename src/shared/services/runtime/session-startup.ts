import { initSessions } from './session-restoration';
import { saveSession } from './sessions';

/** Session startup and unload handling are persistence concerns, not settings UI. */
export async function restoreLatestSession(): Promise<void> {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;inset:0;z-index:100;background:var(--card);color:var(--fg);display:grid;place-items:center';
  notice.textContent = 'Restoring latest session…';
  document.body.append(notice);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveSession(true).catch(() => {});
  });
  addEventListener('pagehide', () => { void saveSession(true).catch(() => {}); });

  try {
    await initSessions();
  } finally {
    notice.remove();
  }
}
