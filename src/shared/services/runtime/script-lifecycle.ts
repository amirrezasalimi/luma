/** script-lifecycle: runtime implementation. */
import { mainOrchestratorState } from './main-orchestrator';
import { logA, notifyLuma, tell } from './agent-orchestrator';
import { profilesContextState } from './profiles-context';
import { rq } from './workspace-bridge';
import { mkApi, persistScriptChanges } from './script-api';
import { addObj, delObj, sceneObjectsState, setObj } from './scene-objects';
import { objectRendererState } from './object-renderer';
import { dumpObject } from './scene-actions';

interface ModuleState {
  HK: any;
  PH: any;
  AF: any;
  LOFF: any;
  INC: any;
  errTxt: any;
  clr: any;
  call: any;
  unmount: any;
  stepScripts: any;
  TW: any;
  EA: any;
  gv: any;
  sv: any;
  lc: any;
  HM: any;
}

export const scriptLifecycleState = {} as ModuleState;

export function synLine(src?: any, Fn?: any): any {
  const Ls: any = src.split('\n');
  for (let n: any = 1; n <= Ls.length; n++) try {
    new Fn(Ls.slice(0, n).join('\n'));
  } catch (e: any) {
    if (e instanceof SyntaxError && !scriptLifecycleState.INC.test(e.message)) return n;
  }
  return Ls.length;
}
export function mkErr(phase?: any, e?: any, src?: any, Fn?: any): any {
  let line: any = 0,
    col: any = 0;
  const m: any = /jv_[^:\s)]+:(\d+):(\d+)/.exec(e && e.stack || '');
  if (e instanceof SyntaxError && src != null) line = synLine(src, Fn);else if (m) {
    line = m[1] - scriptLifecycleState.LOFF;
    col = +m[2];
  }
  return {
    phase,
    msg: (e && e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e && e.message || e),
    line,
    col,
    snip: line && src != null ? (src.split('\n')[line - 1] || '').trim().slice(0, 90) : ''
  };
}
export function fail(o?: any, s?: any, phase?: any, e?: any): any {
  const er: any = mkErr(phase, e, s.src, Function);
  s.err = er;
  if (phase !== 'compile' && phase !== 'init') s.dead[phase] = 1;
  report(o, s, er);
}
export function report(o?: any, s?: any, er?: any): any {
  const msg: any = 'script "' + s.name + '" on node ' + o.id + ' ' + scriptLifecycleState.errTxt(er);
  console.warn('[LUMA]', msg);
  const a: any = mainOrchestratorState.findA(s.by);
  if (a) {
    a.errq.push(msg);
    logA(a, '✖ ' + msg, true);
    if (a.status !== 'running' && (a.fix = (a.fix || 0) + 1) <= 3) tell(a, 'SCRIPT ERROR: ' + msg + '. Fix it by attaching corrected source with the same script name.');
  } else if (s.by === 'luma') notifyLuma({
    name: o.id,
    id: o.id,
    task: 'script ' + s.name
  }, 'FAILED', msg);
  profilesContextState.scrDirty = 1;
  rq();
}
// ---- script lifecycle
export function callS(o?: any, s?: any, hk?: any, ...a: any): any {
  if (s.suspended) return;
  const f: any = s.h[hk];
  if (!f || s.dead[hk]) return;
  try {
    const r: any = hk === 'update' ? withFrameUpdate(() => f.apply(null, a)) : f.apply(null, a);
    if (r && r.catch) r.catch((e?: any): any => fail(o, s, hk, e));
    return r;
  } catch (e: any) {
    fail(o, s, hk, e);
  }
}
export function build(o?: any, s?: any): any {
  s.suspended = false;
  scriptLifecycleState.clr(s);
  s.h = {};
  s.fns = {};
  s.dead = {};
  s.err = null;
  let f: any;
  try {
    f = new Function('J', 'with(J){' + s.src + '\n;return{' + scriptLifecycleState.HK.map((k?: any): any => k + ':typeof ' + k + '==="function"?' + k + ':null').join(',') + '}}\n//# sourceURL=jv_' + o.id.replace(/\W/g, '') + '_' + s.name.replace(/\W/g, ''));
  } catch (e: any) {
    return fail(o, s, 'compile', e);
  }
  try {
    s.h = f(mkApi({
      by: s.by,
      o,
      s
    })) || {};
  } catch (e: any) {
    return fail(o, s, 'init', e);
  }
  callS(o, s, 'mount');
}
export function attach(o?: any, name?: any, src?: any, by?: any): any {
  name = String(name || 'main').slice(0, 24);
  let s: any = o.scripts.find((x?: any): any => x.name === name);
  if (s) unmountS(o, s);else {
    s = {
      name,
      tm: new Set(),
      h: {},
      fns: {},
      dead: {}
    };
    o.scripts.push(s);
  }
  s.src = String(src);
  s.by = by || 'user';
  s.autoResume = true;
  build(o, s);
  profilesContextState.scrDirty = 1;
  persistScriptChanges();
  return s;
}
export function unmountS(o?: any, s?: any): any {
  callS(o, s, 'unmount');
  scriptLifecycleState.clr(s);
}
export function detach(o?: any, name?: any): any {
  const i: any = o.scripts.findIndex((s?: any): any => s.name === name);
  if (i < 0) return false;
  unmountS(o, o.scripts[i]);
  o.scripts.splice(i, 1);
  profilesContextState.scrDirty = 1;
  persistScriptChanges();
  return true;
}
export function exp(x?: any, d?: any): any {
  if (!x.o || !d) return;
  for (const k in d) {
    if (typeof d[k] === 'function') {
      if (x.s) x.s.fns[k] = d[k];
    } else if (!(k in x.o.vars)) x.o.vars[k] = d[k];
  }
}
// ---- tweens & one-time animations
export
// twn(obj, {prop:target|[from,to]}, {dur,ease,delay,loop,yoyo,rel,onDone}|ms, ease) -> thenable {stop,then}
function twn(o?: any, p?: any, op?: any, e?: any): any {
  op = typeof op === 'number' ? {
    dur: op
  } : typeof op === 'string' ? {
    ease: op
  } : op || {};
  if (typeof e === 'string') op = {
    ...op,
    ease: e
  };
  const pr: any = {};
  for (const k in p) {
    const v: any = p[k];
    let a: any = scriptLifecycleState.gv(o, k),
      b: any = v;
    if (Array.isArray(v)) {
      a = v[0];
      b = v[1];
    } else if (op.rel && typeof v === 'number') b = a + v;
    if (a == null) a = typeof b === 'number' ? 0 : b;
    pr[k] = [a, b];
  }
  for (const t of scriptLifecycleState.TW) if (t.o === o) for (const k in pr) delete t.p[k];
  const t: any = {
    o,
    p: pr,
    dur: Math.max(16, op.dur ?? 600),
    ease: scriptLifecycleState.EA[op.ease] || scriptLifecycleState.EA.quadInOut,
    delay: op.delay || 0,
    loop: op.loop ?? 0,
    yoyo: !!op.yoyo,
    el: 0,
    cb: op.onDone ? [op.onDone] : []
  };
  scriptLifecycleState.TW.push(t);
  return {
    stop: (): any => {
      t.x = 1;
    },
    then: (f?: any): any => {
      t.cb.push(f);
    }
  };
}
export function stepTW(dt?: any): any {
  for (let i: any = scriptLifecycleState.TW.length - 1; i >= 0; i--) {
    const t: any = scriptLifecycleState.TW[i];
    if (t.x || profilesContextState.O.get(t.o.id) !== t.o) {
      scriptLifecycleState.TW.splice(i, 1);
      continue;
    }
    t.el += dt * 1000;
    const u: any = (t.el - t.delay) / t.dur;
    if (u < 0) continue;
    const Pn: any = (t.loop < 0 ? 1e9 : t.loop + 1) * (t.yoyo ? 2 : 1),
      pi: any = Math.floor(u),
      end: any = u >= Pn,
      q: any = u - pi,
      f: any = end ? t.yoyo && Pn % 2 == 0 ? 0 : 1 : t.yoyo && pi % 2 ? 1 - q : q,
      e: any = t.ease(f);
    for (const k in t.p) {
      const [a, b]: any = t.p[k];
      scriptLifecycleState.sv(t.o, k, typeof b === 'number' ? a + (b - a) * e : scriptLifecycleState.lc(a, b, Math.min(1, Math.max(0, e))));
    }
    if (end) {
      scriptLifecycleState.TW.splice(i, 1);
      t.cb.forEach((f?: any): any => {
        try {
          f();
        } catch (e: any) {
          console.error(e);
        }
      });
    }
  }
}
export function anim(o?: any, n?: any, op?: any): any {
  op = typeof op === 'number' ? {
    dur: op
  } : op || {};
  const s: any = o.t.size,
    x: any = o.t.x,
    y: any = o.t.y;
  const presets: Record<string, any> = {
    pulse: [{
      size: s * 1.35
    }, {
      dur: 220,
      yoyo: 1
    }],
    pop: [{
      size: [.01, s]
    }, {
      dur: 450,
      ease: 'backOut'
    }],
    shake: [{
      x: x + .18
    }, {
      dur: 45,
      yoyo: 1,
      loop: 5
    }],
    bounce: [{
      y: y + .7
    }, {
      dur: 260,
      ease: 'quadOut',
      yoyo: 1
    }],
    spin: [{
      rot: Math.PI * 2
    }, {
      dur: 900,
      ease: 'cubicInOut',
      rel: 1
    }],
    flash: [{
      fill: '#ffffff',
      border: '#ffffff'
    }, {
      dur: 150,
      yoyo: 1,
      loop: 1
    }],
    fadeIn: [{
      fillA: [0, o.fillA]
    }, {
      dur: 500
    }],
    fadeOut: [{
      fillA: 0,
      bw: 0
    }, {
      dur: 500
    }],
    wobble: [{
      rot: .4
    }, {
      dur: 120,
      yoyo: 1,
      loop: 3,
      rel: 1
    }],
    slideIn: [{
      x: [x - 3, x]
    }, {
      dur: 600,
      ease: 'cubicOut'
    }],
    float: [{
      y: y + .3
    }, {
      dur: 1200,
      ease: 'sineInOut',
      yoyo: 1,
      loop: -1
    }]
  };
  const A = presets[n];
  if (!A) throw new Error('unknown animation "' + n + '" (use pulse|pop|shake|bounce|spin|flash|fadeIn|fadeOut|wobble|slideIn|float)');
  return twn(o, A[0], {
    ...A[1],
    ...op
  });
}
// ---- node handles: everything is a node (props, vars, scripts, children, tweens)
export function HD(o?: any, by?: any): any {
  by = by || 'user';
  const c: any = o._h || (o._h = {});
  return c[by] || (c[by] = new Proxy({}, {
    get(_?: any, k?: any): any {
      if (typeof k !== 'string' || k === 'then') return undefined;
      if (k === 'paint') return o.kind === 'text' ? o.color : o.kind === 'arrow' || o.kind === 'link' ? o.border : o.fill;
      if (sceneObjectsState.NUMP.includes(k)) return o.t[k];
      if (sceneObjectsState.OWN.includes(k)) return o[k];
      if (k === 'rot') return o.r;
      if (k === 'wx') return o.x;
      if (k === 'wy') return o.y;
      if (k === 'wz') return o.z;
      if (k === 'id' || k === 'kind' || k === 'by' || k === 'vars') return o[k];
      if (k === 'alive') return !o.dying && profilesContextState.O.get(o.id) === o;
      if (k === 'parent') {
        const Q: any = profilesContextState.O.get(o.parent);
        return Q ? HD(Q, by) : null;
      }
      if (k === 'children') return sceneObjectsState.kids(o).map((q?: any): any => HD(q, by));
      const m: any = scriptLifecycleState.HM[k];
      if (m) return (...a: any): any => m(o, by, ...a);
      if (k in o.vars) return o.vars[k];
      for (const s of o.scripts) if (s.fns[k]) return s.fns[k];
    },
    set(_?: any, k?: any, v?: any): any {
      if (k === 'color' || k === 'paint' || k === 'labelColor') setObj(o, sceneObjectsState.rmap(o.kind, {
        [k]: v
      }));else if (sceneObjectsState.NUMP.includes(k) || sceneObjectsState.OWN.includes(k) || k === 'parent' || k === 'vars') setObj(o, {
        [k]: v
      });else if (k === 'rot') o.r = +v || 0;else o.vars[k] = v;
      return true;
    },
    has(_?: any, k?: any): any {
      return k in o.vars;
    }
  }));
}
// ---- the API every script / agent / luma snippet sees as globals
export function prepareScriptLifecycle(): void {
  scriptLifecycleState.HK = ['mount', 'update', 'onClick', 'onHover', 'onMouseEnter', 'onMouseOut', 'onDrag', 'onDragEnd', 'unmount'];
  scriptLifecycleState.PH = scriptLifecycleState.HK.slice(2, 7);
  scriptLifecycleState.AF = Object.getPrototypeOf(async function (): Promise<any> {}).constructor;
  scriptLifecycleState.LOFF = ((): any => {
    try {
      new Function('\nthrow new Error("p")\n//# sourceURL=jv_probe')();
    } catch (e: any) {
      const m: any = /jv_probe:(\d+)/.exec(e.stack || '');
      if (m) return m[1] - 2;
    }
    return 0;
  })();
  scriptLifecycleState.INC = /end of input|Unexpected end|end of script|EOF|missing [)}\]]|Unterminated (template|regular)|Unclosed/i;
  scriptLifecycleState.errTxt = (e?: any): any => e.phase + ': ' + e.msg + (e.line ? ' @line ' + e.line + (e.col ? ':' + e.col : '') : '') + (e.snip ? ' -> ' + e.snip : '');
  scriptLifecycleState.clr = (s?: any): any => {
    s.tm.forEach((t?: any): any => t.c && t.c());
    s.tm.clear();
  };
  scriptLifecycleState.call = (o?: any, hk?: any, ...a: any): any => {
    if (o.dying && hk !== 'unmount') return;
    for (const s of o.scripts) callS(o, s, hk, ...a);
  };
  scriptLifecycleState.unmount = (o?: any): any => o.scripts.forEach((s?: any): any => unmountS(o, s));
  scriptLifecycleState.stepScripts = (dt?: any): any => {
    for (const o of profilesContextState.O.values()) if (!o.dying && o.scripts.length) scriptLifecycleState.call(o, 'update', dt);
  };
  scriptLifecycleState.TW = [];
  scriptLifecycleState.EA = {
    linear: (t?: any): any => t,
    quadIn: (t?: any): any => t * t,
    quadOut: (t?: any): any => t * (2 - t),
    quadInOut: (t?: any): any => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    cubicIn: (t?: any): any => t * t * t,
    cubicOut: (t?: any): any => --t * t * t + 1,
    cubicInOut: (t?: any): any => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    sineInOut: (t?: any): any => .5 - Math.cos(Math.PI * t) / 2,
    backOut: (t?: any): any => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    elasticOut: (t?: any): any => t <= 0 || t >= 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * 2.094) + 1,
    bounceOut: (t?: any): any => {
      const n: any = 7.5625,
        d: any = 2.75;
      return t < 1 / d ? n * t * t : t < 2 / d ? n * (t -= 1.5 / d) * t + .75 : t < 2.5 / d ? n * (t -= 2.25 / d) * t + .9375 : n * (t -= 2.625 / d) * t + .984375;
    }
  };
  scriptLifecycleState.gv = (o?: any, k?: any): any => sceneObjectsState.NUMP.includes(k) ? o.t[k] : k === 'rot' ? o.r : sceneObjectsState.OWN.includes(k) ? o[k] : o.vars[k];
  scriptLifecycleState.sv = (o?: any, k?: any, v?: any): any => {
    if (k === 'rot') o.r = v;else if (sceneObjectsState.NUMP.includes(k) || sceneObjectsState.OWN.includes(k)) setObj(o, {
      [k]: v
    });else o.vars[k] = v;
  };
  scriptLifecycleState.lc = (a?: any, b?: any, t?: any): any => {
    const p: any = objectRendererState.hx3(a),
      q: any = objectRendererState.hx3(b);
    return '#' + p.map((v?: any, i?: any): any => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  scriptLifecycleState.HM = {
    set: (o?: any, by?: any, p?: any): any => (setObj(o, sceneObjectsState.rmap(o.kind, p || {})), sceneObjectsState.xv(o, p || {}), HD(o, by)),
    get: (o?: any): any => dumpObject(o),
    tween: (o?: any, by?: any, p?: any, a?: any, b?: any): any => twn(o, sceneObjectsState.rmap(o.kind, p), a, b),
    animate: (o?: any, by?: any, n?: any, a?: any): any => anim(o, n, a),
    remove: (o?: any): any => delObj(o.id),
    add: (o?: any, by?: any, p?: any): any => HD(addObj(sceneObjectsState.rmap(p && (p.kind || p.shape) || 'cube', {
      ...p,
      parent: o.id
    }), by), by),
    find: (o?: any, by?: any, id?: any): any => {
      const f: any = (n?: any): any => {
        for (const c of sceneObjectsState.kids(n)) {
          if (c.id === id) return c;
          const r: any = f(c);
          if (r) return r;
        }
      };
      const r: any = f(o);
      return r ? HD(r, by) : null;
    },
    attach: (o?: any, by?: any, n?: any, src?: any, v?: any): any => (v && Object.assign(o.vars, v), attach(o, n, src, by), HD(o, by)),
    detach: (o?: any, by?: any, n?: any): any => detach(o, n),
    getScript: (o?: any, by?: any, n?: any): any => o.scripts.find((s?: any): any => s.name === n)?.src ?? null,
    scripts: (o?: any): any => o.scripts.map((s?: any): any => ({
      name: s.name,
      err: s.err && scriptLifecycleState.errTxt(s.err)
    })),
    patch: (o?: any, by?: any, n?: any, a?: any, b?: any): any => {
      const s: any = o.scripts.find((x?: any): any => x.name === n);
      if (!s) throw new Error('no script ' + n);
      if (!s.src.includes(a)) throw new Error('patch: text not found in script ' + n);
      attach(o, n, s.src.replace(a, (): any => b), by);
      return true;
    }
  };
}
import { withFrameUpdate } from './log-context';
