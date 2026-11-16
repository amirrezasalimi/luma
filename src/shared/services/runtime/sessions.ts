import { rpc } from '../rpc';
import { flushPreferences } from '../persistence';
import { useRuntimeUI } from '../../../stores/runtime-ui';
/** sessions: runtime implementation. */
import { useRuntimeSettings, settingsChanged } from "../settings";
import { sceneFoundationState } from './scene-foundation';
import { profilesContextState } from './profiles-context';
import { sceneHudState } from './scene-hud';
import { guiNodesState, setStageBackground } from './gui-nodes';
import { holoLabel, hologramControlsState, savedMainArchive } from './hologram-controls';
import { cancelTurn, clearSTTDebounce, voicePipelineState } from './voice-pipeline';
import { panelsWidgetsState, stopPanelMove } from './panels-widgets';
import { workspaceUiState } from './workspace-bridge';
import { cancelQuestions } from './agent-questions';
import { stopMic } from './microphone';
import { agentOrchestratorState } from './agent-orchestrator';
import { scriptApiState } from './script-api';
import { scriptLifecycleState } from './script-lifecycle';
import { killPlaneTxt, objectRendererState } from './object-renderer';

interface ModuleState {
  initialSessionDefaults: any;
  sessionDB: any;
  activeSession: any;
  sessionReady: boolean;
  sessionWriting: boolean;
  sessionAgain: boolean;
  lastSnapshot: string;
  sessionRestoring: boolean;
  savedLabels: any;
  lastSavedSessionState: any;
  lastSavedSessionId: any;
  savedArchiveBlobText: any;
  savedArchiveBlob: any;
  sessionSaveDebug: any;
}

export const sessionsState = {} as ModuleState;

export function sessionStatus(text?: any): any {
  useRuntimeSettings.setState({
    sessionStatus: text
  });
  if (/failed|unavailable|not being saved|blocked/i.test(text)) {
    useRuntimeUI.setState({ storageWarning: String(text) });
  } else if (text.startsWith('Saved ')) useRuntimeUI.setState({ storageWarning: '' });
}
export async function commitSession(record: any): Promise<void> {
  await flushPreferences();
  await rpc.persistence.commit({ sessions: [record], meta: [{ key: 'active', id: record.id }] });
}
export async function sessionRequest(store: 'sessions' | 'meta', key: string): Promise<any> {
  return rpc.persistence.get({ store, key });
}
export function sessionPlain(value?: any): any {
  const holder: any = {
      value: null
    },
    jobs: any = [{
      parent: holder,
      key: 'value',
      value,
      ancestors: [],
      depth: 0
    }];
  while (jobs.length) {
    const job: any = jobs.pop(),
      v: any = job.value,
      type: any = typeof v;
    if (v === null || type === 'string' || type === 'boolean') {
      job.parent[job.key] = v;
      continue;
    }
    if (type === 'number') {
      job.parent[job.key] = Number.isFinite(v) ? v : null;
      continue;
    }
    if (type === 'bigint') {
      job.parent[job.key] = String(v);
      continue;
    }
    if (type !== 'object') continue;
    if (job.ancestors.includes(v)) {
      job.parent[job.key] = '[Circular reference]';
      continue;
    }
    if (job.depth >= 80) {
      job.parent[job.key] = '[Maximum snapshot depth]';
      continue;
    }
    if (v instanceof Date) {
      job.parent[job.key] = Number.isFinite(v.getTime()) ? v.toISOString() : null;
      continue;
    }
    const source: any = v instanceof Set ? [...v] : v instanceof Map ? [...v] : v,
      out: any = Array.isArray(source) ? [] : {};
    job.parent[job.key] = out;
    const ancestors: any = job.ancestors.concat([v]);
    for (const key of Object.keys(source)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      const descriptor: any = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !('value' in descriptor)) continue;
      jobs.push({
        parent: out,
        key,
        value: descriptor.value,
        ancestors,
        depth: job.depth + 1
      });
    }
  }
  return holder.value;
}
export function snapshotSession(raw: any = false): any {
  const snapshot: any = {
    version: 1,
    background: sceneFoundationState.stageBackground.config,
    counters: {
      oid: profilesContextState.oid,
      pid: profilesContextState.pid,
      aid: profilesContextState.aid,
      gid: guiNodesState.gid,
      hlid: hologramControlsState.hlid
    },
    preferences: {
      muted: voicePipelineState.muted
    },
    camera: sceneFoundationState.cam,
    cameraVersion: 2,
    sceneDefaults: profilesContextState.DEF,
    palettes: {
      P: sceneFoundationState.P.map((v?: any, i?: any): any => i >= 4 && i < 8 ? sceneHudState.abgr(sceneHudState.mixc(sceneHudState.GR[i - 4], sceneHudState.GR[i - 4], 0)) : v),
      HZ: sceneHudState.GH.map((v?: any): any => sceneHudState.abgr(sceneHudState.mixc(v, v, 0))),
      GR: [...sceneHudState.GR],
      CYr: [...sceneHudState.CYr],
      GH: [...sceneHudState.GH],
      CHz: [...sceneHudState.CHz]
    },
    hologram: {
      ...sceneFoundationState.holoGet(),
      ...{
        x: sceneFoundationState.HT.x,
        y: sceneFoundationState.HT.y,
        z: sceneFoundationState.HT.z,
        radius: sceneFoundationState.HT.r,
        floorRadius: sceneFoundationState.HT.sr,
        ringSpeakingColor: '#' + sceneFoundationState.TCs.toString(16).padStart(6, '0')
      }
    },
    labels: sessionsState.savedLabels(sceneFoundationState.HLB),
    hiddenLabels: [...sceneFoundationState.HLH],
    labelText: [...sceneFoundationState.HLT],
    history: voicePipelineState.hist,
    main: {
      log: hologramControlsState.MAIN.log,
      archiveJSON: savedMainArchive(),
      open: hologramControlsState.MAIN.open
    },
    mainContextState: profilesContextState.mainContextState,
    transcript: voicePipelineState.LOG.map((x?: any): any => ({
      role: x.transcriptRole,
      text: x.transcriptText ?? x.text ?? ''
    })),
    talkTo: sceneFoundationState.talkTo,
    selection: profilesContextState.sel,
    objects: [...profilesContextState.O.values()].filter((o?: any): any => !o.dying).map((o?: any): any => ({
      id: o.id,
      kind: o.kind,
      by: o.by,
      parent: o.parent,
      ...o.t,
      color: o.color,
      border: o.border,
      fill: o.fill,
      fillA: o.fillA,
      bw: o.bw,
      fs: o.fs,
      n: o.n,
      spin: o.spin,
      rot: o.r,
      vis: o.vis,
      head: o.head,
      text: o.text,
      from: o.from,
      to: o.to,
      vars: o.vars,
      scripts: o.scripts.map((s?: any): any => ({
        name: s.name,
        src: s.src,
        by: s.by,
        err: s.err,
        autoResume: !!s.autoResume
      }))
    })),
    panels: [...profilesContextState.PN.values()].map((q?: any): any => ({
      id: q.id,
      by: q.by,
      title: profilesContextState.$$('.pt', q.node).textContent,
      text: profilesContextState.$$('.pb', q.node).innerText,
      side: q.node.parentElement === panelsWidgetsState.pl ? 'left' : 'right',
      corner: q.corner,
      floating: q.node.classList.contains('fl'),
      left: q.node.offsetLeft,
      top: q.node.offsetTop,
      width: q.node.style.width,
      height: q.node.style.height,
      size: q.size,
      widget: q.widget,
      collapsed: q.node.classList.contains('c'),
      scroll: q.node.querySelector('.bd')?.scrollTop || 0
    })),
    gui: [...guiNodesState.GU.values()].map((g?: any): any => ({
      id: g.id,
      type: g.type,
      panel: g.panel,
      parent: g.parent,
      by: g.by,
      p: {
        ...g.p,
        ...(guiNodesState.GFORM.includes(g.type) ? {
          value: guiNodesState.gval(g)
        } : g.type === 'toggle' ? {
          checked: guiNodesState.gval(g)
        } : {})
      },
      vars: g.vars,
      actions: g.actions || {},
      err: g.err
    })),
    agents: [...profilesContextState.AG.values()].map((a?: any): any => {
      const {
        ctl,
        tms,
        waiters,
        labels,
        debugRequest,
        onlineSince,
        speechLevel,
        speaking,
        think,
        running,
        tm,
        E,
        spawnA,
        sx,
        sy,
        sr,
        beamT,
        beamTo,
        r,
        pos,
        ...rest
      }: any = a;
      return {
        ...rest,
        r: a.rt ?? r,
        pos: {
          ...(a.tp || pos)
        },
        labels: sessionsState.savedLabels(labels)
      };
    }),
    ui: {
      mainOpen: hologramControlsState.MAIN.open,
      panels: [workspaceUiState.agp, workspaceUiState.tlp].filter(Boolean).map((n?: any): any => ({
        collapsed: n.classList.contains('c')
      }))
    }
  };
  return raw ? snapshot : sessionPlain(snapshot);
}
// Compare live persistent values before cloning large histories. Never traverse string contents.
export function sessionMatchesSaved(value?: any, saved?: any, ancestors: any = [], depth: any = 0): any {
  if (value === saved) return true;
  if (typeof value === 'number') return !Number.isFinite(value) && saved === null;
  if (typeof value === 'bigint') return String(value) === saved;
  if (value === null || typeof value !== 'object') return false;
  if (ancestors.includes(value)) return saved === '[Circular reference]';
  if (depth >= 80) return saved === '[Maximum snapshot depth]';
  if (value instanceof Date) return (Number.isFinite(value.getTime()) ? value.toISOString() : null) === saved;
  const source: any = value instanceof Set ? [...value] : value instanceof Map ? [...value] : value;
  if (!saved || typeof saved !== 'object' || Array.isArray(source) !== Array.isArray(saved)) return false;
  const keys: any = Object.keys(source).filter((k?: any): any => !['__proto__', 'prototype', 'constructor'].includes(k) && Object.getOwnPropertyDescriptor(source, k)?.value !== undefined && typeof Object.getOwnPropertyDescriptor(source, k)?.value !== 'function' && typeof Object.getOwnPropertyDescriptor(source, k)?.value !== 'symbol');
  if (keys.length !== Object.keys(saved).length) return false;
  const next: any = ancestors.concat([value]);
  return keys.every((k?: any): any => Object.prototype.hasOwnProperty.call(saved, k) && sessionMatchesSaved(Object.getOwnPropertyDescriptor(source, k)?.value, saved[k], next, depth + 1));
}
export async function listSessions(): Promise<any> {
  return rpc.persistence.listSessions();
}
export async function refreshSessionList(): Promise<any> {
  settingsChanged();
}
export function sessionStorageSnapshot(snapshot: any): any { return snapshot; }

export async function saveSession(force: any = false): Promise<any> {
  if (!sessionsState.sessionReady || sessionsState.sessionRestoring) return;
  if (sessionsState.sessionWriting) {
    sessionsState.sessionSaveDebug.queued++;
    if (!force) return;
    await new Promise((resolve?: any): any => {
      const wait: any = (): any => sessionsState.sessionWriting ? setTimeout(wait, 20) : resolve();
      wait();
    });
    return saveSession(force);
  }
  sessionsState.sessionWriting = true;
  sessionsState.sessionSaveDebug.attempts++;
  const sample: any = {
      atUptimeMs: performance.now(),
      forced: force
    },
    phase: any = (name?: any): any => {
      sessionsState.sessionSaveDebug.phase = name;
      sessionsState.sessionSaveDebug.phaseStarted = performance.now();
    };
  try {
    phase('comparePersistent');
    const raw: any = snapshotSession(true);
    let matches: any = !force && sessionsState.activeSession.id === sessionsState.lastSavedSessionId && !!sessionsState.lastSavedSessionState;
    sample.comparedSections = [];
    if (matches) for (const key of Object.keys(raw)) {
      const started: any = performance.now(),
        equal: any = sessionMatchesSaved(raw[key], sessionsState.lastSavedSessionState[key]);
      sample.comparedSections.push({
        section: key,
        ms: performance.now() - started,
        equal
      });
      if (!equal) {
        sample.firstChangedSection = key;
        matches = false;
        break;
      }
    }
    sample.comparePersistentMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    if (matches) {
      sessionsState.sessionSaveDebug.unchanged++;
      sample.skipped = true;
      return;
    }
    phase('snapshot');
    const snapshot: any = {};
    sample.snapshotSections = [];
    for (const key of Object.keys(raw)) {
      const started: any = performance.now();
      snapshot[key] = sessionPlain(raw[key]);
      sample.snapshotSections.push({
        section: key,
        ms: performance.now() - started
      });
    }
    sample.snapshotMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    phase('stringify');
    const encoded: any = JSON.stringify(snapshot, (key?: any, value?: any): any => key === 'archiveJSON' ? {
      archiveRevision: hologramControlsState.mainArchiveCache.length
    } : value);
    sample.stringifyMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    sessionsState.sessionSaveDebug.snapshotCharacters = encoded.length + (snapshot.main?.archiveJSON?.length || 0);
    phase('compare');
    const unchanged: any = !force && encoded === sessionsState.lastSnapshot;
    sample.compareMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    if (unchanged) {
      sessionsState.sessionSaveDebug.unchanged++;
      sample.skipped = true;
      return;
    }
    phase('archiveBlob');
    const storedSnapshot: any = sessionStorageSnapshot(snapshot);
    sample.archiveBlobMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    const record: any = {
      ...sessionsState.activeSession,
      updatedAt: Date.now(),
      snapshot: storedSnapshot
    };
    phase('sqlite');
    let submitStarted: any = 0;
    submitStarted = performance.now();
    await commitSession(record);
    sample.sqliteCommitMs = performance.now() - submitStarted;
    sample.sqliteTotalMs = performance.now() - sessionsState.sessionSaveDebug.phaseStarted;
    sessionsState.sessionSaveDebug.writes++;
    sessionsState.activeSession = record;
    sessionsState.lastSnapshot = encoded;
    sessionsState.lastSavedSessionState = snapshot;
    sessionsState.lastSavedSessionId = record.id;
    sessionStatus('Saved ' + record.name + ' · ' + new Date(record.updatedAt).toLocaleTimeString());
  } catch (e: any) {
    sessionsState.sessionSaveDebug.failures++;
    sample.failedPhase = sessionsState.sessionSaveDebug.phase;
    sessionStatus('Session save failed: ' + e.message + ' — do not close this page');
    throw e;
  } finally {
    sample.totalMs = performance.now() - sample.atUptimeMs;
    sessionsState.sessionSaveDebug.samples.push(sample);
    if (sessionsState.sessionSaveDebug.samples.length > 30) sessionsState.sessionSaveDebug.samples.shift();
    sessionsState.sessionSaveDebug.phase = 'idle';
    sessionsState.sessionWriting = false;
    sessionsState.sessionAgain = false;
  }
}
export function stopSessionWork(): any {
  cancelQuestions();
  hologramControlsState.workspaceEpoch++;
  cancelTurn(false);
  stopMic();
  sceneFoundationState.mode = 'idle';
  sceneFoundationState.lab.text = 'TAP THE CORE TO SPEAK';
  clearSTTDebounce();
  clearTimeout(agentOrchestratorState.notifyT);
  agentOrchestratorState.notifyQ.length = 0;
  for (const c of scriptApiState.codeRequests) c.abort();
  for (const a of profilesContextState.AG.values()) agentOrchestratorState.stopA(a);
  scriptApiState.JT.forEach((t?: any): any => t.c?.());
  scriptApiState.JT.clear();
  scriptLifecycleState.TW.length = 0;
}
export function clearSessionStage(): any {
  setStageBackground(null);
  for (const o of profilesContextState.O.values()) for (const s of o.scripts) scriptLifecycleState.clr(s);
  profilesContextState.O.clear();
  for (const [k, t] of objectRendererState.TP) {
    t.destroy();
  }
  objectRendererState.TP.clear();
  for (const [k, t] of objectRendererState.ATP) {
    t.destroy();
  }
  objectRendererState.ATP.clear();
  for (const q of profilesContextState.PN.values()) {
    q.widgetPort?.close();
    stopPanelMove(q);
    panelsWidgetsState.panelSizes.unobserve(q.node);
    q.node.remove();
  }
  profilesContextState.PN.clear();
  for (const g of guiNodesState.GU.values()) {
    g.tm.forEach((t?: any): any => t.c?.());
    g.el.remove();
  }
  guiNodesState.GU.clear();
  for (const a of profilesContextState.AG.values()) {
    a.tms.forEach((t?: any): any => t.c?.());
    killPlaneTxt('ag_' + a.id);
  }
  profilesContextState.AG.clear();
  voicePipelineState.hist.length = 0;
  profilesContextState.mainContextState = {};
  hologramControlsState.MAIN.log.length = 0;
  hologramControlsState.MAIN.archive.length = 0;
  hologramControlsState.mainArchiveCache.source = null;
  hologramControlsState.mainArchiveCache.length = 0;
  hologramControlsState.mainArchiveCache.json = '[]';
  delete hologramControlsState.MAIN.debugRequest;
  for (const l of voicePipelineState.LOG) l.destroy?.();
  voicePipelineState.LOG.length = 0;
  sceneFoundationState.HLB.clear();
  sceneFoundationState.HLH.clear();
  sceneFoundationState.HLT.clear();
  profilesContextState.sel = null;
  sceneFoundationState.talkTo = null;
  sceneFoundationState.talkName = '';
  profilesContextState.oid = profilesContextState.pid = profilesContextState.aid = guiNodesState.gid = hologramControlsState.hlid = 0;
}
export function restoreLabels(items?: any, ag?: any): any {
  for (const h of items || []) {
    const {
      actionSource,
      actionFunction,
      ...p
    }: any = h;
    holoLabel('add', null, p, ag?.name || 'luma', ag);
    const label: any = (ag ? ag.labels : sceneFoundationState.HLB).get(p.id);
    if (label && actionSource) {
      label.actionSource = actionSource;
      label.actionFunction = actionFunction;
      label.pendingAction = true;
    }
  }
}
export function prepareSessionState(): void {
  sessionsState.initialSessionDefaults = {
    camera: {
      ...sceneFoundationState.cam
    },
    sceneDefaults: {
      ...profilesContextState.DEF
    },
    palettes: {
      P: [...sceneFoundationState.P],
      HZ: [...sceneFoundationState.HZ],
      GR: [...sceneHudState.GR],
      CYr: [...sceneHudState.CYr],
      GH: [...sceneHudState.GH],
      CHz: [...sceneHudState.CHz]
    }
  };
  sessionsState.sessionDB = null;
  sessionsState.activeSession = null;
  sessionsState.sessionReady = false;
  sessionsState.sessionWriting = false;
  sessionsState.sessionAgain = false;
  sessionsState.lastSnapshot = '';
  sessionsState.sessionRestoring = false;
  sessionsState.savedLabels = (B?: any): any => [...B.values()].map((h?: any): any => ({
    id: h.id,
    text: h.text,
    angle: h.a,
    y: h.y,
    radius: h.r,
    speed: h.speed,
    color: h.hex,
    actionSource: h.actionSource,
    actionFunction: h.actionFunction
  }));
  sessionsState.lastSavedSessionState = null;
  sessionsState.lastSavedSessionId = null;
  sessionsState.savedArchiveBlobText = null;
  sessionsState.savedArchiveBlob = null;
  sessionsState.sessionSaveDebug = {
    attempts: 0,
    writes: 0,
    unchanged: 0,
    queued: 0,
    failures: 0,
    samples: [],
    phase: 'idle',
    phaseStarted: 0,
    snapshotCharacters: 0
  };
}
