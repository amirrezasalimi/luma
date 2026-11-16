import { rpc } from '../rpc';
import { sessionsState, sessionPlain } from './sessions';
import { execCode } from './script-execution';
import { logM } from './hologram-controls';

let started = false, busy = false;
export function startSceneCommandSync(): void {
  if (started) return;
  started = true;
  const poll = async () => {
    const session = sessionsState.activeSession?.id;
    if (busy || !session || !sessionsState.sessionReady || sessionsState.sessionRestoring) return;
    busy = true;
    try {
      const command = await rpc.host.ai.claimScene({ session });
      if (!command) return;
      let result: unknown, failed = false;
      if (sessionsState.activeSession?.id !== session || sessionsState.sessionRestoring) {
        failed = true; result = { error: 'Workspace changed before execution; command was not run' };
      } else {
        const execution = await execCode(command.owner, null, command.code);
        result = sessionPlain({ output: execution.out, result: execution.ret, error: execution.er });
        failed = !!execution.er;
      }
      await rpc.host.ai.finishScene({ session, id: command.id, token: command.token, result, failed });
    } catch (error: any) { logM('Scene command bridge: ' + error.message, true); }
    finally { busy = false; }
  };
  setInterval(() => { void poll(); }, 750);
  void poll();
}
