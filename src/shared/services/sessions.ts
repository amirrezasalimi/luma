import { prepareSessionState } from './runtime/sessions';
import { bindSessionShortcut } from './runtime/session-restoration';
import { prepareWorkspaceHistory } from './runtime/workspace-history';
import { restoreLatestSession } from './runtime/session-startup';

export function prepareSessions(): void {
  prepareSessionState();
  prepareWorkspaceHistory();
  bindSessionShortcut();
}

export async function restoreSessions(): Promise<void> {
  await restoreLatestSession();
}
