import { rpc } from '../rpc';
import { mkApi } from './script-api';
import { saveSession, sessionPlain, sessionsState } from './sessions';
import { logM } from './hologram-controls';
import type { WorkspaceOperation } from '../../../server/services/workspace-operations';

/** Requests arrive only on the initiating main-agent stream; never replay them after refresh. */
export async function executeWorkspaceOperation(event: WorkspaceOperation, signal: AbortSignal, check: () => void): Promise<void> {
  check();
  let result: unknown;
  let error: string | undefined;
  try {
    if (event.session !== sessionsState.activeSession?.id || !sessionsState.sessionReady || sessionsState.sessionRestoring) throw new Error('Workspace session is no longer active or ready');
    const api = mkApi({ by: 'jarvis', out: [], tm: new Set() });
    result = sessionPlain(api.manage_agents(event.input.operation, event.input.target, event.input.options));
    logM('Agent management: ' + event.input.operation + (event.input.target ? ' ' + event.input.target : '') + ' executed');
    // The acknowledgement describes execution, not a guarantee of future agent completion.
    void saveSession(true).catch((failure: any) => logM('Management state save failed: ' + failure.message, true));
  } catch (failure: any) {
    error = String(failure.message || failure).slice(0, 4000);
    logM('Agent management failed: ' + error, true);
  }
  await rpc.host.ai.completeOperation({ id: event.id, token: event.token, session: event.session, result, error }, { signal });
}
