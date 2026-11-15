import { host } from '../host';
import { updateScriptUI, useRuntimeUI } from '../../../stores/runtime-ui';
/** script-api: runtime implementation. */
import { saveSession, sessionsState } from './sessions';
import { getAgentProfile, profileTarget, profilesContextState, updateAgentProfile, updateSoul, updateSoulSettings } from './profiles-context';
import { addObj, delAll, delObj, sceneObjectsState } from './scene-objects';
import { HD, attach, build, detach, exp, fail, scriptLifecycleState, unmountS } from './script-lifecycle';
import { holoApply, holoH, hologramControlsState, logM, resetHologramSetting, wrapLog } from './hologram-controls';
import { sceneFoundationState } from './scene-foundation';
import { mainOrchestratorState } from './main-orchestrator';
import { logA, notifyJarvis, spawn, tell } from './agent-orchestrator';
import { addGui, delGui, guiNodesState, setStageBackground } from './gui-nodes';
import { act, scene, dumpObject } from './scene-actions';
import { HG, guiNodes2State } from './gui-handles';
import { addPanel, delPanel, inspectWidget, layoutPanels, movePanel, panelBounds, panelWidget, panelsWidgetsState, updPanel } from './panels-widgets';
import { agentConversationsState, agentVoice, askMain, setTalk, ttsQ, voicesList, waitA } from './agent-conversations';
import { voicePipelineState } from './voice-pipeline';
import { renderAg } from './workspace-bridge';
import { integrationsState, mcpCall } from './integrations';
import { agentQuestionsState, askUser, installRemoteMcp, installRemoteSkill } from './agent-questions';
import { workspaceHistoryState } from './workspace-history';

interface ModuleState {
  JT: any;
  scriptManagerOwner: string;
  codeHost: any;
  codeRequests: any;
}

export const scriptApiState = {} as ModuleState;

export function persistScriptChanges(): any {
  try {
    if (sessionsState.sessionReady && !sessionsState.sessionRestoring) saveSession(true).catch((e?: any): any => console.error('Script save failed:', e));
  } catch (e: any) {
    if (!(e instanceof ReferenceError)) console.error('Script save failed:', e);
  }
}
export function managedScriptNode(owner?: any): any {
  return [...profilesContextState.O.values()].find((o?: any): any => o.vars?.managedScriptsOwner === owner);
}
export function saveAgentScript(owner?: any, name?: any, source?: any): any {
  if (typeof source !== 'string' || source.length > 64000) throw new Error('Script source must be at most 64000 characters');
  name = String(name || 'main').slice(0, 24);
  let o: any = managedScriptNode(owner);
  if (!o) o = addObj({
    kind: 'node',
    vars: {
      managedScriptsOwner: owner
    }
  }, owner);
  const s: any = attach(o, name, source, owner);
  s.autoResume = true;
  persistScriptChanges();
  hologramControlsState.actLog(owner, 'script saved/replaced: ' + name);
  return {
    name,
    nodeId: o.id,
    error: s.err ? scriptLifecycleState.errTxt(s.err) : null
  };
}
export function openScriptManager(owner?: any): any {
  scriptApiState.scriptManagerOwner = owner;
  updateScriptUI({ open: true, owner, editNode: null, name: '', source: '',
    status: 'Named scripts save with this session. Updating source restarts that script.' });
  renderScriptManager();
}
export function renderScriptManager(): any {
  const owner: any = scriptApiState.scriptManagerOwner,
    rows: any = agentScripts(owner),
    a: any = mainOrchestratorState.findA(owner),
    tasks: any = a?.tms || scriptApiState.JT;
  updateScriptUI({ rows, callbacks: tasks.size,
    frames: [...tasks].filter((t: any) => t.kind === 'frame').length,
    intervals: [...tasks].filter((t: any) => t.kind === 'interval').length });
}
export function agentScripts(owner?: any): any {
  return [...profilesContextState.O.values()].flatMap((o?: any): any => o.scripts.filter((s?: any): any => s.by === owner).map((s?: any): any => ({
    nodeId: o.id,
    name: s.name,
    source: s.src,
    status: s.suspended ? 'paused' : s.err ? 'error' : 'active',
    callbacks: s.tm.size,
    autoResume: !!s.autoResume,
    error: s.err ? scriptLifecycleState.errTxt(s.err) : null
  })));
}
export function controlAgentScript(owner?: any, nodeId?: any, name?: any, action?: any): any {
  const o: any = profilesContextState.O.get(String(nodeId)),
    s: any = o?.scripts.find((s?: any): any => s.name === name && s.by === owner);
  if (!s) throw new Error('No owned script ' + name);
  if (action === 'remove') detach(o, name);else if (action === 'stop') {
    unmountS(o, s);
    s.suspended = true;
    s.autoResume = false;
  } else if (action === 'start') {
    build(o, s);
    s.autoResume = true;
  } else throw new Error('Unknown script action');
  persistScriptChanges();
  hologramControlsState.actLog(owner, 'script ' + action + ': ' + name);
  return {
    ok: true
  };
}
export async function refreshCodeHost(): Promise<any> {
  try {
    scriptApiState.codeHost = await host.codeStatus();
  } catch (e: any) {
    scriptApiState.codeHost = {
      enabled: false,
      error: e.message
    };
  }
  return scriptApiState.codeHost;
}
export async function codeCall(op?: any, args: any = {}, ag: any = null): Promise<any> {
  if (!profilesContextState.ext.code) throw new Error('Code agent is disabled in Settings');
  if (!scriptApiState.codeHost?.enabled) throw new Error('Host tools unavailable. Enable Code Agent in Settings.');
  const controller: any = new AbortController();
  scriptApiState.codeRequests.add(controller);
  const signal: any = ag?.ctl ? AbortSignal.any([controller.signal, ag.ctl.signal]) : controller.signal;
  const who: any = ag ? ag.name : 'jarvis',
    label: any = 'host ' + op + ' ' + String(args.path || args.command || '.').slice(0, 100);
  if (ag) logA(ag, label);else logM(label);
  try {
    const r = await host.codeExecute({ ...args, op }, signal);
    const result = r.data;
    if (r.status >= 400) throw new Error(('error' in result && result.error?.message) || 'Host tool failed: ' + r.status);
    if (!ag) notifyJarvis({
      name: 'jarvis-host',
      id: 'host',
      task: label
    }, 'RESULT', JSON.stringify(result).slice(0, 16000));
    return result;
  } catch (e: any) {
    if (!ag) notifyJarvis({
      name: 'jarvis-host',
      id: 'host',
      task: label
    }, 'FAILED', e.message);
    throw e;
  } finally {
    scriptApiState.codeRequests.delete(controller);
  }
}
export function mkApi(x?: any): any {
  const apiEpoch: any = hologramControlsState.workspaceEpoch;
  const by: any = x.by || 'user',
    own: any = x.s ? x.s.tm : x.tm,
    h: any = (id?: any): any => {
      const o: any = profilesContextState.O.get(String(id && id.id || id));
      return o ? HD(o, by) : null;
    };
  const grp: any = (a?: any): any => {
    for (const m of ['set', 'tween', 'animate', 'remove', 'attach', 'detach']) Object.defineProperty(a, m, {
      value: (...r: any): any => a.map((n?: any): any => n[m](...r)),
      enumerable: false
    });
    return a;
  };
  const flt: any = (f?: any): any => {
    const l: any = [...profilesContextState.O.values()].filter((o?: any): any => !o.dying);
    return grp((!f ? l : typeof f === 'function' ? l.filter((o?: any): any => f(HD(o, by))) : l.filter((o?: any): any => Object.keys(f).every((k?: any): any => o[k] === f[k]))).map((o?: any): any => HD(o, by)));
  };
  const wt: any = (ms?: any, fn?: any): any => new Promise((r?: any): any => {
    const t: any = {
        c: 0
      },
      i: any = setTimeout((): any => {
        own.delete(t);
        fn && fn();
        r();
      }, ms);
    t.c = (): any => clearTimeout(i);
    own.add(t);
  });
  const every: any = (ms?: any, fn?: any): any => {
    if (!x.s && !x.widget) throw new Error('Persistent animation requires a named script. Use await save_script("animation", source) and put every()/frame() inside that source; loose command callbacks are not saved.');
    const t: any = {
        kind: 'interval',
        c: 0
      },
      i: any = setInterval((): any => {
        try {
          withFrameUpdate(() => fn());
        } catch (e: any) {
          x.s ? fail(x.o, x.s, 'every', e) : console.error(e);
        }
      }, ms);
    t.c = (): any => clearInterval(i);
    own.add(t);
    return (): any => {
      t.c();
      own.delete(t);
    };
  };
  const cameraState: any = (): any => ({
    yaw: sceneFoundationState.cam.yaw,
    rotation: sceneFoundationState.cam.yaw,
    zoom: sceneFoundationState.cam.zoom,
    px: sceneFoundationState.cam.px,
    py: sceneFoundationState.cam.py
  });
  const setCamera: any = (patch?: any): any => {
    if (apiEpoch !== hologramControlsState.workspaceEpoch) throw new Error('This camera belongs to an inactive session');
    if (!patch || typeof patch !== 'object') throw new Error('Camera patch must be an object');
    const next: any = {};
    for (const [key, value] of Object.entries<any>(patch)) {
      const k: any = key === 'rotation' ? 'yaw' : key;
      if (!['yaw', 'zoom', 'px', 'py'].includes(k)) throw new Error('Unknown camera field: ' + key);
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Camera ' + key + ' must be a finite number');
      next[k] = k === 'zoom' ? Math.max(.4, Math.min(3, value)) : value;
    }
    Object.assign(sceneFoundationState.cam, next);
    return cameraState();
  };
  const cameraHandle: any = {};
  for (const k of ['yaw', 'rotation', 'zoom', 'px', 'py']) Object.defineProperty(cameraHandle, k, {
    enumerable: true,
    get: (): any => cameraState()[k],
    set: (value?: any): any => setCamera({
      [k]: value
    })
  });
  const frame: any = (fn?: any): any => {
    if (!x.s && !x.widget) throw new Error('Persistent animation requires a named script. Use await save_script("animation", source) with frame() or update(delta) inside that source; loose command callbacks are not saved.');
    if (typeof fn !== 'function') throw new Error('frame requires a callback');
    let last: any = performance.now(),
      running: any = true;
    const task: any = {
        kind: 'frame',
        c: (): any => {
          if (!running) return;
          running = false;
          sceneFoundationState.app.ticker.remove(tick);
          own.delete(task);
        }
      },
      tick: any = (): any => {
        if (!running) return;
        if (apiEpoch !== hologramControlsState.workspaceEpoch) {
          task.c();
          return;
        }
        const now: any = performance.now(),
          delta: any = Math.min(.1, (now - last) / 1000);
        last = now;
        try {
          withFrameUpdate(() => fn(delta));
        } catch (e: any) {
          task.c();
          if (x.s) fail(x.o, x.s, 'frame', e);else console.error('Frame callback failed:', e);
        }
      };
    own.add(task);
    sceneFoundationState.app.ticker.add(tick);
    return task.c;
  };
  const J: any = {
    save_script: async (name?: any, source?: any): Promise<any> => {
      const result: any = saveAgentScript(by, name, source);
      await saveSession(true);
      return {
        ...result,
        saved: sessionsState.sessionReady
      };
    },
    list_scripts: (): any => agentScripts(by),
    remove_script: (nodeId?: any, name?: any): any => controlAgentScript(by, nodeId, name, 'remove'),
    stop_script: (nodeId?: any, name?: any): any => controlAgentScript(by, nodeId, name, 'stop'),
    start_script: (nodeId?: any, name?: any): any => controlAgentScript(by, nodeId, name, 'start'),
    frame,
    get camera() {
      return cameraHandle;
    },
    get_camera: cameraState,
    set_camera: setCamera,
    reset_camera: (): any => setCamera({
      yaw: .6,
      zoom: 1,
      px: 0,
      py: 0
    }),
    self: x.o ? HD(x.o, by) : null,
    getNode: h,
    getNodes: flt,
    all: flt,
    add: (p?: any): any => HD(addObj(sceneObjectsState.rmap(p && (p.kind || p.shape) || 'cube', p || {}), by), by),
    del: (id?: any): any => delObj(String(id && id.id || id)),
    clear: (): any => {
      delAll(by === 'user' ? '' : by);
      guiNodesState.clearGui(by);
    },
    tween: (t?: any, p?: any, o?: any, e?: any): any => {
      const n: any = h(t);
      return n && n.tween(p, o, e);
    },
    animate: (t?: any, n?: any, o?: any): any => {
      const q: any = h(t);
      return q && q.animate(n, o);
    },
    wait: wt,
    every,
    exportVars: (d?: any): any => exp(x, d),
    rand: (a: any = 0, b: any = 1): any => a + Math.random() * (b - a),
    now: (): any => sceneFoundationState.tm,
    get world() {
      return hologramControlsState.worldObj();
    },
    get holo() {
      return hologramControlsState.worldObj().holo;
    },
    get floor() {
      return hologramControlsState.worldObj().floor;
    },
    get agents() {
      return hologramControlsState.worldObj().agents;
    },
    get me() {
      return x.ag ? hologramControlsState.agInfo(x.ag) : null;
    },
    log: (...a: any): any => {
      const t: any = a.map((v?: any): any => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ');
      if (x.out) x.out.push(t);
      const ag: any = x.ag || mainOrchestratorState.findA(by);
      if (ag) logA(ag, '› ' + t.slice(0, 160));else if (by === 'jarvis') logM('› ' + t.slice(0, 160));
    },
    scene,
    dump: (id?: any): any => id ? dumpObject(profilesContextState.O.get(String(id))) : [...profilesContextState.O.values()].map(dumpObject),
    panel: (p?: any): any => guiNodes2State.HP(profilesContextState.PN.get(addPanel(p || {}, by)), by),
    getPanel: (id?: any): any => {
      const q: any = profilesContextState.PN.get(String(id && id.id || id));
      return q ? guiNodes2State.HP(q, by) : null;
    },
    panels: (): any => [...profilesContextState.PN.values()].map((q?: any): any => guiNodes2State.HP(q, by)),
    inspect_panel_widget: (id?: any): any => inspectWidget(id),
    widget_components: (): any => ({
      ...panelsWidgetsState.WIDGET_COMPONENTS
    }),
    panel_widget: (id?: any, spec?: any): any => panelWidget(id, spec),
    update_panel_widget: (id?: any, patch?: any): any => {
      const q: any = profilesContextState.PN.get(String(id?.id || id));
      if (!q?.widget) throw new Error('No widget in panel ' + id);
      if (!patch || typeof patch !== 'object') throw new Error('Widget patch must be an object');
      return panelWidget(q.id, {
        ...q.widget,
        ...patch
      });
    },
    delete_panel_widget: (id?: any): any => panelWidget(id, null),
    get_panel_widget: (id?: any): any => {
      const q: any = profilesContextState.PN.get(String(id?.id || id));
      return q?.widget ? {
        ...q.widget
      } : null;
    },
    layout_panels: (options?: any): any => layoutPanels(options),
    panel_bounds: (): any => [...profilesContextState.PN.values()].map((q?: any): any => ({
      id: q.id,
      ...panelBounds(q)
    })),
    set_background_image: (src?: any, options?: any): any => setStageBackground(src, options),
    remove_background_image: (): any => setStageBackground(null),
    get_background_image: (): any => ({
      ...sceneFoundationState.stageBackground.config
    }),
    panelUpdate: (p?: any): any => updPanel(String(p.id), p),
    panelDel: (id?: any): any => delPanel(String(id && id.id || id)),
    panelMove: (id?: any, pos?: any, o?: any): any => movePanel(String(id && id.id || id), pos, o),
    gui: (a?: any, b?: any): any => HG(addGui(b === undefined ? a : {
      ...b,
      panel: String(a && a.id || a)
    }, by), by),
    getGui: (id?: any): any => {
      const g: any = guiNodesState.GU.get(String(id && id.id || id));
      return g ? HG(g, by) : null;
    },
    guiUpdate: (id?: any, p?: any): any => {
      const g: any = guiNodesState.GU.get(String(id && id.id || id));
      if (!g) throw new Error('no gui ' + id);
      guiNodesState.setGui(g, p);
      return HG(g, by);
    },
    guiDel: (id?: any): any => delGui(String(id && id.id || id)),
    // voiceName is optional: omit it (or pass null) for the voice chosen in Settings; {voice:"name"} also works
    speak_tts: (t?: any, v?: any): any => {
      const p: any = ttsQ(t, v && typeof v === 'object' ? v.voice : v, x.ag || mainOrchestratorState.findA(by) || null);
      p.catch((e?: any): any => {
        if (e.name !== 'AbortError') console.warn('TTS:', e);
      });
      return v && typeof v === 'object' && v.wait ? p : {
        queued: true
      };
    },
    getVoicesLists: async (): Promise<any> => ({
      ...(await voicesList()),
      current: voicePipelineState.profileVoice(x.ag || mainOrchestratorState.findA(by)) || 'default',
      muted: voicePipelineState.profileMuted(x.ag || mainOrchestratorState.findA(by))
    }),
    get_agent_profile: (t?: any): any => getAgentProfile(profileTarget(t, x, by)),
    update_agent_profile: (t?: any, p?: any): any => {
      if (p === undefined && t && typeof t === 'object' && !t.id) {
        p = t;
        t = undefined;
      }
      return updateAgentProfile(profileTarget(t, x, by), p);
    },
    set_agent_voice: (t?: any, v?: any): any => {
      if (v === undefined) {
        v = t;
        t = undefined;
      }
      return updateAgentProfile(profileTarget(t, x, by), {
        voice: v
      });
    },
    mute_agent: (t?: any, m: any = true): any => updateAgentProfile(profileTarget(t, x, by), {
      muted: m
    }),
    // holograms: hologram(target?) handle for the main hologram or any sub-agent; the shortcuts act on main unless the last arg names a target
    get_active_agent: (): any => ({
      id: sceneFoundationState.talkTo || 'main',
      name: sceneFoundationState.talkName || 'JARVIS'
    }),
    switch_agent: (target?: any): any => {
      const name: any = String(target?.id ?? target ?? 'main').trim(),
        main: any = /^(main|jarvis)$/i.test(name),
        a: any = main ? null : mainOrchestratorState.findA(name);
      if (!main && !a) throw new Error('No agent ' + name);
      setTalk(a?.id || null);
      if (a) {
        a.open = true;
        renderAg();
      }
      return {
        id: a?.id || 'main',
        name: a?.name || 'JARVIS',
        switched: true
      };
    },
    reset_hologram_setting: (t?: any): any => resetHologramSetting(t, x, by),
    hologram: (t?: any): any => holoH(t, x, by),
    holograms: (): any => ['main', ...[...profilesContextState.AG.values()].map((a?: any): any => a.name)],
    set_hologram: (p?: any): any => holoH(p && p.target != null ? p.target : 'main', x, by).set(p),
    get_hologram: (t?: any): any => holoH(t ?? 'main', x, by).get(),
    change_floor_radius: (v?: any): any => holoApply({
      floorRadius: v
    }, 1),
    change_floor_color: (c?: any): any => holoApply({
      floorColor: c
    }),
    change_floor_grid: (n?: any): any => holoApply({
      floorGrid: n
    }),
    change_hologram_radius: (v?: any, t?: any): any => holoH(t ?? 'main', x, by).radius(v),
    change_hologram_inside_color: (c?: any, sc?: any, t?: any): any => holoH(t ?? 'main', x, by).color(c, sc),
    change_hologram_ring_color: (c?: any, sc?: any): any => holoApply({
      ringColor: c,
      ringSpeakingColor: sc
    }),
    change_hologram_pos: (a?: any, y?: any, z?: any, t?: any): any => a && typeof a === 'object' ? holoH(y ?? 'main', x, by).pos(a) : holoH(t ?? 'main', x, by).pos(a, y, z),
    get_hologram_pos: (t?: any): any => holoH(t ?? 'main', x, by).getPos(),
    add_holo_label: (p?: any, t?: any): any => holoH(t ?? (p && p.target) ?? 'main', x, by).addLabel(p),
    update_holo_label: (id?: any, p?: any, t?: any): any => holoH(t ?? 'main', x, by).updateLabel(id, p),
    remove_holo_label: (id?: any, t?: any): any => holoH(t ?? 'main', x, by).removeLabel(id),
    get_holo_labels: (t?: any): any => holoH(t ?? 'main', x, by).labels(),
    reset_holo_labels: (t?: any): any => holoH(t ?? 'main', x, by).resetLabels(),
    code_list: (path: any = '.'): any => codeCall('list', {
      path
    }, x.ag),
    code_read: (path?: any): any => codeCall('read', {
      path
    }, x.ag),
    code_write: (path?: any, content?: any): any => codeCall('write', {
      path,
      content
    }, x.ag),
    code_edit: (path?: any, oldText?: any, newText?: any): any => codeCall('edit', {
      path,
      oldText,
      newText
    }, x.ag),
    code_delete: (path?: any, recursive: any = false): any => codeCall('delete', {
      path,
      recursive
    }, x.ag),
    code_bash: (command?: any, opts: any = {}): any => codeCall('bash', {
      ...opts,
      command
    }, x.ag),
    skill: (n?: any): any => integrationsState.skillText(n),
    skills: (): any => integrationsState.SK.filter((s?: any): any => s.on).map((s?: any): any => ({
      name: s.name,
      description: s.description
    })),
    mcp_tools: (sv?: any): any => integrationsState.mcpList(sv),
    mcp_call: (sv?: any, t?: any, a?: any): any => mcpCall(sv, t, a),
    ask_agent: (id?: any, t?: any, options: any = {}): any => {
      const a: any = mainOrchestratorState.findA(id),
        ag: any = x.ag || mainOrchestratorState.findA(by);
      if (!a) return Promise.reject(new Error('no agent ' + id));
      if (a === ag) return Promise.reject(new Error('cannot ask yourself'));
      if (ag && options.speak) return Promise.reject(new Error('Only the main agent may authorize a delegated spoken report'));
      if (options.speak) {
        a.reportSpeechEpoch = voicePipelineState.speechEpoch;
        t = String(t) + ' -- Speak your answer directly to the user in your own voice. Your status line is automatically spoken; do not repeat it with speak_tts(), say(), or ask_main_agent().';
      }
      const reply: any = waitA(a);
      if (ag) {
        const r: any = act({
          op: 'tell_peer',
          to: a.name,
          text: t
        }, by, ag);
        if (r.startsWith('err')) {
          agentConversationsState.ansW(a, null);
          return Promise.reject(new Error(r));
        }
      } else tell(a, 'MESSAGE from ' + by + ': ' + t);
      return reply;
    },
    soul_settings: (): any => profilesContextState.soulSettingsMarkdown,
    update_soul_settings: (text?: any): any => {
      if (x.ag || mainOrchestratorState.findA(by)) throw new Error('Only the main agent may update soul-settings.md');
      return updateSoulSettings(text);
    },
    soul: (): any => {
      const a: any = x.ag || mainOrchestratorState.findA(by);
      return a ? profilesContextState.soulProfile(a.name)?.soul || '' : profilesContextState.souls.main;
    },
    update_soul: (text?: any, append: any = false): any => updateSoul(x.ag || mainOrchestratorState.findA(by), text, append),
    ask_user: (options?: any): any => askUser(options, x.ag || mainOrchestratorState.findA(by)),
    skill_marketplaces: (): any => agentQuestionsState.marketplaces.map((m?: any): any => ({
      ...m
    })),
    install_skill: (url?: any): any => installRemoteSkill(url, x.ag || mainOrchestratorState.findA(by)),
    install_mcp: (config?: any): any => installRemoteMcp(config, x.ag || mainOrchestratorState.findA(by)),
    undo: (): any => workspaceHistoryState.undoWorkspace(),
    redo: (): any => workspaceHistoryState.redoWorkspace(),
    idle: (): any => {
      if (x.ag) x.ag.finIdle = true;
    },
    ask_main_agent: (t?: any): any => askMain(t, by),
    spawn_agent: (n?: any, g?: any, o?: any): any => {
      o = o || {};
      const ag: any = x.ag || mainOrchestratorState.findA(by),
        a: any = spawn(n, g, o.model, !!o.force, o.peers || (ag ? ag.name : ''), o);
      return hologramControlsState.agInfo(a);
    },
    peer: (to?: any, text?: any): any => act({
      op: 'tell_peer',
      to,
      text
    }, by, x.ag),
    say: (t?: any): any => {
      if (x.ag) {
        logA(x.ag, String(t));
        agentVoice(x.ag, t);
      }
    },
    done: (t?: any): any => {
      if (x.ag) x.ag.fin = String(t || 'done');
    }
  };
  for (const key of Object.keys(J)) {
    const d: any = Object.getOwnPropertyDescriptor(J, key);
    if (d && typeof d.value === 'function') {
      const fn: any = d.value;
      J[key] = (...args: any): any => {
        if (apiEpoch !== hologramControlsState.workspaceEpoch) throw new Error('This code belongs to an inactive session');
        return fn(...args);
      };
    }
  }
  return wrapLog(J, by);
}
// ---- run an async JS snippet (agent / jarvis) in the scene API; resolves {ret,er,out}
export function createScriptApi(): void {
  scriptApiState.JT = new Set();
  scriptApiState.scriptManagerOwner = 'jarvis';
  scriptApiState.codeHost = null;
  scriptApiState.codeRequests = new Set();
}

export async function saveScriptFromManager(): Promise<void> {
  const { owner, name: draftName, source, editNode, saving } = useRuntimeUI.getState().scripts;
  if (saving) return;
  updateScriptUI({ saving: true });
  try {
    const name = draftName.trim();
    if (!name) throw new Error('Enter a script name');
    const node = profilesContextState.O.get(editNode);
    const existing = node?.scripts.find((s: any) => s.name === name && s.by === owner);
    if (existing) attach(node, name, source, owner).autoResume = true;
    else saveAgentScript(owner, name, source);
    await saveSession(true);
    // Do not overwrite a newly opened owner's editor after an async save.
    if (useRuntimeUI.getState().scripts.owner === owner) {
      updateScriptUI({ editNode: null, status: sessionsState.sessionReady ? 'Saved to session storage and started' : 'Started, but session storage is not ready' });
      renderScriptManager();
    }
  } catch (error) {
    if (useRuntimeUI.getState().scripts.owner === owner) updateScriptUI({ status: error instanceof Error ? error.message : String(error) });
  } finally {
    updateScriptUI({ saving: false });
  }
}

export function stopManagerCallbacks(): void {
  const tasks = mainOrchestratorState.findA(scriptApiState.scriptManagerOwner)?.tms || scriptApiState.JT;
  for (const task of [...tasks]) task.c?.();
  tasks.clear();
  renderScriptManager();
}
import { withFrameUpdate } from './log-context';
