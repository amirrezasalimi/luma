import { readPreference, writePreference } from '../persistence';
/** raster-primitives: runtime implementation. */
import { sceneFoundationState } from './scene-foundation';

interface ModuleState {
  scl: any;
  CX: any;
  CY: any;
  projectionCache: any;
  gl: any;
  gb: any;
  ND: number;
  dpp: Float32Array;
  dtn: Float32Array;
  dbr: Float32Array;
  dgr: Uint8Array;
  NC: number;
  cp0: Float32Array;
  cd0: Float32Array;
  SG: any;
  TG: any;
  rotationCache: any;
  holoDebugDefaults: any;
  holoDebugVisuals: any;
  holoVisualRanges: any;
}

export const rasterPrimitivesState = {} as ModuleState;

export function proj(x?: any, y?: any, z?: any): any {
  const c: any = rasterPrimitivesState.projectionCache;
  if (c.yaw !== sceneFoundationState.cam.yaw) {
    c.yaw = sceneFoundationState.cam.yaw;
    c.cos = Math.cos(sceneFoundationState.cam.yaw);
    c.sin = Math.sin(sceneFoundationState.cam.yaw);
  }
  const x1: any = x * c.cos + z * c.sin,
    z1: any = -x * c.sin + z * c.cos,
    s: any = rasterPrimitivesState.scl();
  return [rasterPrimitivesState.CX() + s * x1, rasterPrimitivesState.CY() - s * (y * sceneFoundationState.cp_ - z1 * sceneFoundationState.sp_), y * sceneFoundationState.sp_ + z1 * sceneFoundationState.cp_];
}
export function plot(x?: any, y?: any, z?: any, s?: any, m?: any, l?: any): any {
  const p: any = proj(x, y, z),
    X: any = p[0] | 0,
    Y: any = p[1] | 0;
  for (let j: any = 0; j < s; j++) {
    const yy: any = Y + j;
    if (yy < 0 || yy >= sceneFoundationState.H) continue;
    for (let i: any = 0; i < s; i++) {
      const xx: any = X + i;
      if (xx < 0 || xx >= sceneFoundationState.W) continue;
      const k: any = yy * sceneFoundationState.W + xx;
      if (p[2] > sceneFoundationState.dep[k]) {
        sceneFoundationState.dep[k] = p[2];
        sceneFoundationState.px[k] = m * 4 + l;
      }
    }
  }
}

// ============================================================================
// 8. RASTER HOLOGRAM (ragged dashes, circuits, flows, crescent)
// ============================================================================
export function rot(g?: any, x?: any, y?: any, z?: any, o?: any): any {
  const r: any = rasterPrimitivesState.rotationCache;
  if (r.time !== sceneFoundationState.tm) {
    r.time = sceneFoundationState.tm;
    for (let i: any = 0; i < 3; i++) {
      r.cos[i] = Math.cos(sceneFoundationState.tm * rasterPrimitivesState.SG[i]);
      r.sin[i] = Math.sin(sceneFoundationState.tm * rasterPrimitivesState.SG[i]);
    }
  }
  const c: any = r.cos[g],
    s: any = r.sin[g],
    ct: any = r.tiltCos[g],
    st: any = r.tiltSin[g],
    a: any = x * c + z * s,
    b: any = -x * s + z * c;
  o[0] = (a * ct - y * st) * sceneFoundationState.HSC;
  o[1] = (a * st + y * ct) * sceneFoundationState.HSC;
  o[2] = b * sceneFoundationState.HSC;
}
export function saveHologramVisuals(): any {
  try {
    writePreference('luma-hologram-visuals', JSON.stringify(rasterPrimitivesState.holoDebugVisuals));
    return true;
  } catch (e: any) {
    console.warn('Could not save hologram visuals:', e);
    return false;
  }
}
export function seg(ax?: any, ay?: any, az?: any, bx?: any, by?: any, bz?: any, m?: any, br?: any): any {
  const a: any = proj(ax, ay, az),
    b: any = proj(bx, by, bz);
  let x0: any = a[0] | 0,
    y0: any = a[1] | 0;
  const x1: any = b[0] | 0,
    y1: any = b[1] | 0,
    dx: any = Math.abs(x1 - x0),
    dy: any = -Math.abs(y1 - y0),
    sx: any = x0 < x1 ? 1 : -1,
    sy: any = y0 < y1 ? 1 : -1,
    n: any = Math.max(dx, -dy) || 1;
  let e: any = dx + dy,
    i: any = 0;
  for (;;) {
    const t: any = i / n,
      nn: any = a[2] + (b[2] - a[2]) * t,
      brightness: any = 3.8 + (br - (1 - t) * 1.5 - 3.8) * rasterPrimitivesState.holoDebugVisuals.fade;
    for (let wy: any = 0; wy < rasterPrimitivesState.holoDebugVisuals.lineWidth; wy++) for (let wx: any = 0; wx < rasterPrimitivesState.holoDebugVisuals.lineWidth; wx++) {
      const x: any = x0 + wx,
        y: any = y0 + wy;
      if (x < 0 || x >= sceneFoundationState.W || y < 0 || y >= sceneFoundationState.H) continue;
      const k: any = y * sceneFoundationState.W + x;
      if (nn > sceneFoundationState.dep[k]) {
        sceneFoundationState.dep[k] = nn;
        sceneFoundationState.px[k] = m * 4 + Math.max(0, Math.min(3, brightness + sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)] - .5 | 0));
      }
    }
    if (x0 === x1 && y0 === y1 || ++i > 300) break;
    const e2: any = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
  }
}
export function holoRaster(): any {
  const o: any = [0, 0, 0],
    o2: any = [0, 0, 0],
    fl: any = sceneFoundationState.tm * 5 | 0;
  for (let i: any = 0; i < Math.round(rasterPrimitivesState.ND * rasterPrimitivesState.holoDebugVisuals.lineDensity); i++) {
    const k: any = i * 3,
      g: any = rasterPrimitivesState.dgr[i],
      h: any = (i * 2654435761 + fl * 40503 >>> 0) % 100;
    if (h < 3) continue;
    const st: any = 1 + sceneFoundationState.E * .9;
    rot(g, rasterPrimitivesState.dpp[k], rasterPrimitivesState.dpp[k + 1], rasterPrimitivesState.dpp[k + 2], o);
    rot(g, rasterPrimitivesState.dpp[k] + rasterPrimitivesState.dtn[k] * st, rasterPrimitivesState.dpp[k + 1] + rasterPrimitivesState.dtn[k + 1] * st, rasterPrimitivesState.dpp[k + 2] + rasterPrimitivesState.dtn[k + 2] * st, o2);
    seg(o[0] + sceneFoundationState.HX, o[1] + sceneFoundationState.HY, o[2] + sceneFoundationState.HQ, o2[0] + sceneFoundationState.HX, o2[1] + sceneFoundationState.HY, o2[2] + sceneFoundationState.HQ, 1, rasterPrimitivesState.dbr[i] * (h > 85 ? 1.3 : 1));
  }
  for (let i: any = 0; i < Math.round(rasterPrimitivesState.NC * rasterPrimitivesState.holoDebugVisuals.lineDensity); i++) {
    const k: any = i * 3;
    rot(1, rasterPrimitivesState.cp0[k], rasterPrimitivesState.cp0[k + 1], rasterPrimitivesState.cp0[k + 2], o);
    rot(1, rasterPrimitivesState.cp0[k] + rasterPrimitivesState.cd0[k], rasterPrimitivesState.cp0[k + 1] + rasterPrimitivesState.cd0[k + 1], rasterPrimitivesState.cp0[k + 2] + rasterPrimitivesState.cd0[k + 2], o2);
    seg(o[0] + sceneFoundationState.HX, o[1] + sceneFoundationState.HY, o[2] + sceneFoundationState.HQ, o2[0] + sceneFoundationState.HX, o2[1] + sceneFoundationState.HY, o2[2] + sceneFoundationState.HQ, 1, 1.6 + i % 3 * .5);
  }
  for (let i: any = 0; i < Math.round(sceneFoundationState.NR * rasterPrimitivesState.holoDebugVisuals.lineDensity); i += 3) {
    const dir: any = sceneFoundationState.rA[i].sp < 0 ? -1 : 1;
    for (let j: any = 1; j < sceneFoundationState.NP; j++) {
      const k: any = (i * sceneFoundationState.NP + j) * 3,
        q: any = k - 3,
        f: any = .5 + .5 * Math.sin(j * .28 - sceneFoundationState.tm * 2 * dir + i),
        br: any = 1.3 + f * f * 2.6;
      for (let w: any = 0; w < 2; w++) seg(sceneFoundationState.pos[q], sceneFoundationState.pos[q + 1] + w * .08, sceneFoundationState.pos[q + 2], sceneFoundationState.pos[k], sceneFoundationState.pos[k + 1] + w * .08, sceneFoundationState.pos[k + 2], 1, br);
    }
  }
  for (const R of [1.45, 1.62]) {
    let pv: any = null;
    for (let t: any = 0; t < 64; t++) {
      const th: any = .5 + t * .065 + sceneFoundationState.tm * .15;
      rot(1, R * Math.cos(th), R * Math.sin(th) * .6, R * Math.sin(th) * .5, o);
      if (pv) seg(pv[0] + sceneFoundationState.HX, pv[1] + sceneFoundationState.HY, pv[2] + sceneFoundationState.HQ, o[0] + sceneFoundationState.HX, o[1] + sceneFoundationState.HY, o[2] + sceneFoundationState.HQ, 1, 3.7 - Math.abs(t - 32) * .03);
      pv = [o[0], o[1], o[2]];
    }
  }
  const center: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ),
    radius: any = sceneFoundationState.HR * (.22 + sceneFoundationState.E * .12) * .7 * rasterPrimitivesState.holoDebugVisuals.mainCoreScale,
    pixels: any = Math.max(.5, radius * rasterPrimitivesState.scl());
  for (let y: any = Math.max(0, Math.ceil(center[1] - pixels)); y <= Math.min(sceneFoundationState.H - 1, Math.floor(center[1] + pixels)); y++) for (let x: any = Math.max(0, Math.ceil(center[0] - pixels)); x <= Math.min(sceneFoundationState.W - 1, Math.floor(center[0] + pixels)); x++) {
    const nx: any = (x - center[0]) / pixels,
      ny: any = (y - center[1]) / pixels,
      r2: any = nx * nx + ny * ny;
    if (r2 > 1) continue;
    const nz: any = Math.sqrt(1 - r2),
      depth: any = center[2] + nz * radius,
      k: any = y * sceneFoundationState.W + x;
    if (depth <= sceneFoundationState.dep[k]) continue;
    const light: any = Math.max(0, -nx * .45 - ny * .55 + nz * .7);
    sceneFoundationState.dep[k] = depth;
    sceneFoundationState.px[k] = 4 + Math.max(0, Math.min(3, 2 + light * 1.7 + sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)] - .5 | 0));
  }
}

// ============================================================================
// 9. VOICE PIPELINE: VAD -> STT -> LLM (stream) -> TTS (phonon-tts)
// ============================================================================
export function prepareRasterizer(): void {
  rasterPrimitivesState.scl = (): any => sceneFoundationState.cam.zoom * sceneFoundationState.H / 15;
  rasterPrimitivesState.CX = (): any => sceneFoundationState.W / 2 + sceneFoundationState.cam.px / sceneFoundationState.S;
  rasterPrimitivesState.CY = (): any => sceneFoundationState.H * .6 + sceneFoundationState.cam.py / sceneFoundationState.S;
  rasterPrimitivesState.projectionCache = {
    yaw: NaN,
    cos: 1,
    sin: 0
  };
  rasterPrimitivesState.ND = 520;
  rasterPrimitivesState.dpp = new Float32Array(rasterPrimitivesState.ND * 3);
  rasterPrimitivesState.dtn = new Float32Array(rasterPrimitivesState.ND * 3);
  rasterPrimitivesState.dbr = new Float32Array(rasterPrimitivesState.ND);
  rasterPrimitivesState.dgr = new Uint8Array(rasterPrimitivesState.ND);
  for (let i: any = 0; i < rasterPrimitivesState.ND; i++) {
    const a: any = Math.random() * 6.283,
      c: any = 2 * Math.random() - 1,
      s: any = Math.sqrt(1 - c * c),
      r: any = Math.random() < .7 ? 2.2 + Math.random() * .9 : Math.random() * 2.2,
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
      len: any = Math.min(1, .2 - Math.log(Math.random() + .01) * .2);
    rasterPrimitivesState.dpp.set([nx * r, ny * r, nz * r], i * 3);
    rasterPrimitivesState.dtn.set([tx / l * len, ty / l * len, tz / l * len], i * 3);
    rasterPrimitivesState.dbr[i] = 1.3 + Math.random() * 2.6;
    rasterPrimitivesState.dgr[i] = i % 3;
  }
  rasterPrimitivesState.NC = 36;
  rasterPrimitivesState.cp0 = new Float32Array(rasterPrimitivesState.NC * 3);
  rasterPrimitivesState.cd0 = new Float32Array(rasterPrimitivesState.NC * 3);
  for (let i: any = 0; i < rasterPrimitivesState.NC; i++) {
    const a: any = Math.random() * 6.283,
      c: any = 2 * Math.random() - 1,
      s: any = Math.sqrt(1 - c * c),
      r: any = 1 + Math.random() * 1.8;
    rasterPrimitivesState.cp0.set([s * Math.cos(a) * r, c * r, s * Math.sin(a) * r], i * 3);
    rasterPrimitivesState.cd0[i * 3 + i % 3] = (.2 + Math.random() * .7) * (Math.random() < .5 ? -1 : 1);
  }
  rasterPrimitivesState.SG = [.09, -.13, .18];
  rasterPrimitivesState.TG = [0, .5, -.7];
  rasterPrimitivesState.rotationCache = {
    time: NaN,
    cos: new Float64Array(3),
    sin: new Float64Array(3),
    tiltCos: rasterPrimitivesState.TG.map(Math.cos),
    tiltSin: rasterPrimitivesState.TG.map(Math.sin)
  };
  rasterPrimitivesState.holoDebugDefaults = {
    lineWidth: 1,
    lineDensity: 1,
    fade: 1,
    darkShading: 1,
    hueGradient: .65,
    mainCoreScale: 1,
    agentCount: 3
  };
  rasterPrimitivesState.holoDebugVisuals = {
    ...rasterPrimitivesState.holoDebugDefaults
  };
  rasterPrimitivesState.holoVisualRanges = {
    lineWidth: [1, 4],
    lineDensity: [0, 1],
    fade: [0, 1],
    darkShading: [0, 2],
    hueGradient: [0, 1],
    mainCoreScale: [.25, 2],
    agentCount: [0, 16]
  };
  try {
    const saved: any = JSON.parse(readPreference('luma-hologram-visuals') || '{}');
    for (const [key, [min, max]] of Object.entries<any>(rasterPrimitivesState.holoVisualRanges)) {
      const value: any = saved?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) rasterPrimitivesState.holoDebugVisuals[key] = Math.max(min, Math.min(max, ['lineWidth', 'agentCount'].includes(key) ? Math.round(value) : value));
    }
  } catch (e: any) {}
}
