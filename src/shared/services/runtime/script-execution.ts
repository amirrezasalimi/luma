/** script-execution: runtime implementation. */
import { hologramControlsState } from './hologram-controls';
import { captureUndoAction, finishUndoAction } from './workspace-history';
import { mkApi, scriptApiState } from './script-api';
import { mkErr, scriptLifecycleState } from './script-lifecycle';
import { profilesContextState } from './profiles-context';
import { agentQuestionsState } from './agent-questions';
import { saveSession, sessionPlain, sessionsState } from './sessions';
import { rq } from './workspace-bridge';

export
// ---- run an async JS snippet (agent / jarvis) in the scene API; resolves {ret,er,out}
async function execCode(by?: any, ag?: any, code?: any): Promise<any> {
  const action: any = hologramControlsState.undoReady ? captureUndoAction(by + ' command') : null;
  const x: any = {
    by,
    ag,
    out: [],
    tm: ag ? ag.tms : scriptApiState.JT
  };
  let ret: any,
    er: any = null;
  let timer: any;
  try {
    const f: any = new scriptLifecycleState.AF('J', 'with(J){' + code + '\n}\n//# sourceURL=jv_agent' + (ag ? ag.id : 'j')),
      limit: any = profilesContextState.ext.code ? 130000 : 20000,
      to: any = new Promise((_?: any, b?: any): any => {
        let elapsed: any = 0;
        timer = setInterval((): any => {
          if (!agentQuestionsState.pendingQuestions.some((q?: any): any => q.epoch === hologramControlsState.workspaceEpoch && q.agentId === (ag?.id || 'main'))) elapsed += 1000;
          if (elapsed >= limit) b(new Error('timeout: agent code execution limit reached'));
        }, 1000);
      });
    ret = await Promise.race([f(mkApi(x)), to]);
  } catch (e: any) {
    er = mkErr('exec', e, e instanceof SyntaxError ? code : null, scriptLifecycleState.AF);
  } finally {
    clearInterval(timer);
    if (action) finishUndoAction(action);
  }
  let safeResult: any;
  try {
    safeResult = sessionPlain(ret);
  } catch (e: any) {
    safeResult = String(ret);
  }
  const entry: any = {
    t: Date.now(),
    text: er ? '✖ js ' + scriptLifecycleState.errTxt(er) : '• js ok',
    err: !!er,
    execution: {
      code,
      result: safeResult,
      output: x.out,
      error: er
    }
  };
  const logs: any = ag ? ag.log : hologramControlsState.MAIN.log;
  logs.push(entry);
  rq();
  if (sessionsState.sessionReady && !sessionsState.sessionRestoring) try {
    await saveSession(true);
  } catch (e: any) {
    console.error('Command persistence failed:', e);
  }
  return {
    ret,
    er,
    out: x.out
  };
}
