/** object-renderer: runtime implementation. */
import * as PIXI from 'pixi.js';
import { sceneFoundationState } from './scene-foundation';
import { proj, rasterPrimitivesState } from './raster-primitives';
import { profilesContextState } from './profiles-context';

interface ModuleState {
  TP: any;
  ATP: any;
  used: any;
  aused: any;
  K: any;
  LD: any;
  hx3: any;
  mx: any;
  ab: any;
  MAT: any;
  nm: number;
  sub: any;
  cr: any;
  nz: any;
  CUBE: any;
  PYR: any;
  PM: any;
  stepped: boolean;
  base: any;
  tw: any;
}

export const objectRendererState = {} as ModuleState;

export function vpl(x?: any, y?: any, z?: any): any {
  const k: any = objectRendererState.K(),
    s: any = rasterPrimitivesState.scl(),
    z1: any = 5.6 + z * .6;
  return [rasterPrimitivesState.CX() + s * x * k, rasterPrimitivesState.CY() - s * (y * sceneFoundationState.cp_ - z1 * sceneFoundationState.sp_), y * sceneFoundationState.sp_ + z1 * sceneFoundationState.cp_];
}
export function mat(h?: any): any {
  let m: any = objectRendererState.MAT.get(h);
  if (m) return m;
  if (objectRendererState.nm > 62) return 1;
  m = objectRendererState.nm++;
  const c: any = objectRendererState.hx3(h),
    vi: any = [36, 30, 92],
    wy: any = [255, 241, 160];
  [objectRendererState.mx(c, vi, .72).map((v?: any): any => v * .55), objectRendererState.mx(c, vi, .3).map((v?: any): any => v * .8), c, objectRendererState.mx(c, wy, .55)].forEach((q?: any, i?: any): any => sceneFoundationState.P[m * 4 + i] = objectRendererState.ab(q.map((v?: any): any => Math.max(0, Math.min(255, v | 0)))));
  objectRendererState.MAT.set(h, m);
  return m;
}
export function palMat(pal?: any): any {
  const key: any = 'pal_' + pal.name;
  let m: any = objectRendererState.MAT.get(key);
  if (!m) {
    if (objectRendererState.nm > 62) return 1;
    m = objectRendererState.nm++;
    objectRendererState.MAT.set(key, m);
  }
  // Session palette restoration can replace P while the material cache survives.
  pal.p.forEach((h?: any, i?: any): any => {
    const base: any = objectRendererState.hx3(h),
      accent: any = objectRendererState.hx3(pal.hex);
    sceneFoundationState.P[m * 4 + i] = objectRendererState.ab(i < 2 ? objectRendererState.mx(base, accent, i === 0 ? .22 : .4).map((v?: any): any => v | 0) : base);
  });
  return m;
}
export function pset(x?: any, y?: any, d?: any, m?: any, b?: any): any {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= sceneFoundationState.W || y >= sceneFoundationState.H) return;
  const k: any = y * sceneFoundationState.W + x;
  if (d > sceneFoundationState.dep[k]) {
    sceneFoundationState.dep[k] = d;
    sceneFoundationState.px[k] = m * 4 + Math.max(0, Math.min(3, b + sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)] - .5 | 0));
  }
}
export function ln(a?: any, b?: any, m?: any, br?: any, w?: any, ph?: any): any {
  const n: any = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) | 0 || 1;
  for (let i: any = 0; i <= n; i++) {
    const t: any = i / n,
      x: any = a[0] + (b[0] - a[0]) * t,
      y: any = a[1] + (b[1] - a[1]) * t,
      d: any = a[2] + (b[2] - a[2]) * t + .05,
      bb: any = ph == null ? br : br - 1.6 * (.5 - .5 * Math.sin(ph + i * .35));
    for (let j: any = 0; j < w; j++) for (let q: any = 0; q < w; q++) pset(x + q, y + j, d, m, bb);
  }
}
export function tri(A?: any, B?: any, C?: any, m?: any, b?: any, dens?: any): any {
  const x0: any = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))),
    x1: any = Math.min(sceneFoundationState.W - 1, Math.ceil(Math.max(A[0], B[0], C[0]))),
    y0: any = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))),
    y1: any = Math.min(sceneFoundationState.H - 1, Math.ceil(Math.max(A[1], B[1], C[1]))),
    den: any = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
  if (Math.abs(den) < 1e-6) return;
  for (let y: any = y0; y <= y1; y++) for (let x: any = x0; x <= x1; x++) {
    const X: any = x + .5,
      Y: any = y + .5,
      w1: any = ((B[1] - C[1]) * (X - C[0]) + (C[0] - B[0]) * (Y - C[1])) / den,
      w2: any = ((C[1] - A[1]) * (X - C[0]) + (A[0] - C[0]) * (Y - C[1])) / den,
      w3: any = 1 - w1 - w2;
    if (w1 < -.001 || w2 < -.001 || w3 < -.001 || sceneFoundationState.Bay[(y + 2 & 3) * 4 + (x + 1 & 3)] >= dens) continue;
    pset(x, y, w1 * A[2] + w2 * B[2] + w3 * C[2], m, b);
  }
}
export function face3(P3?: any, ctr?: any, m?: any, dens?: any, boost?: any): any {
  let n: any = objectRendererState.nz(objectRendererState.cr(objectRendererState.sub(P3[1], P3[0]), objectRendererState.sub(P3[2], P3[0])));
  const fc: any = [0, 0, 0];
  P3.forEach((p?: any): any => {
    fc[0] += p[0] / P3.length;
    fc[1] += p[1] / P3.length;
    fc[2] += p[2] / P3.length;
  });
  const o: any = objectRendererState.sub(fc, ctr);
  if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) n = n.map((x?: any): any => -x);
  const front: any = n[1] * sceneFoundationState.sp_ + n[2] * sceneFoundationState.cp_ > 0,
    lit: any = Math.max(0, n[0] * objectRendererState.LD[0] + n[1] * objectRendererState.LD[1] + n[2] * objectRendererState.LD[2]),
    b: any = Math.min(3.9, (front ? .7 + 2.7 * lit : .2 + 1.2 * lit) + boost),
    Q: any = P3.map((p?: any): any => vpl(p[0], p[1], p[2]));
  for (let i: any = 1; i < Q.length - 1; i++) tri(Q[0], Q[i], Q[i + 1], m, b, dens);
}
export function polyM(n?: any): any {
  if (objectRendererState.PM[n]) return objectRendererState.PM[n];
  const v: any = [],
    f: any = [[], []];
  for (let i: any = 0; i < n; i++) {
    const a: any = i / n * 6.2832;
    v.push([Math.cos(a) * .5, .4, Math.sin(a) * .5]);
    f[0].push(i);
    f[1].push(n + i);
  }
  for (let i: any = 0; i < n; i++) {
    const a: any = i / n * 6.2832;
    v.push([Math.cos(a) * .5, -.4, Math.sin(a) * .5]);
  }
  for (let i: any = 0; i < n; i++) f.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
  return objectRendererState.PM[n] = {
    v,
    f
  };
}
// shapes stay locked to their stage orientation when the camera rotates
export function drawMesh(o?: any, M?: any, ea?: any): any {
  const k: any = objectRendererState.K(),
    c: any = Math.cos(o.r),
    s: any = Math.sin(o.r),
    sc: any = o.size * ea,
    mf: any = mat(o.fill),
    mb: any = mat(o.border),
    ctr: any = [o.x, o.y, o.z],
    V3: any = M.v.map(([a, b, e]: any): any => [o.x + (a * c + e * s) * sc / k, o.y + b * sc, o.z + (-a * s + e * c) * sc / .6]);
  if (o.fillA > 0) M.f.forEach((f?: any): any => face3(f.map((i?: any): any => V3[i]), ctr, mf, Math.max(.12, o.fillA) * ea, 0));
  if (o.bw > 0 && ea > .15) {
    const w: any = Math.max(1, Math.round(o.bw / 2));
    M.f.forEach((f?: any): any => f.forEach((i?: any, j?: any): any => ln(vpl(...V3[i]), vpl(...V3[f[(j + 1) % f.length]]), mb, 3.6, w)));
  }
}
export function drawSphere(o?: any, ea?: any): any {
  const k: any = objectRendererState.K(),
    c0: any = vpl(o.x, o.y, o.z),
    R: any = o.size * ea * .5 * rasterPrimitivesState.scl(),
    mf: any = mat(o.fill),
    mb: any = mat(o.border),
    dens: any = o.fillA * ea;
  if (o.fillA > 0) for (let y: any = Math.floor(c0[1] - R); y <= c0[1] + R; y++) for (let x: any = Math.floor(c0[0] - R); x <= c0[0] + R; x++) {
    const nx: any = (x + .5 - c0[0]) / R,
      ny: any = -(y + .5 - c0[1]) / R,
      r2: any = nx * nx + ny * ny;
    if (r2 > 1 || sceneFoundationState.Bay[(y + 2 & 3) * 4 + (x + 1 & 3)] >= dens) continue;
    const z: any = Math.sqrt(1 - r2);
    pset(x, y, c0[2] + z * R / rasterPrimitivesState.scl(), mf, .3 + 3.3 * Math.max(0, nx * objectRendererState.LD[0] + ny * objectRendererState.LD[1] + z * objectRendererState.LD[2]));
  }
  if (o.bw > 0 && ea > .15) {
    const w: any = Math.max(1, Math.round(o.bw / 2)),
      c: any = Math.cos(o.r),
      s: any = Math.sin(o.r),
      sc: any = o.size * ea;
    for (let g: any = 0; g < 3; g++) {
      let pv: any = null;
      for (let i: any = 0; i <= 28; i++) {
        const a: any = i / 28 * 6.2832,
          u: any = Math.cos(a) * .5,
          v: any = Math.sin(a) * .5,
          l: any = g == 0 ? [u, v, 0] : g == 1 ? [u, 0, v] : [0, u, v],
          p: any = vpl(o.x + (l[0] * c + l[2] * s) * sc / k, o.y + l[1] * sc, o.z + (-l[0] * s + l[2] * c) * sc / .6);
        if (pv) ln(pv, p, mb, 3.6, w);
        pv = p;
      }
    }
  }
}
export function shadow(o?: any, ea?: any): any {
  const c: any = vpl(o.x + o.y * 2.2 / objectRendererState.K(), 0, o.z),
    rx: any = Math.max(2, o.size * .55 * ea * rasterPrimitivesState.scl()),
    ry: any = rx * sceneFoundationState.sp_;
  for (let y: any = Math.max(0, Math.floor(c[1] - ry)); y <= Math.min(sceneFoundationState.H - 1, c[1] + ry); y++) for (let x: any = Math.max(0, Math.floor(c[0] - rx)); x <= Math.min(sceneFoundationState.W - 1, c[0] + rx); x++) {
    if (((x - c[0]) / rx) ** 2 + ((y - c[1]) / ry) ** 2 > 1) continue;
    const i: any = y * sceneFoundationState.W + x;
    if (sceneFoundationState.px[i] > 0 && sceneFoundationState.px[i] < 4) sceneFoundationState.px[i]--;
  }
}
export function drawPath(o?: any, pts?: any, ea?: any): any {
  const m: any = Math.min(pts.length, Math.max(2, Math.ceil(o.p * (pts.length - 1)) + 1)),
    S3: any = pts.slice(0, m),
    Q: any = S3.map((p?: any): any => vpl(...p)),
    mb: any = mat(o.border),
    w: any = Math.max(1, Math.round(o.bw / 2));
  if (o.bw > 0 && ea > .15) for (let i: any = 1; i < Q.length; i++) ln(Q[i - 1], Q[i], mb, 3.7, w, -sceneFoundationState.tm * 5 + i * 2);
  if (o.head && o.p > .7 && m > 1) {
    const tip: any = S3[m - 1],
      D: any = objectRendererState.nz(objectRendererState.sub(tip, S3[m - 2])),
      U: any = Math.abs(D[1]) > .9 ? [1, 0, 0] : [0, 1, 0],
      A: any = objectRendererState.nz(objectRendererState.cr(D, U)),
      B: any = objectRendererState.cr(D, A),
      hl: any = .4 + o.bw * .04,
      hr: any = .17 + o.bw * .02,
      bs: any = [tip[0] - D[0] * hl, tip[1] - D[1] * hl, tip[2] - D[2] * hl],
      R: any = [];
    for (let i: any = 0; i <= 6; i++) {
      const a: any = i / 6 * 6.2832,
        ca: any = Math.cos(a) * hr,
        sa: any = Math.sin(a) * hr;
      R.push([bs[0] + A[0] * ca + B[0] * sa, bs[1] + A[1] * ca + B[1] * sa, bs[2] + A[2] * ca + B[2] * sa]);
    }
    for (let i: any = 0; i < 6; i++) face3([tip, R[i], R[i + 1]], bs, mb, 1, .5);
  }
  return Q[Q.length >> 1];
}
export function setTxt(key?: any, str?: any, x?: any, y?: any, fs?: any, color?: any, alpha?: any): any {
  let t: any = objectRendererState.TP.get(key);
  if (!t) {
    t = new PIXI.Text('', {
      fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
      fontWeight: 'bold',
      fill: 0xffffff,
      letterSpacing: 2,
      wordWrap: true,
      wordWrapWidth: 360 * profilesContextState.dpr(),
      align: 'center'
    });
    t.anchor.set(.5);
    sceneFoundationState.app.stage.addChild(t);
    objectRendererState.TP.set(key, t);
  }
  if (t._s !== str) {
    t.text = str;
    t._s = str;
  }
  if (t._f !== fs) {
    t.style.fontSize = fs;
    t._f = fs;
  }
  t.tint = color;
  t.x = x;
  t.y = y;
  t.alpha = alpha;
  t.visible = !!str;
  objectRendererState.used.add(key);
}
export function killTxt(k?: any): any {
  const t: any = objectRendererState.TP.get(k);
  if (t) {
    t.destroy();
    objectRendererState.TP.delete(k);
  }
}
// 3D plane projected text for agent names
export function setPlaneTxt(key?: any, nameStr?: any, subStr?: any, wx?: any, wy?: any, wz?: any, color?: any, alpha?: any): any {
  let t: any = objectRendererState.ATP.get(key);
  if (!t) {
    t = new PIXI.Text('', {
      fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
      fontWeight: 'bold',
      fontSize: 26,
      lineHeight: 30,
      fill: 0xffffff,
      letterSpacing: 3,
      align: 'center'
    });
    t.resolution = 2;
    t.anchor.set(.5, .5);
    sceneFoundationState.app.stage.addChild(t);
    objectRendererState.ATP.set(key, t);
  }
  const str: any = nameStr.toUpperCase() + (subStr ? '\n' + subStr : '');
  if (t._s !== str) {
    t.text = str;
    t._s = str;
  }
  t.tint = color;
  t.alpha = alpha;
  t.visible = alpha > .04;
  const unit: any = 0.019,
    p: any = proj(wx, wy, wz),
    px_: any = proj(wx + unit, wy, wz),
    pz_: any = proj(wx, wy, wz + unit);
  t.transform.setFromMatrix(new PIXI.Matrix((px_[0] - p[0]) * sceneFoundationState.S, (px_[1] - p[1]) * sceneFoundationState.S, (pz_[0] - p[0]) * sceneFoundationState.S, (pz_[1] - p[1]) * sceneFoundationState.S, p[0] * sceneFoundationState.S, p[1] * sceneFoundationState.S));
  objectRendererState.aused.add(key);
}
export function killPlaneTxt(k?: any): any {
  const t: any = objectRendererState.ATP.get(k);
  if (t) {
    t.destroy();
    objectRendererState.ATP.delete(k);
  }
}
export function stepLogic(): any {/* Camera changes only through explicit user input; stage growth must not zoom it. */}

// ---------------- 12g. Mini-Luma hologram renderer ----------------
export function prepareObjectRenderer(): void {
  objectRendererState.TP = new Map();
  objectRendererState.ATP = new Map();
  objectRendererState.used = new Set();
  objectRendererState.aused = new Set();
  objectRendererState.K = (): any => Math.max(.35, Math.min(1, sceneFoundationState.W / sceneFoundationState.H * 7.5 / 6.5));
  objectRendererState.LD = ((): any => {
    const l: any = Math.hypot(-.5, .8, .6);
    return [-.5 / l, .8 / l, .6 / l];
  })();
  objectRendererState.hx3 = (h?: any): any => {
    const n: any = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  objectRendererState.mx = (a?: any, b?: any, t?: any): any => a.map((v?: any, i?: any): any => v * (1 - t) + b[i] * t);
  objectRendererState.ab = (c?: any): any => 0xff000000 | c[2] << 16 | c[1] << 8 | c[0];
  objectRendererState.MAT = new Map();
  objectRendererState.nm = 3;
  objectRendererState.sub = (a?: any, b?: any): any => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  objectRendererState.cr = (a?: any, b?: any): any => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  objectRendererState.nz = (a?: any): any => {
    const l: any = Math.hypot(...a) || 1;
    return a.map((x?: any): any => x / l);
  };
  objectRendererState.CUBE = {
    v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((v?: any): any => v.map((x?: any): any => x / 2)),
    f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]
  };
  objectRendererState.PYR = {
    v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, .5, 0]],
    f: [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]
  };
  objectRendererState.PM = {};
  objectRendererState.stepped = false;
  objectRendererState.base = null;
  objectRendererState.tw = null;
}
