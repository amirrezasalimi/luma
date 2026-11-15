import { readPreference, writePreference } from '../persistence';
/** workspace-history: runtime implementation. */
import { saveSession, sessionStatus, sessionsState, snapshotSession, stopSessionWork } from './sessions';
import { hologramControlsState } from './hologram-controls';
import { restoreSession } from './session-restoration';

interface ModuleState {
  undoActions: any;
  redoActions: any;
  undoApplying: boolean;
  undoStorageKey: any;
  undoWorkspace: any;
  redoWorkspace: any;
}

export const workspaceHistoryState = {} as ModuleState;

export function workspaceFingerprint(s?: any): any {
  return JSON.stringify({
    objects: s.objects,
    panels: s.panels,
    gui: s.gui,
    agents: s.agents.map((a?: any): any => ({
      id: a.id,
      name: a.name,
      model: a.model,
      task: a.task,
      status: a.status,
      tp: a.tp,
      rt: a.rt,
      pal: a.pal,
      labels: a.labels,
      maxTurns: a.maxTurns,
      unlimited: a.unlimited
    })),
    hologram: s.hologram,
    labels: s.labels,
    hiddenLabels: s.hiddenLabels,
    labelText: s.labelText,
    camera: s.camera
  });
}
export function persistUndo(): any {
  if (!sessionsState.activeSession) return;
  try {
    writePreference(workspaceHistoryState.undoStorageKey(), JSON.stringify({
      undo: workspaceHistoryState.undoActions.slice(-10),
      redo: workspaceHistoryState.redoActions.slice(-10)
    }));
  } catch (e: any) {
    sessionStatus('Undo server save failed: ' + e.message + '; session saving remains separate');
  }
}
export function loadUndo(): any {
  workspaceHistoryState.undoActions = [];
  workspaceHistoryState.redoActions = [];
  try {
    const value: any = JSON.parse(readPreference(workspaceHistoryState.undoStorageKey()) || '{}');
    workspaceHistoryState.undoActions = Array.isArray(value.undo) ? value.undo.slice(-10) : [];
    workspaceHistoryState.redoActions = Array.isArray(value.redo) ? value.redo.slice(-10) : [];
  } catch (e: any) {
    sessionStatus('Undo restore failed: ' + e.message);
  }
  hologramControlsState.undoReady = true;
}
export function captureUndoAction(label?: any): any {
  if (!sessionsState.sessionReady || sessionsState.sessionRestoring || workspaceHistoryState.undoApplying) return null;
  return {
    label,
    session: sessionsState.activeSession.id,
    epoch: hologramControlsState.workspaceEpoch,
    before: snapshotSession()
  };
}
export function finishUndoAction(action?: any): any {
  if (workspaceHistoryState.undoApplying || action.session !== sessionsState.activeSession?.id || action.epoch !== hologramControlsState.workspaceEpoch) return;
  const after: any = snapshotSession();
  if (workspaceFingerprint(action.before) === workspaceFingerprint(after)) return;
  workspaceHistoryState.undoActions.push({
    label: action.label,
    time: Date.now(),
    before: action.before,
    after
  });
  workspaceHistoryState.undoActions = workspaceHistoryState.undoActions.slice(-10);
  workspaceHistoryState.redoActions = [];
  persistUndo();
}
export async function applyWorkspaceHistory(redo: any = false): Promise<any> {
  const source: any = redo ? workspaceHistoryState.redoActions : workspaceHistoryState.undoActions,
    target: any = redo ? workspaceHistoryState.undoActions : workspaceHistoryState.redoActions;
  if (!source.length) return {
    ok: false,
    message: redo ? 'Nothing to redo' : 'Nothing to undo'
  };
  if (workspaceHistoryState.undoApplying) throw new Error('Undo/redo already in progress');
  const item: any = source[source.length - 1];
  workspaceHistoryState.undoApplying = true;
  try {
    stopSessionWork();
    const current: any = snapshotSession(),
      state: any = redo ? item.after : item.before;
    restoreSession(state);
    source.pop();
    if (redo) item.before = current;else item.after = current;
    target.push(item);
    if (target.length > 10) target.shift();
    persistUndo();
    await saveSession(true);
    sessionStatus((redo ? 'Redid ' : 'Undid ') + item.label + ' (host operations and permanent memories are not reversed)');
    return {
      ok: true,
      label: item.label
    };
  } finally {
    workspaceHistoryState.undoApplying = false;
  }
}
export function prepareWorkspaceHistory(): void {
  workspaceHistoryState.undoActions = [];
  workspaceHistoryState.redoActions = [];
  workspaceHistoryState.undoApplying = false;
  workspaceHistoryState.undoStorageKey = (): any => 'jarvis-actions-' + sessionsState.activeSession.id;
  workspaceHistoryState.undoWorkspace = (): any => applyWorkspaceHistory(false);
  workspaceHistoryState.redoWorkspace = (): any => applyWorkspaceHistory(true);
}
