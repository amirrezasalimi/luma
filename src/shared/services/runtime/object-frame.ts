/** object-frame: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { drawMesh, drawPath, drawSphere, killTxt, mat, objectRendererState, polyM, pset, setTxt, shadow, stepLogic, vpl } from './object-renderer';
import { scriptLifecycleState, stepTW } from './script-lifecycle';
import { sceneObjectsState } from './scene-objects';
import { refreshUI } from './workspace-bridge';
import { sceneFoundationState } from './scene-foundation';
import { holoRaster, rasterPrimitivesState } from './raster-primitives';
import { drawMiniHolos } from './agent-renderer';

interface ModuleState {
  lt0: any;
  dpt: any;
}

export const objectFrameState = {} as ModuleState;

export function objects(): any {
  stepLogic();
  objectRendererState.used = new Set();
  const d: any = profilesContextState.dpr(),
    nw: any = performance.now(),
    dt: any = Math.min(.05, (nw - objectFrameState.lt0) / 1e3);
  objectFrameState.lt0 = nw;
  stepTW(dt);
  scriptLifecycleState.stepScripts(dt);
  let L: any = [...profilesContextState.O.values()].sort((a?: any, b?: any): any => objectFrameState.dpt(a) - objectFrameState.dpt(b));
  for (const o of L) {
    o.a += ((o.dying ? 0 : 1) - o.a) * .16;
    const t: any = o.t,
      T: any = {
        x: t.x,
        y: t.y,
        z: t.z,
        x2: t.x2,
        y2: t.y2,
        z2: t.z2,
        size: t.size
      },
      Q: any = profilesContextState.O.get(o.parent);
    if (Q) {
      const A: any = sceneObjectsState.RA(Q),
        c: any = Math.cos(A),
        s: any = Math.sin(A);
      T.x = Q.x + t.x * c + t.z * s;
      T.z = Q.z - t.x * s + t.z * c;
      T.y = Q.y + t.y;
      T.x2 = Q.x + t.x2 * c + t.z2 * s;
      T.z2 = Q.z - t.x2 * s + t.z2 * c;
      T.y2 = Q.y + t.y2;
    }
    for (const k in T) o[k] += (T[k] - o[k]) * .18;
    o.p += (1 - o.p) * .09;
    o.r += o.spin * .016;
    if (o.kind === 'link') {
      const A: any = profilesContextState.O.get(o.from),
        B: any = profilesContextState.O.get(o.to);
      if (!A || !B || A.dying || B.dying) o.dying = 1;
    }
    if (o.dying && o.a < .03) {
      killTxt(o.id);
      profilesContextState.O.delete(o.id);
      if (profilesContextState.sel === o.id) {
        profilesContextState.sel = null;
        refreshUI();
      }
    }
  }
  L = [...profilesContextState.O.values()];
  const sh: any = L.filter((o?: any): any => !/arrow|link|node/.test(o.kind) && o.vis !== false);
  for (const o of L) if (o.kind === 'node') {
    const c: any = vpl(o.x, o.y, o.z);
    o.sx = c[0] * sceneFoundationState.S;
    o.sy = c[1] * sceneFoundationState.S;
    o.sr = 14 * d;
  }
  for (const o of sh) shadow(o, Math.min(1, o.a));
  for (const o of sh) {
    const ea: any = Math.max(0, Math.min(1, o.a)),
      c: any = vpl(o.x, o.y, o.z);
    o.sx = c[0] * sceneFoundationState.S;
    o.sy = c[1] * sceneFoundationState.S;
    o.sr = Math.max(18 * d, o.size * .65 * rasterPrimitivesState.scl() * sceneFoundationState.S);
    if (o.kind === 'cube') drawMesh(o, objectRendererState.CUBE, ea);else if (o.kind === 'pyramid') drawMesh(o, objectRendererState.PYR, ea);else if (o.kind === 'poly') drawMesh(o, polyM(o.n), ea);else if (o.kind === 'sphere') drawSphere(o, ea);
    if (o.kind === 'text') setTxt(o.id, o.text, o.sx, o.sy, o.fs * d * (.6 + .4 * ea), profilesContextState.c2n(o.color), ea);else {
      const q: any = vpl(o.x, o.y - o.size * .62 - .3, o.z);
      setTxt(o.id, o.text, q[0] * sceneFoundationState.S, q[1] * sceneFoundationState.S, o.fs * d, profilesContextState.c2n(o.color), ea);
    }
  }
  for (const o of L.filter((o?: any): any => /arrow|link/.test(o.kind) && o.vis !== false)) {
    const ea: any = Math.max(0, Math.min(1, o.a));
    let pts: any = [];
    if (o.kind === 'arrow') {
      const a: any = [o.x, o.y, o.z],
        b: any = [o.x2, o.y2, o.z2];
      for (let i: any = 0; i <= 10; i++) pts.push(a.map((v?: any, k?: any): any => v + (b[k] - v) * i / 10));
    } else {
      const A: any = profilesContextState.O.get(o.from),
        B: any = profilesContextState.O.get(o.to);
      if (!A || !B) continue;
      const a: any = [A.x, A.y, A.z],
        b: any = [B.x, B.y, B.z],
        D: any = objectRendererState.nz(objectRendererState.sub(b, a)),
        len: any = Math.hypot(...objectRendererState.sub(b, a)),
        p0: any = a.map((v?: any, k?: any): any => v + D[k] * A.size * .55),
        p1: any = b.map((v?: any, k?: any): any => v - D[k] * B.size * .62),
        mid: any = p0.map((v?: any, k?: any): any => (v + p1[k]) / 2);
      mid[1] += Math.min(.9, len * .12);
      for (let i: any = 0; i <= 14; i++) {
        const t: any = i / 14,
          u: any = 1 - t;
        pts.push(p0.map((v?: any, k?: any): any => u * u * v + 2 * u * t * mid[k] + t * t * p1[k]));
      }
    }
    const mp: any = drawPath(o, pts, ea);
    o.sx = mp[0] * sceneFoundationState.S;
    o.sy = mp[1] * sceneFoundationState.S;
    o.sr = 18 * d;
    setTxt(o.id, o.text, o.sx, o.sy - 14 * d, o.fs * d, profilesContextState.c2n(o.color), ea);
  }
  drawMiniHolos();
  const so: any = profilesContextState.O.get(profilesContextState.sel);
  if (so) {
    const r: any = so.sr / sceneFoundationState.S,
      cx: any = so.sx / sceneFoundationState.S,
      cy: any = so.sy / sceneFoundationState.S,
      mw: any = mat('#ffffff');
    for (let t: any = -r; t <= r; t++) {
      if (Math.abs(t | 0) >> 1 & 1) continue;
      pset(cx + t, cy - r, 50, mw, 3.9);
      pset(cx + t, cy + r, 50, mw, 3.9);
      pset(cx - r, cy + t, 50, mw, 3.9);
      pset(cx + r, cy + t, 50, mw, 3.9);
    }
  }
  for (const [k, t] of objectRendererState.TP) if (!objectRendererState.used.has(k)) t.visible = false;
}
export function connectObjectFrame(): void {
  objectFrameState.lt0 = performance.now();
  objectFrameState.dpt = (o?: any): any => {
    let n: any = 0;
    for (; o && n < 9; o = profilesContextState.O.get(o.parent)) n++;
    return n;
  };

  // ============================================================================
  // 13. SCRIPT RUNTIME: lifecycle hooks, handles, tweens, animations, errors
  // ============================================================================
}
