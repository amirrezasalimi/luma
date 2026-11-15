import { initSessions } from './session-restoration';
import { saveSession } from './sessions';
import { useRuntimeUI } from '../../../stores/runtime-ui';

/** Session startup and unload handling are persistence concerns, not settings UI. */
export async function restoreLatestSession(): Promise<void> {
  useRuntimeUI.setState({ restoringSession: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveSession(true).catch(() => {});
  });
  addEventListener('pagehide', () => { void saveSession(true).catch(() => {}); });

  try {
    await initSessions();
  } finally {
    useRuntimeUI.setState({ restoringSession: false });
  }
}
