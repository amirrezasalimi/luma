import { readPreference, writePreference } from '../persistence';
import { rpc } from '../rpc';
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
const MAX_UNDO_BYTES = 2 * 1024 * 1024;

function boundedUndoHistory(): string {
  const undo = workspaceHistoryState.undoActions.slice(-10);
  const redo = workspaceHistoryState.redoActions.slice(-10);
  let encoded = JSON.stringify({ undo, redo });
  // Full snapshots grow with conversation length. Bound total storage, not just count.
  while (new TextEncoder().encode(encoded).byteLength > MAX_UNDO_BYTES && (undo.length || redo.length)) {
    if (undo.length > 1) undo.shift();
    else if (redo.length) redo.shift();
    else undo.shift();
    encoded = JSON.stringify({ undo, redo });
  }
  return encoded;
}

export function workspaceFingerprint(s?: any): any {
  return JSON.stringify({
    objects: s.objects,
    history: s.history,
    transcript: (s.transcript || []).map((entry: any) => ({ role: entry.role, text: entry.text })),
    mainContextState: s.mainContextState,
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
      unlimited: a.unlimited,
      messages: a.msgs,
      messageArchive: a.messageArchive,
      contextState: a.contextState
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
    writePreference(workspaceHistoryState.undoStorageKey(), boundedUndoHistory());
  } catch (e: any) {
    sessionStatus('Undo server save failed: ' + e.message + '; session saving remains separate');
  }
}
export async function loadUndo(): Promise<void> {
  const storageKey = workspaceHistoryState.undoStorageKey();
  hologramControlsState.undoReady = false;
  workspaceHistoryState.undoActions = [];
  workspaceHistoryState.redoActions = [];
  try {
    const saved = await rpc.persistence.preference({ key: storageKey });
    if (storageKey !== workspaceHistoryState.undoStorageKey()) return;
    const value: any = JSON.parse(saved.value || '{}');
    workspaceHistoryState.undoActions = Array.isArray(value.undo) ? value.undo.slice(-10) : [];
    workspaceHistoryState.redoActions = Array.isArray(value.redo) ? value.redo.slice(-10) : [];
  } catch (e: any) {
    sessionStatus('Undo restore failed: ' + e.message);
  }
  hologramControlsState.undoReady = true;
}
export function captureUndoAction(label?: any): any {
  if (!sessionsState.sessionReady || sessionsState.sessionRestoring || !hologramControlsState.undoReady || workspaceHistoryState.undoApplying) return null;
  return {
    label,
    session: sessionsState.activeSession.id,
    epoch: hologramControlsState.workspaceEpoch,
    before: snapshotSession()
  };
}
export function finishUndoAction(action?: any): any {
  if (!action || workspaceHistoryState.undoApplying || action.session !== sessionsState.activeSession?.id || action.epoch !== hologramControlsState.workspaceEpoch) return;
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
/** Persist before generation starts, so an interrupted/refreshed turn can still be undone. */
export function checkpointConversation(label: string): void {
  const action = captureUndoAction(label);
  if (!action) return;
  workspaceHistoryState.undoActions.push({ label, time: Date.now(), before: action.before, after: action.before });
  workspaceHistoryState.undoActions = workspaceHistoryState.undoActions.slice(-10);
  workspaceHistoryState.redoActions = [];
  persistUndo();
}
/** Floor messages have their own undo step, including messages outside main chat. */
export function checkpointFloorMessage(role: string, text: string): void {
  const action = captureUndoAction('floor message');
  if (!action) return;
  // Main chat appends model history before drawing the matching floor message.
  // Restore both views to the same point when that floor message is removed.
  const last = action.before.history?.at(-1);
  if (last && last.role === (role === 'ai' ? 'assistant' : role) && last.content === text) action.before.history.pop();
  workspaceHistoryState.undoActions.push({ label: 'floor message', time: Date.now(), before: action.before, after: action.before });
  workspaceHistoryState.undoActions = workspaceHistoryState.undoActions.slice(-10);
  workspaceHistoryState.redoActions = [];
  persistUndo();
}
export async function applyWorkspaceHistory(redo: any = false): Promise<any> {
  const source: any = redo ? workspaceHistoryState.redoActions : workspaceHistoryState.undoActions,
    target: any = redo ? workspaceHistoryState.undoActions : workspaceHistoryState.redoActions;
  if (redo && !source.length) return {
    ok: false,
    message: redo ? 'Nothing to redo' : 'Nothing to undo'
  };
  if (workspaceHistoryState.undoApplying) throw new Error('Undo/redo already in progress');
  // Old versions stored log-only "main directives" entries after each reply.
  // Ignore those no-ops so they cannot hide the actual conversation checkpoint.
  if (!redo) {
    const currentFingerprint = workspaceFingerprint(snapshotSession());
    while (source.length) {
      const latest = source.at(-1);
      const before = workspaceFingerprint(latest.before);
      if (before === currentFingerprint || (latest.label === 'main directives' && before === workspaceFingerprint(latest.after))) source.pop();
      else break;
    }
    if (!source.length) {
      // Sessions saved before undo checkpoints existed still have a transcript.
      // Build a reversible removal from that persisted data, not from runtime logs.
      const current = snapshotSession();
      if (!current.transcript?.length) {
        persistUndo();
        sessionStatus('Nothing to undo');
        return { ok: false, message: 'Nothing to undo' };
      }
      const before = structuredClone(current);
      const removed = before.transcript.pop();
      const role = removed.role === 'ai' ? 'assistant' : removed.role;
      const strip = (text: string) => String(text).replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/ {2,}/g, ' ').trim();
      const last = before.history?.at(-1);
      if (last?.role === role && strip(last.content) === strip(removed.text)) {
        before.history.pop();
        // An existing summary may contain the removed message; never reuse it.
        before.mainContextState = {};
      }
      source.push({ label: 'saved floor message', time: Date.now(), before, after: current });
    }
  }
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
  workspaceHistoryState.undoStorageKey = (): any => 'luma-actions-' + sessionsState.activeSession.id;
  workspaceHistoryState.undoWorkspace = (): any => applyWorkspaceHistory(false);
  workspaceHistoryState.redoWorkspace = (): any => applyWorkspaceHistory(true);
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
    if (event.composedPath().some(node => {
      if (!(node instanceof Element)) return false;
      // Empty conversation inputs have no text edit to undo; use conversation history.
      if (node instanceof HTMLInputElement && node.matches('input[data-t]') && !node.value) return false;
      return node.matches('input,textarea,select,[role="textbox"]') || (node instanceof HTMLElement && node.isContentEditable);
    })) return;
    if (document.querySelector('dialog[open]') || !sessionsState.sessionReady || sessionsState.sessionRestoring || !hologramControlsState.undoReady) return;
    event.preventDefault();
    if (workspaceHistoryState.undoApplying) return;
    void applyWorkspaceHistory(event.shiftKey || key === 'y').catch(error => sessionStatus('Undo/redo failed: ' + error.message));
  });
}
