/** hologram-controls: runtime implementation. */
import { sessionPlain } from './sessions';
import { rq } from './workspace-bridge';
import { mainOrchestratorState } from './main-orchestrator';
import { logA, notifyJarvis, tell } from './agent-orchestrator';
import { holoSet, sceneFoundationState } from './scene-foundation';
import { getAgentProfile, profilesContextState } from './profiles-context';
import { mkErr, scriptLifecycleState } from './script-lifecycle';
import { mkApi } from './script-api';
import { objectRendererState } from './object-renderer';
import { proj, rasterPrimitivesState } from './raster-primitives';
import { voicePipelineState } from './voice-pipeline';
import { sceneHudState } from './scene-hud';

interface ModuleState {
  PALS: any;
  SLOTS: any;
  workspaceEpoch: number;
  undoReady: boolean;
  MAIN: any;
  mainArchiveCache: any;
  actLog: any;
  HLID: any;
  hlid: number;
  LOGGED: any;
  short: any;
  mixh: any;
  h2s: any;
  palFromHex: any;
  AG_VISUAL_DEFAULTS: any;
  agentVisuals: any;
  agHoloGet: any;
  f2: any;
  stg: any;
  agInfo: any;
  worldObj: any;
  worldTxt: any;
  MNR: number;
  MNP: number;
  mrA: any;
  MND: number;
  mdpp: Float32Array;
  mdtn: Float32Array;
  mdbr: Float32Array;
}

export const hologramControlsState = {} as ModuleState;

export function savedMainArchive(): any {
  const c: any = hologramControlsState.mainArchiveCache,
    a: any = hologramControlsState.MAIN.archive;
  if (c.source !== a || a.length < c.length) {
    c.source = a;
    c.length = 0;
    c.json = '[]';
  }
  if (a.length !== c.length) {
    const added: any = JSON.stringify(sessionPlain(a.slice(c.length)));
    c.json = c.length ? c.json.slice(0, -1) + (added.length > 2 ? ',' + added.slice(1) : ']') : added;
    c.length = a.length;
  }
  return c.json;
}
export function logM(t?: any, err?: any): any {
  hologramControlsState.MAIN.log.push({
    t: Date.now(),
    text: String(t).slice(0, 300),
    err: !!err
  });
  if (hologramControlsState.MAIN.log.length > 120) hologramControlsState.MAIN.archive.push(hologramControlsState.MAIN.log.shift());
  rq();
}
export
// ---------------- hologram / floor / floating-label control + action logging ----------------
// main hologram: eased toward HT; sub-agent holograms keep half the main radius unless their radius was set explicitly (rLock)
function holoApply(p?: any, wait?: any): any {
  holoSet(p);
  for (const a of profilesContextState.AG.values()) if (!a.rLock) a.rt = sceneFoundationState.HT.r / 2;
  return wait ? profilesContextState.sl(650).then(sceneFoundationState.holoGet) : sceneFoundationState.holoGet();
}
export function rpt(by?: any, what?: any, e?: any): any {
  const er: any = mkErr('action', e, null),
    msg: any = what + ' ' + scriptLifecycleState.errTxt(er);
  console.warn('[JARVIS]', msg);
  const a: any = mainOrchestratorState.findA(by);
  if (a) {
    a.errq.push(msg);
    logA(a, '✖ ' + msg, true);
    if (a.status !== 'running' && (a.fix = (a.fix || 0) + 1) <= 3) tell(a, 'ERROR: ' + msg);
  } else if (by === 'jarvis') {
    logM('✖ ' + msg, 1);
    notifyJarvis({
      name: what,
      id: what,
      task: 'action'
    }, 'FAILED', msg);
  }
}
export function lblAct(v?: any, by?: any, id?: any): any {
  const run: any = typeof v === 'function' ? v : ((): any => {
      const w: any = new Function('J', 'with(J){' + v + '\n}');
      return (): any => w(mkApi({
        by,
        tm: new Set()
      }));
    })(),
    w: any = 'holo label "' + id + '" action';
  return (): any => {
    try {
      const q: any = run();
      if (q && q.catch) q.catch((e?: any): any => rpt(by, w, e));
    } catch (e: any) {
      rpt(by, w, e);
    }
  };
}
// floating labels: ag = a sub-agent (its own label set) or null for the main hologram
export function holoLabel(op?: any, id?: any, p?: any, by?: any, ag?: any): any {
  const B: any = ag ? ag.labels : sceneFoundationState.HLB,
    mn: any = !ag;
  if (op === 'list') return [...(mn ? hologramControlsState.HLID.map((i?: any): any => ({
    id: i,
    builtin: true,
    hidden: sceneFoundationState.HLH.has(i),
    text: sceneFoundationState.HLT.get(i) ?? null
  })) : []), ...[...B.values()].map((h?: any): any => ({
    id: h.id,
    text: h.text,
    angle: hologramControlsState.f2(h.a),
    y: h.y,
    radius: h.r,
    speed: h.speed,
    color: h.hex,
    clickable: !!h.fn
  }))];
  if (op === 'reset') {
    if (mn) {
      sceneFoundationState.HLH.clear();
      sceneFoundationState.HLT.clear();
    } else B.clear();
    return true;
  }
  if (op === 'remove') {
    id = String(id);
    if (B.delete(id)) return true;
    if (mn && hologramControlsState.HLID.includes(id)) {
      sceneFoundationState.HLH.add(id);
      return true;
    }
    return false;
  }
  p = p || {};
  const fix: any = (h?: any): any => {
    if (p.text != null) h.text = String(p.text).slice(0, 60);
    if (p.angle != null) h.a = +p.angle || 0;
    if (p.y != null) h.y = +p.y || 0;
    if (p.radius != null) h.r = profilesContextState.num(p.radius, 1, 16, 5.4);
    if (p.speed != null) h.speed = +p.speed || 0;
    if (p.color != null) {
      if (!/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error('label color must be #rrggbb');
      h.hex = p.color;
      h.color = profilesContextState.c2n(p.color);
    }
    if (p.onClick !== undefined) {
      h.actionSource = typeof p.onClick === 'function' ? p.onClick.toString() : p.onClick;
      h.actionFunction = typeof p.onClick === 'function';
      h.fn = p.onClick ? lblAct(p.onClick, by, h.id) : null;
    }
  };
  if (op === 'add') {
    let i: any = p.id ? String(p.id).replace(/\s/g, '_').slice(0, 20) : '';
    if (!i || B.has(i) || mn && hologramControlsState.HLID.includes(i)) i = 'hl' + ++hologramControlsState.hlid;
    const h: any = {
      id: i,
      text: 'LABEL',
      a: Math.random() * 6.283,
      y: 0,
      r: 5.4,
      speed: .06,
      color: null,
      hex: null,
      fn: null
    };
    fix(h);
    B.set(i, h);
    return i;
  }
  if (op === 'update') {
    id = String(id);
    if (mn && hologramControlsState.HLID.includes(id)) {
      sceneFoundationState.HLH.delete(id);
      if (p.text != null) sceneFoundationState.HLT.set(id, String(p.text).slice(0, 60));
      return true;
    }
    const h: any = B.get(id);
    if (!h) throw new Error('no holo label ' + id + (ag ? ' on ' + ag.name : ''));
    fix(h);
    return true;
  }
}
export function wrapLog(J?: any, by?: any): any {
  for (const k of hologramControlsState.LOGGED) {
    const f: any = J[k];
    if (typeof f !== 'function') continue;
    J[k] = (...a: any): any => {
      hologramControlsState.actLog(by, k + '(' + a.map(hologramControlsState.short).join(', ') + ')');
      return f(...a);
    };
  }
  return J;
}
// ---------------- hologram handles: the main hologram AND every sub-agent hologram ----------------
export function cleanAgentVisuals(p?: any): any {
  const out: any = {};
  for (const k of ['coreColor', 'lineColor', 'particleColor']) if (p[k] !== undefined) {
    if (typeof p[k] !== 'string' || !/^#[0-9a-f]{6}$/i.test(p[k])) throw new Error(k + ' must be #rrggbb');
    out[k] = p[k];
  }
  if (p.colors !== undefined) {
    if (!Array.isArray(p.colors) || p.colors.length !== 3 || !p.colors.every((c?: any): any => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) throw new Error('colors must be three #rrggbb colors: core, lines, particles');
    [out.coreColor, out.lineColor, out.particleColor] = p.colors;
  }
  for (const [k, range] of Object.entries<any>({
    lineDensity: [0, 1],
    particleCount: [0, 16],
    particleSize: [1, 6],
    particleSpeed: [-8, 8],
    particleRadius: [.3, 3]
  })) if (p[k] !== undefined) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) throw new Error(k + ' must be finite');
    out[k] = Math.max(range[0], Math.min(range[1], p[k]));
    if (['particleCount', 'particleSize'].includes(k)) out[k] = Math.round(out[k]);
  }
  return out;
}
export function agHoloSet(a?: any, p?: any, wait?: any): any {
  p = p || {};
  const visuals: any = cleanAgentVisuals(p);
  a.visuals = {
    ...(a.visuals || {}),
    ...visuals
  };
  const o: any = p.pos && typeof p.pos === 'object' ? p.pos : p;
  if (o.x != null) a.tp.x = profilesContextState.num(o.x, -12, 12, a.tp.x);
  if (o.y != null) a.tp.y = profilesContextState.num(o.y, .3, 12, a.tp.y);
  if (o.z != null) a.tp.z = profilesContextState.num(o.z, -12, 12, a.tp.z);
  if (p.radius === 'auto') {
    a.rLock = 0;
    a.rt = sceneFoundationState.HT.r / 2;
  } else if (p.radius != null) {
    a.rt = profilesContextState.num(p.radius, .3, 4, a.rt);
    a.rLock = 1;
  }
  if (p.color != null) {
    if (!/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error('color must be #rrggbb, got ' + p.color);
    a.pal = hologramControlsState.palFromHex(p.color);
  }
  rq();
  return wait ? profilesContextState.sl(650).then((): any => hologramControlsState.agHoloGet(a)) : hologramControlsState.agHoloGet(a);
}
// target: null/'' /"me"/"self" = own agent (else main), "main"/"jarvis" = main, otherwise an agent name or id
export function holoTarget(t?: any, x?: any, by?: any): any {
  if (t && typeof t === 'object' && t.id && profilesContextState.AG.has(t.id)) return profilesContextState.AG.get(t.id);
  if (t == null || t === '' || t === 'me' || t === 'self') return x.ag || mainOrchestratorState.findA(by) || null;
  const s: any = String(t).toLowerCase();
  if (s === 'main' || s === 'jarvis') return null;
  const a: any = mainOrchestratorState.findA(t);
  if (!a) throw new Error('no agent "' + t + '" (hologram targets: main or an agent name)');
  return a;
}
export function resetHologramSetting(t?: any, x?: any, by?: any): any {
  const a: any = holoTarget(t, x, by);
  if (a) {
    a.labels.clear();
    a.visuals = {};
    return agHoloSet(a, {
      ...hologramControlsState.SLOTS[a.slot],
      radius: 'auto',
      color: a.defaultColor || hologramControlsState.PALS[0].hex
    }, 1);
  }
  holoLabel('reset', null, null, by, null);
  return holoApply({
    x: 0,
    y: 3.7,
    z: 0,
    radius: 2.8,
    floorRadius: 6.4,
    floorGrid: 1.2,
    color: '#ffb400',
    speakingColor: '#44e0e8',
    ringColor: '#ffb400',
    ringSpeakingColor: '#44e0e8',
    floorColor: '#4a5a9e'
  }, 1);
}
export function holoH(t?: any, x?: any, by?: any): any {
  const a: any = holoTarget(t, x, by),
    mn: any = !a,
    lg: any = (m?: any, args?: any): any => hologramControlsState.actLog(by, 'hologram(' + (a ? a.name : 'main') + ').' + m + '(' + args.map(hologramControlsState.short).join(', ') + ')');
  const H: any = {
    target: a ? a.name : 'main',
    get: (): any => mn ? sceneFoundationState.holoGet() : hologramControlsState.agHoloGet(a),
    reset: (): any => resetHologramSetting(t, x, by),
    set: (p?: any, w?: any): any => {
      lg('set', [p]);
      return mn ? holoApply(p, w === undefined ? 1 : w) : agHoloSet(a, p, w === undefined ? 1 : w);
    },
    radius: (r?: any): any => H.set({
      radius: r
    }),
    color: (c?: any, sc?: any): any => H.set(mn ? {
      color: c,
      speakingColor: sc
    } : {
      color: c
    }),
    pos: (px_?: any, y?: any, z?: any): any => H.set(px_ && typeof px_ === 'object' ? px_ : {
      x: px_,
      y,
      z
    }),
    getPos: (): any => {
      const g: any = H.get();
      return {
        x: g.x,
        y: g.y,
        z: g.z
      };
    },
    addLabel: (p?: any): any => {
      lg('addLabel', [p]);
      return holoLabel('add', null, p, by, a);
    },
    updateLabel: (id?: any, p?: any): any => {
      lg('updateLabel', [id, p]);
      return holoLabel('update', id, p, by, a);
    },
    removeLabel: (id?: any): any => {
      lg('removeLabel', [id]);
      return holoLabel('remove', id, null, by, a);
    },
    labels: (): any => holoLabel('list', null, null, by, a),
    resetLabels: (): any => holoLabel('reset', null, null, by, a)
  };
  if (mn) {
    H.ringColor = (c?: any, sc?: any): any => H.set({
      ringColor: c,
      ringSpeakingColor: sc
    });
    H.floorRadius = (r?: any): any => H.set({
      floorRadius: r
    });
    H.floorColor = (c?: any): any => H.set({
      floorColor: c
    });
    H.floorGrid = (n?: any): any => H.set({
      floorGrid: n
    });
  }
  return H;
}
// ---------------- 12b0. World awareness (live, exposed to every script cycle) ----------------
// x,y,z,r = hologram world units; sx,sy,sr = the same place/size in STAGE coordinates (use these to place nodes)
export function prepareHologramControls(): void {
  hologramControlsState.PALS = [{
    name: 'emerald',
    p: ['#0c2e24', '#127a58', '#2fe38a', '#d4ffee'],
    hex: '#2fe38a'
  }, {
    name: 'magenta',
    p: ['#321038', '#8a1f7c', '#ff3ea5', '#ffd6f0'],
    hex: '#ff3ea5'
  }, {
    name: 'violet',
    p: ['#1b0e3a', '#4c249e', '#9d65ff', '#e9dcff'],
    hex: '#9d65ff'
  }, {
    name: 'crimson',
    p: ['#330a14', '#94162c', '#ff3b56', '#ffd6dc'],
    hex: '#ff3b56'
  }, {
    name: 'azure',
    p: ['#0a1e3c', '#1854a8', '#38a6ff', '#d9f0ff'],
    hex: '#38a6ff'
  }, {
    name: 'lime',
    p: ['#1b2e0a', '#4e8a14', '#a8f028', '#f0ffd4'],
    hex: '#a8f028'
  }];
  hologramControlsState.SLOTS = [{
    x: -6.2,
    y: 3.2,
    z: -.5
  }, {
    x: 6.2,
    y: 3.2,
    z: -.5
  }, {
    x: -5.2,
    y: 2.6,
    z: 2.6
  }, {
    x: 5.2,
    y: 2.6,
    z: 2.6
  }, {
    x: -4.6,
    y: 4.6,
    z: -3.4
  }, {
    x: 4.6,
    y: 4.6,
    z: -3.4
  }];
  hologramControlsState.workspaceEpoch = 0;
  hologramControlsState.undoReady = false;
  hologramControlsState.MAIN = {
    log: [],
    archive: [],
    open: true
  };
  hologramControlsState.mainArchiveCache = {
    source: null,
    length: 0,
    json: '[]'
  };
  hologramControlsState.actLog = (by?: any, t?: any): any => {
    const a: any = mainOrchestratorState.findA(by);
    if (a) logA(a, '• ' + t);else if (by === 'jarvis') logM('• ' + t);
  };
  hologramControlsState.HLID = ['status', 'mic_level', 'mic', 'stt', 'llm'];
  hologramControlsState.hlid = 0;
  hologramControlsState.LOGGED = ['add', 'del', 'clear', 'panel', 'gui', 'guiUpdate', 'guiDel', 'panelUpdate', 'panelDel', 'panelMove', 'speak_tts', 'ask_agent', 'ask_main_agent', 'spawn_agent', 'set_hologram', 'change_floor_radius', 'change_floor_color', 'change_floor_grid', 'change_hologram_radius', 'change_hologram_inside_color', 'change_hologram_ring_color', 'change_hologram_pos', 'add_holo_label', 'update_holo_label', 'remove_holo_label', 'mcp_call'];
  hologramControlsState.short = (v?: any): any => {
    try {
      const t: any = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return t.length > 40 ? t.slice(0, 40) + '…' : t;
    } catch (e: any) {
      return '?';
    }
  };
  hologramControlsState.mixh = (a?: any, b?: any, t?: any): any => a.map((v?: any, i?: any): any => v + (b[i] - v) * t);
  hologramControlsState.h2s = (a?: any): any => '#' + a.map((v?: any): any => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  hologramControlsState.palFromHex = (hex?: any): any => {
    const c: any = objectRendererState.hx3(hex),
      dk: any = [20, 8, 40],
      wy: any = [255, 246, 200];
    return {
      name: 'cust_' + hex,
      p: [hologramControlsState.h2s(hologramControlsState.mixh(c, dk, .75)), hologramControlsState.h2s(hologramControlsState.mixh(c, dk, .35)), hex, hologramControlsState.h2s(hologramControlsState.mixh(c, wy, .6))],
      hex
    };
  };
  hologramControlsState.AG_VISUAL_DEFAULTS = {
    lineDensity: 1,
    particleCount: 3,
    particleSize: 2,
    particleSpeed: 1.8,
    particleRadius: 1.2
  };
  hologramControlsState.agentVisuals = (a?: any): any => ({
    ...hologramControlsState.AG_VISUAL_DEFAULTS,
    coreColor: a.pal.p[3],
    lineColor: a.pal.hex,
    particleColor: a.pal.p[3],
    ...(a.visuals || {})
  });
  hologramControlsState.agHoloGet = (a?: any): any => ({
    ...hologramControlsState.agentVisuals(a),
    id: a.id,
    name: a.name,
    x: hologramControlsState.f2(a.pos.x),
    y: hologramControlsState.f2(a.pos.y),
    z: hologramControlsState.f2(a.pos.z),
    radius: hologramControlsState.f2(a.r),
    target: {
      x: a.tp.x,
      y: a.tp.y,
      z: a.tp.z,
      radius: a.rt
    },
    color: a.pal.hex,
    autoRadius: !a.rLock,
    labels: holoLabel('list', null, null, '', a)
  });
  hologramControlsState.f2 = (v?: any): any => +v.toFixed(2);
  hologramControlsState.stg = (x?: any, y?: any, z?: any, r?: any): any => {
    const p: any = proj(x, y, z),
      s: any = rasterPrimitivesState.scl();
    return {
      sx: hologramControlsState.f2((p[0] - rasterPrimitivesState.CX()) / (s * objectRendererState.K())),
      sy: hologramControlsState.f2(((rasterPrimitivesState.CY() - p[1]) / s + 5.6 * sceneFoundationState.sp_) / sceneFoundationState.cp_),
      sr: hologramControlsState.f2(r / objectRendererState.K())
    };
  };
  hologramControlsState.agInfo = (a?: any): any => ({
    id: a.id,
    name: a.name,
    x: hologramControlsState.f2(a.pos.x),
    y: hologramControlsState.f2(a.pos.y),
    z: hologramControlsState.f2(a.pos.z),
    r: hologramControlsState.f2(a.r),
    ...hologramControlsState.stg(a.pos.x, a.pos.y, a.pos.z, a.r),
    status: a.status,
    color: a.pal.hex,
    maxTurns: profilesContextState.agentLimit(a) === Infinity ? 'unlimited' : profilesContextState.agentLimit(a),
    unlimited: !!a.unlimited,
    hasSoul: !!profilesContextState.soulProfile(a.name)?.soul,
    voice: a.voice || '',
    effectiveVoice: voicePipelineState.profileVoice(a) || 'default',
    muted: !!a.muted,
    aesthetics: getAgentProfile(a).aesthetics,
    model: a.model,
    task: a.task.slice(0, 60)
  });
  hologramControlsState.worldObj = (): any => ({
    camera: {
      yaw: sceneFoundationState.cam.yaw,
      rotation: sceneFoundationState.cam.yaw,
      zoom: sceneFoundationState.cam.zoom,
      px: sceneFoundationState.cam.px,
      py: sceneFoundationState.cam.py
    },
    floor: {
      x: 0,
      y: 0,
      z: 0,
      r: sceneFoundationState.SR,
      ...hologramControlsState.stg(0, 0, 0, sceneFoundationState.SR)
    },
    holo: {
      x: hologramControlsState.f2(sceneFoundationState.HX),
      y: hologramControlsState.f2(sceneFoundationState.HY),
      z: hologramControlsState.f2(sceneFoundationState.HQ),
      r: hologramControlsState.f2(sceneFoundationState.HR),
      core: hologramControlsState.f2((.55 + sceneFoundationState.E * .5) * sceneFoundationState.HSC),
      energy: hologramControlsState.f2(sceneFoundationState.E),
      mode: sceneFoundationState.mode,
      ...hologramControlsState.stg(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ, sceneFoundationState.HR)
    },
    agents: [...profilesContextState.AG.values()].map(hologramControlsState.agInfo),
    main: getAgentProfile(null),
    stage: {
      x: [-6, 6],
      y: [0, 3.4],
      z: [-2, 2]
    },
    talk: sceneFoundationState.talkTo
  });
  hologramControlsState.worldTxt = (): any => {
    const w: any = hologramControlsState.worldObj(),
      f: any = w.floor,
      h: any = w.holo;
    return 'floor r' + f.r + ' stage(' + f.sx + ',' + f.sy + ' sr' + f.sr + ') | main holo world(' + hologramControlsState.f2(sceneFoundationState.HX) + ',' + hologramControlsState.f2(sceneFoundationState.HY) + ',' + hologramControlsState.f2(sceneFoundationState.HQ) + ') r' + hologramControlsState.f2(sceneFoundationState.HR) + ' stage(' + h.sx + ',' + h.sy + ' sr' + h.sr + ') core r' + h.core + ' | agents ' + (w.agents.map((a?: any): any => a.name + ' world(' + a.x + ',' + a.y + ',' + a.z + ') r' + a.r + ' stage(' + a.sx + ',' + a.sy + ' sr' + a.sr + ')').join('; ') || 'none');
  };
  // floating labels of sub-agent holograms are drawn by the main HUD
  sceneHudState.AGL = (): any => [...profilesContextState.AG.values()].filter((a?: any): any => a.labels && a.labels.size).map((a?: any): any => {
    const c: any = proj(a.pos.x, a.pos.y, a.pos.z);
    return {
      C: {
        x: a.pos.x,
        y: a.pos.y,
        z: a.pos.z,
        s: Math.max(.15, a.r / 2.8),
        d: c[2]
      },
      labels: [...a.labels.values()].map((h?: any): any => h.color == null ? {
        ...h,
        color: profilesContextState.c2n(a.pal.hex)
      } : h)
    };
  });

  // ---------------- 12b. Mini-Jarvis hologram geometry ----------------
  hologramControlsState.MNR = 18;
  hologramControlsState.MNP = 18;
  hologramControlsState.mrA = [];
  for (let i: any = 0; i < hologramControlsState.MNR; i++) {
    const a: any = [Math.random() - .5, Math.random() - .5, Math.random() - .5],
      l: any = Math.hypot(...a) || 1;
    a.forEach((_?: any, k?: any): any => a[k] /= l);
    let u: any = [-a[1], a[0], 0];
    const ul: any = Math.hypot(...u) || 1;
    u = u.map((x?: any): any => x / ul);
    const v: any = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    hologramControlsState.mrA.push({
      u,
      v,
      R: .72 + Math.random() * .28,
      sp: (Math.random() - .5) * 1.8,
      ph: Math.random() * 6.28,
      span: 1.8 + Math.random() * 3.8
    });
  }
  hologramControlsState.MND = 110;
  hologramControlsState.mdpp = new Float32Array(hologramControlsState.MND * 3);
  hologramControlsState.mdtn = new Float32Array(hologramControlsState.MND * 3);
  hologramControlsState.mdbr = new Float32Array(hologramControlsState.MND);
  for (let i: any = 0; i < hologramControlsState.MND; i++) {
    const a: any = Math.random() * 6.283,
      c: any = 2 * Math.random() - 1,
      s: any = Math.sqrt(1 - c * c),
      r: any = .68 + Math.random() * .38,
      nx: any = s * Math.cos(a),
      ny: any = c,
      nz: any = s * Math.sin(a);
    let tx: any = Math.random() - .5,
      ty: any = Math.random() - .5,
      tz: any = Math.random() - .5;
    const d: any = tx * nx + ty * ny + tz * nz;
    tx -= d * nx;
    ty -= d * ny;
    tz -= d * nz;
    const l: any = Math.hypot(tx, ty, tz) || 1,
      len: any = .14 + Math.random() * .22;
    hologramControlsState.mdpp.set([nx * r, ny * r, nz * r], i * 3);
    hologramControlsState.mdtn.set([tx / l * len, ty / l * len, tz / l * len], i * 3);
    hologramControlsState.mdbr[i] = 1.5 + Math.random() * 2.3;
  }

  // ---------------- 12c. Scene objects & node hierarchy ----------------
}
