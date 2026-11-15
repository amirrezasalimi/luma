/** object-input: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { HD, scriptLifecycleState } from './script-lifecycle';
import { cameraInputState } from './camera-input';
import { sceneFoundationState } from './scene-foundation';
import { rasterPrimitivesState } from './raster-primitives';
import { objectRendererState } from './object-renderer';
import { sceneObjectsState } from './scene-objects';

interface ModuleState {
  hasK: any;
  hasP: any;
  ptr2: any;
  hov: any;
  dr: any;
  upd: any;
}

export const objectInputState = {} as ModuleState;

export function hit(x?: any, y?: any): any {
  let b: any = null,
    bd: any = 1e9;
  for (const o of profilesContextState.O.values()) {
    if (o.dying || o.vis === false || !objectInputState.hasP(o)) continue;
    const d: any = Math.hypot(x - o.sx, y - o.sy);
    if (d < o.sr && d < bd) {
      b = o;
      bd = d;
    }
  }
  return b;
}
export
// screen -> local coordinates (parent space) on the plane at the node's height
function evt(o?: any, x?: any, y?: any): any {
  const X: any = x / sceneFoundationState.S,
    Y: any = y / sceneFoundationState.S,
    s: any = rasterPrimitivesState.scl(),
    z1: any = (o.y * sceneFoundationState.cp_ - (rasterPrimitivesState.CY() - Y) / s) / sceneFoundationState.sp_,
    wx: any = (X - rasterPrimitivesState.CX()) / (s * objectRendererState.K()),
    wz: any = (z1 - 5.6) / .6,
    Q: any = profilesContextState.O.get(o.parent);
  let lx: any = wx,
    lz: any = wz;
  if (Q) {
    const A: any = sceneObjectsState.RA(Q),
      c: any = Math.cos(A),
      sn: any = Math.sin(A),
      dx: any = wx - Q.x,
      dz: any = wz - Q.z;
    lx = dx * c - dz * sn;
    lz = dx * sn + dz * c;
  }
  return {
    x: lx,
    y: o.t.y,
    z: lz,
    wx,
    wz,
    sx: x,
    sy: y,
    dx: 0,
    dz: 0
  };
}
export function fire(o?: any, name?: any, e?: any): any {
  e.stop = 0;
  e.stopPropagation = (): any => {
    e.stop = 1;
  };
  e.target = HD(o, 'user');
  for (let c: any = o; c && !e.stop; c = profilesContextState.O.get(c.parent)) scriptLifecycleState.call(c, name, e);
}
export function bindObjectInput(): void {
  objectInputState.hasK = (o?: any, k?: any): any => {
    for (; o; o = profilesContextState.O.get(o.parent)) for (const s of o.scripts) if (s.h[k] && !s.dead[k]) return true;
    return false;
  };
  objectInputState.hasP = (o?: any): any => scriptLifecycleState.PH.some((k?: any): any => objectInputState.hasK(o, k));
  objectInputState.ptr2 = (e?: any): any => {
    const r: any = cameraInputState.V.getBoundingClientRect(),
      k: any = cameraInputState.V.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  objectInputState.hov = new Set();
  objectInputState.dr = null;
  cameraInputState.V.addEventListener('pointerdown', (e?: any): any => {
    if (cameraInputState.ptr.size > 1) return;
    const [x, y]: any = objectInputState.ptr2(e),
      o: any = hit(x, y);
    if (!o) return;
    const l: any = evt(o, x, y);
    objectInputState.dr = {
      o,
      x,
      y,
      l: [l.x, l.z],
      mv: 0,
      drag: 0
    };
    if (objectInputState.hasK(o, 'onDrag')) sceneFoundationState.dragLock = true;
  });
  cameraInputState.V.addEventListener('pointermove', (e?: any): any => {
    const [x, y]: any = objectInputState.ptr2(e);
    if (objectInputState.dr) {
      objectInputState.dr.mv += Math.abs(x - objectInputState.dr.x) + Math.abs(y - objectInputState.dr.y);
      objectInputState.dr.x = x;
      objectInputState.dr.y = y;
      if (objectInputState.dr.mv > 6 * profilesContextState.dpr()) objectInputState.dr.drag = 1;
      const ee: any = evt(objectInputState.dr.o, x, y);
      ee.dx = objectInputState.dr.drag ? ee.x - objectInputState.dr.l[0] : 0;
      ee.dz = objectInputState.dr.drag ? ee.z - objectInputState.dr.l[1] : 0;
      objectInputState.dr.l = [ee.x, ee.z];
      if (objectInputState.dr.drag && !objectInputState.dr.o.dying) fire(objectInputState.dr.o, 'onDrag', ee);
      return;
    }
    if (e.buttons) return;
    const o: any = hit(x, y),
      nwS: any = new Set();
    for (let c: any = o; c; c = profilesContextState.O.get(c.parent)) nwS.add(c);
    for (const c of objectInputState.hov) if (!nwS.has(c)) scriptLifecycleState.call(c, 'onMouseOut', evt(c, x, y));
    for (const c of nwS) if (!objectInputState.hov.has(c)) scriptLifecycleState.call(c, 'onMouseEnter', evt(c, x, y));
    objectInputState.hov = nwS;
    if (o) {
      fire(o, 'onHover', evt(o, x, y));
      cameraInputState.V.style.cursor = 'pointer';
    } else if (!cameraInputState.ptr.size) cameraInputState.V.style.cursor = 'grab';
  });
  objectInputState.upd = (e?: any): any => {
    if (objectInputState.dr) {
      const [x, y]: any = objectInputState.ptr2(e),
        o: any = objectInputState.dr.o;
      if (!o.dying) {
        if (objectInputState.dr.drag) fire(o, 'onDragEnd', evt(o, x, y));else if (e.type === 'pointerup') fire(o, 'onClick', evt(o, x, y));
      }
      objectInputState.dr = null;
    }
    sceneFoundationState.dragLock = false;
  };
  cameraInputState.V.addEventListener('pointerup', objectInputState.upd);
  cameraInputState.V.addEventListener('pointercancel', objectInputState.upd);

  // ============================================================================
  // 15. SUB-AGENTS & ORCHESTRATOR (JS command language)
  // ============================================================================
}
