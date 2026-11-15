/** frame-renderer: runtime implementation. */
import * as PIXI from 'pixi.js';
import { holoRaster, plot, proj, rasterPrimitivesState } from './raster-primitives';
import { sceneFoundationState } from './scene-foundation';
import { hud, sceneHudState, themeStep, updateEnergy } from './scene-hud';
import { voicePipelineState } from './voice-pipeline';
import { micAnchor } from './profiles-context';
import { objects } from './object-frame';

interface ModuleState {
  floorCache: any;
  hologramGlowMaterials: Uint8Array;
  glowMaterials: any;
  blurGlowMaterials: any;
  mainHuePalette: Uint32Array;
  backgroundReducedMotion: any;
  frameDebug: any;
  last: any;
}

export const frameRendererState = {} as ModuleState;

export function mainHueIndex(x?: any, y?: any, cx?: any, cy?: any, scale?: any): any {
  return Math.max(0, Math.min(127, ((x - cx) * .65 + (y - cy) * .75) * scale + 63.5 | 0)) * 4;
}
export function updateMainHuePalette(shading?: any): any {
  const amount: any = rasterPrimitivesState.holoDebugVisuals.hueGradient,
    time: any = frameRendererState.backgroundReducedMotion.matches ? 0 : performance.now() / 1000;
  // Keep the original palette and shading; a narrow hue spread avoids unrelated rainbow colors.
  for (let band: any = 0; band < 128; band++) {
    const angle: any = (band / 127 - .5) * 1.1 + time * .18 + Math.sin(time * .25) * .2,
      c: any = Math.cos(angle),
      s: any = Math.sin(angle);
    for (let level: any = 0; level < 4; level++) {
      const color: any = level < 2 ? shading[level] : sceneFoundationState.P[4 + level],
        r: any = color & 255,
        g: any = color >>> 8 & 255,
        b: any = color >>> 16 & 255;
      const rr: any = (.213 + .787 * c - .213 * s) * r + (.715 - .715 * c - .715 * s) * g + (.072 - .072 * c + .928 * s) * b;
      const gg: any = (.213 - .213 * c + .143 * s) * r + (.715 + .285 * c + .140 * s) * g + (.072 - .072 * c - .283 * s) * b;
      const bb: any = (.213 - .213 * c - .787 * s) * r + (.715 - .715 * c + .715 * s) * g + (.072 + .928 * c + .072 * s) * b;
      frameRendererState.mainHuePalette[band * 4 + level] = sceneHudState.abgr([Math.round(r + (Math.max(0, Math.min(255, rr)) - r) * amount), Math.round(g + (Math.max(0, Math.min(255, gg)) - g) * amount), Math.round(b + (Math.max(0, Math.min(255, bb)) - b) * amount)]);
    }
  }
}
export function backgroundImageFilter(): any {
  return new PIXI.Filter(undefined, `
 varying vec2 vTextureCoord;
 uniform sampler2D uSampler;
 uniform vec2 pointer;
 uniform vec2 viewport;
 uniform float time;
 void main(){
  vec4 source=texture2D(uSampler,vTextureCoord);
  vec2 uv=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y)/viewport;
  vec2 delta=uv-pointer;delta.x*=viewport.x/viewport.y;
  float glow=max(0.0,1.0-dot(delta,delta)*1.8);
  vec3 color=source.rgb+glow*vec3(0.08,0.045,0.14);
  vec2 cell=floor(gl_FragCoord.xy/3.0);
  vec2 lo=mod(cell,2.0),hi=mod(floor(cell/2.0),2.0);
  float low=mod(lo.x+lo.y,2.0)*2.0+lo.y;
  float high=mod(hi.x+hi.y,2.0)*2.0+hi.y;
  float threshold=(low*4.0+high+0.5)/16.0;
  float levels=7.0+0.7*sin(time*0.3);
  color=floor(clamp(color,0.0,1.0)*levels+threshold)/levels;
  gl_FragColor=vec4(color,source.a);
 }`, {
    pointer: new Float32Array([.5, .35]),
    viewport: new Float32Array([sceneFoundationState.app.view.width, sceneFoundationState.app.view.height]),
    time: 0
  });
}
export function drawFloor(s?: any, cx?: any, cy?: any, cY?: any, sY?: any, micAnchor?: any, waveScale?: any): any {
  const f: any = frameRendererState.floorCache,
    key: any = [sceneFoundationState.W, sceneFoundationState.H, s, cx, cy, cY, sY, sceneFoundationState.sp_, sceneFoundationState.cp_, sceneFoundationState.FG, sceneFoundationState.SR];
  if (key.some((v?: any, i?: any): any => v !== f.geometryKey[i])) {
    f.geometryKey = key;
    f.radius = NaN;
    f.anchorKey = [];
    const size: any = sceneFoundationState.W * sceneFoundationState.H;
    if (!f.r || f.r.length !== size) {
      f.r = new Float64Array(size);
      f.tone = new Float64Array(size);
      f.wx = new Float64Array(size);
      f.wz = new Float64Array(size);
      f.light = new Float64Array(size);
      f.indices = new Uint32Array(size);
    }
    if (!f.depth || f.depth.length !== sceneFoundationState.H) f.depth = new Float64Array(sceneFoundationState.H);
    f.radius = sceneFoundationState.SR;
    f.count = 0;
    const radiusSquared: any = sceneFoundationState.SR * sceneFoundationState.SR,
      R0: any = sceneFoundationState.SR - 1.8;
    for (let y: any = 0; y < sceneFoundationState.H; y++) {
      const z1: any = -((cy - y) / s) / sceneFoundationState.sp_;
      f.depth[y] = z1 * sceneFoundationState.cp_;
      const spanSquared: any = radiusSquared - z1 * z1;
      if (spanSquared < 0) continue;
      const span: any = Math.sqrt(spanSquared) * s,
        xStart: any = Math.max(0, Math.ceil(cx - span)),
        xEnd: any = Math.min(sceneFoundationState.W - 1, Math.floor(cx + span));
      for (let x: any = xStart; x <= xEnd; x++) {
        const x1: any = (x - cx) / s,
          wx: any = x1 * cY - z1 * sY,
          wz: any = x1 * sY + z1 * cY,
          r: any = Math.sqrt(x1 * x1 + z1 * z1),
          k: any = y * sceneFoundationState.W + x;
        const edge: any = Math.sin(wx * 7.1) * Math.cos(wz * 6.3) * .18,
          t: any = (r - R0) / 1.8 + edge,
          b: any = sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)];
        if (t > 0 && b < t) continue;
        f.indices[f.count++] = k;
        f.wx[k] = wx;
        f.wz[k] = wz;
        f.r[k] = r;
        f.tone[k] = 1.1 + (Math.floor(wx * sceneFoundationState.FG) + Math.floor(wz * sceneFoundationState.FG) & 1 ? .35 : 0) + (r % 1.6 < .07 ? .9 : 0) + Math.max(0, 1.5 - r * .28) * .9;
      }
    }
  }
  if (sceneFoundationState.micE !== 0) {
    const anchorKey: any = [micAnchor.x, micAnchor.z, waveScale];
    if (anchorKey.some((v?: any, i?: any): any => v !== f.anchorKey[i])) {
      f.anchorKey = anchorKey;
      const scale: any = Math.max(.1, waveScale);
      for (let i: any = 0; i < f.count; i++) {
        const k: any = f.indices[i],
          dx: any = f.wx[k] - micAnchor.x,
          dz: any = f.wz[k] - micAnchor.z;
        f.light[k] = Math.max(0, 1.5 - Math.sqrt(dx * dx + dz * dz) / scale * .28);
      }
    }
  }
  for (let i: any = 0; i < f.count; i++) {
    const k: any = f.indices[i],
      y: any = k / sceneFoundationState.W | 0,
      x: any = k - y * sceneFoundationState.W,
      b: any = sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)];
    let tone: any = f.tone[k] + (sceneFoundationState.micE !== 0 ? f.light[k] * sceneFoundationState.micE * 1.17 : 0);
    if (sceneFoundationState.sh[k]) tone -= 1.15;
    sceneFoundationState.px[k] = Math.max(0, Math.min(3, tone + b - .5 | 0));
    sceneFoundationState.dep[k] = f.depth[y];
  }
}
export function frameDebugMark(stage?: any): any {
  if (!frameRendererState.frameDebug.enabled) return;
  const now: any = performance.now();
  if (!stage) {
    frameRendererState.frameDebug.current = {
      intervalMs: frameRendererState.frameDebug.previous ? now - frameRendererState.frameDebug.previous : 0
    };
    frameRendererState.frameDebug.previous = now;
    frameRendererState.frameDebug.started = now;
  } else if (frameRendererState.frameDebug.current) frameRendererState.frameDebug.current[stage] = now - frameRendererState.frameDebug.last;
  frameRendererState.frameDebug.last = now;
}
export function frameDebugEnd(): any {
  if (!frameRendererState.frameDebug.enabled || !frameRendererState.frameDebug.current) return;
  frameRendererState.frameDebug.current.totalMs = performance.now() - frameRendererState.frameDebug.started;
  frameRendererState.frameDebug.samples.push(frameRendererState.frameDebug.current);
  if (frameRendererState.frameDebug.samples.length > 300) frameRendererState.frameDebug.samples.shift();
  frameRendererState.frameDebug.current = null;
}
export function startFrameRenderer(): void {
  frameRendererState.floorCache = {
    geometryKey: [],
    radius: NaN,
    anchorKey: [],
    count: 0
  };
  frameRendererState.hologramGlowMaterials = new Uint8Array(64);
  frameRendererState.hologramGlowMaterials[1] = 1;
  frameRendererState.mainHuePalette = new Uint32Array(128 * 4);
  frameRendererState.backgroundReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  frameRendererState.frameDebug = {
    enabled: false,
    samples: [],
    current: null,
    last: 0,
    started: 0,
    previous: 0,
    longTaskCount: 0,
    longTaskMs: 0,
    longTaskMaxMs: 0
  };
  frameRendererState.last = performance.now();
  sceneFoundationState.app.ticker.add((): any => {
    frameDebugMark();
    const now: any = performance.now(),
      dt: any = Math.min(.05, (now - frameRendererState.last) / 1e3);
    frameRendererState.last = now;
    sceneFoundationState.tm += dt * .55;
    {
      const k: any = 1 - Math.pow(.0005, dt);
      sceneFoundationState.HX += (sceneFoundationState.HT.x - sceneFoundationState.HX) * k;
      sceneFoundationState.HY += (sceneFoundationState.HT.y - sceneFoundationState.HY) * k;
      sceneFoundationState.HQ += (sceneFoundationState.HT.z - sceneFoundationState.HQ) * k;
      sceneFoundationState.HR += (sceneFoundationState.HT.r - sceneFoundationState.HR) * k;
      sceneFoundationState.SR += (sceneFoundationState.HT.sr - sceneFoundationState.SR) * k;
      sceneFoundationState.HSC = sceneFoundationState.HR / 2.8;
    }
    themeStep();
    updateEnergy(dt);
    // points
    let n: any = 0;
    const sp: any = sceneFoundationState.tm * .25,
      cs: any = Math.cos(sp),
      sn: any = Math.sin(sp);
    for (let i: any = 0; i < sceneFoundationState.NR; i++) {
      const r: any = sceneFoundationState.rA[i];
      for (let j: any = 0; j < sceneFoundationState.NP; j++) {
        const th: any = r.ph + sceneFoundationState.tm * r.sp + j / sceneFoundationState.NP * r.span,
          rr: any = r.R * sceneFoundationState.HSC * (1 + sceneFoundationState.E * .45 * Math.sin(j * .3 + sceneFoundationState.tm * 4 + i)),
          c: any = Math.cos(th) * rr,
          s: any = Math.sin(th) * rr;
        const x: any = c * r.u[0] + s * r.v[0],
          y: any = c * r.u[1] + s * r.v[1],
          z: any = c * r.u[2] + s * r.v[2];
        sceneFoundationState.pos[n * 3] = x * cs + z * sn + sceneFoundationState.HX;
        sceneFoundationState.pos[n * 3 + 1] = y + sceneFoundationState.HY;
        sceneFoundationState.pos[n * 3 + 2] = -x * sn + z * cs + sceneFoundationState.HQ;
        sceneFoundationState.pm[n++] = r.mat;
      }
    }
    frameDebugMark('animationMs');
    // clear
    sceneFoundationState.px.fill(255);
    sceneFoundationState.dep.fill(-1e9);
    sceneFoundationState.sh.fill(0);
    const s: any = rasterPrimitivesState.scl(),
      cx: any = rasterPrimitivesState.CX(),
      cy: any = rasterPrimitivesState.CY(),
      cY: any = Math.cos(sceneFoundationState.cam.yaw),
      sY: any = Math.sin(sceneFoundationState.cam.yaw),
      st: any = Math.max(2, Math.round(s * .11));
    // cast shadows (hard, long, screen-right)
    for (let i: any = 0; i < sceneFoundationState.NR * sceneFoundationState.NP; i++) {
      const x: any = sceneFoundationState.pos[i * 3],
        y: any = sceneFoundationState.pos[i * 3 + 1],
        z: any = sceneFoundationState.pos[i * 3 + 2],
        x1: any = x * cY + z * sY,
        z1: any = -x * sY + z * cY,
        X: any = cx + s * (x1 + y * 2.2) | 0,
        Y: any = cy + s * z1 * sceneFoundationState.sp_ | 0;
      for (let b: any = 0; b < st; b++) {
        const yy: any = Y + b;
        if (yy < 0 || yy >= sceneFoundationState.H) continue;
        for (let a: any = 0; a < st; a++) {
          const xx: any = X + a;
          if (xx >= 0 && xx < sceneFoundationState.W) sceneFoundationState.sh[yy * sceneFoundationState.W + xx] = 1;
        }
      }
    }
    frameDebugMark('clearAndShadowsMs');
    // Floor microphone lighting follows the same anchor as the input waves.
    const micPosition: any = micAnchor();
    const waveScale: any = micPosition.radius / 3.9;
    drawFloor(s, cx, cy, cY, sY, micPosition, waveScale);
    frameDebugMark('floorMs');
    // Microphone waves follow the selected conversation partner's ground anchor.
    for (let i: any = 0; i < 96; i++) {
      const a: any = i / 96 * 6.283 + sp * .5,
        h: any = (.12 + sceneFoundationState.bars[i] * 3.2) * waveScale,
         x: any = micPosition.x + Math.cos(a) * micPosition.radius,
         z: any = micPosition.z + Math.sin(a) * micPosition.radius;
      for (let y: any = 0; y < h; y += .09) plot(x, y + .03, z, 2, 2, Math.min(3, 1 + (y / h * 3 | 0)));
    }
    for (const r of sceneFoundationState.pulses) for (let a: any = 0; a < 6.283; a += .07) plot(micPosition.x + Math.cos(a) * r * waveScale, .04, micPosition.z + Math.sin(a) * r * waveScale, 1, 2, r < sceneFoundationState.SR * .5 ? 3 : 2);
    // 3D hud: orbit ring ticks + satellites
    for (let a: any = 0; a < 64; a++) {
      const t: any = a / 64 * 6.283 - sceneFoundationState.tm * .4,
        big: any = a % 8 == 0;
      plot(sceneFoundationState.HX + Math.cos(t) * 4.9 * sceneFoundationState.HSC, sceneFoundationState.HY + Math.sin(t) * .9 * Math.sin(.5) * sceneFoundationState.HSC, sceneFoundationState.HQ + Math.sin(t) * 4.9 * sceneFoundationState.HSC, big ? 3 : 2, 2, big ? 3 : 1);
    }
    for (let k: any = 0; k < 3; k++) {
      const t: any = sceneFoundationState.tm * .7 + k * 2.09,
        x: any = sceneFoundationState.HX + Math.cos(t) * 5.4 * sceneFoundationState.HSC,
        z: any = sceneFoundationState.HQ + Math.sin(t) * 5.4 * sceneFoundationState.HSC,
        y: any = sceneFoundationState.HY + 1.4 * sceneFoundationState.HSC * Math.sin(sceneFoundationState.tm + k * 2);
      for (let d: any = 0; d < 8; d++) plot(x + (d & 1) * .12, y + (d >> 1 & 1) * .12, z + (d >> 2 & 1) * .12, 2, 2, 3);
    }
    frameDebugMark('wavesMs');
    frameRendererState.hologramGlowMaterials.fill(0);
    frameRendererState.hologramGlowMaterials[1] = 1;
    holoRaster();
    objects();
    frameDebugMark('hologramsObjectsScriptsMs');
    // depth-buffer edges: darker behind, warm rim on upper-left
    for (let y: any = 1; y < sceneFoundationState.H; y++) for (let x: any = 1; x < sceneFoundationState.W; x++) {
      const k: any = y * sceneFoundationState.W + x,
        v: any = sceneFoundationState.px[k];
      if (v < 4 || v === 255) continue;
      const d: any = sceneFoundationState.dep[k],
        dl: any = sceneFoundationState.dep[k - 1],
        du: any = sceneFoundationState.dep[k - sceneFoundationState.W],
        e: any = .2;
      let l: any = v & 3;
      if (dl > d + e || du > d + e) l = Math.max(0, l - 1);else if (dl < d - e || du < d - e) l = 3;
      sceneFoundationState.px[k] = v & ~3 | l;
    }
    frameDebugMark('depthEdgesMs');
    // out
    {
      const GW: any = (sceneFoundationState.W >> 2) + 2,
        GH: any = (sceneFoundationState.H >> 2) + 2;
      if (!rasterPrimitivesState.gl || rasterPrimitivesState.gl.length !== GW * GH) {
        rasterPrimitivesState.gl = new Float32Array(GW * GH);
        rasterPrimitivesState.gb = new Float32Array(GW * GH);
        frameRendererState.glowMaterials = new Uint8Array(GW * GH);
        frameRendererState.blurGlowMaterials = new Uint8Array(GW * GH);
      }
      rasterPrimitivesState.gl.fill(0);
      rasterPrimitivesState.gb.fill(0);
      frameRendererState.glowMaterials.fill(0);
      frameRendererState.blurGlowMaterials.fill(0);
      let glowMinX: any = GW,
        glowMaxX: any = 0,
        glowMinY: any = GH,
        glowMaxY: any = 0;
      for (let y: any = 0; y < sceneFoundationState.H; y++) for (let x: any = 0; x < sceneFoundationState.W; x++) {
        const v: any = sceneFoundationState.px[y * sceneFoundationState.W + x];
        if (v !== 255 && frameRendererState.hologramGlowMaterials[v >> 2]) {
          const k: any = (y >> 2) * GW + (x >> 2);
          rasterPrimitivesState.gl[k] += .25 + (v & 3) * .15;
          frameRendererState.glowMaterials[k] = v >> 2;
          const gx: any = x >> 2,
            gy: any = y >> 2;
          if (gx < glowMinX) glowMinX = gx;
          if (gx > glowMaxX) glowMaxX = gx;
          if (gy < glowMinY) glowMinY = gy;
          if (gy > glowMaxY) glowMaxY = gy;
        }
      }
      for (let p: any = 0; p < 2; p++) {
        const a: any = p ? rasterPrimitivesState.gb : rasterPrimitivesState.gl,
          b: any = p ? rasterPrimitivesState.gl : rasterPrimitivesState.gb,
          ma: any = p ? frameRendererState.blurGlowMaterials : frameRendererState.glowMaterials,
          mb: any = p ? frameRendererState.glowMaterials : frameRendererState.blurGlowMaterials;
        for (let y: any = Math.max(1, glowMinY - p - 1); y <= Math.min(GH - 2, glowMaxY + p + 1); y++) for (let x: any = Math.max(1, glowMinX - p - 1); x <= Math.min(GW - 2, glowMaxX + p + 1); x++) {
          const k: any = y * GW + x;
          b[k] = (a[k] * 2 + a[k - 1] + a[k + 1] + a[k - GW] + a[k + GW]) / 6;
          let best: any = k;
          if (a[k - 1] > a[best]) best = k - 1;
          if (a[k + 1] > a[best]) best = k + 1;
          if (a[k - GW] > a[best]) best = k - GW;
          if (a[k + GW] > a[best]) best = k + GW;
          mb[k] = ma[best];
        }
      }
      const backgroundTime: any = frameRendererState.backgroundReducedMotion.matches ? 0 : sceneFoundationState.tm;
      const imageFilter: any = sceneFoundationState.stageBackground.sprite?.filters?.[0];
      if (imageFilter) {
        imageFilter.uniforms.pointer[0] = .5 + Math.sin(backgroundTime * .12) * .28;
        imageFilter.uniforms.pointer[1] = .35 + Math.sin(backgroundTime * .09) * .2;
        imageFilter.uniforms.viewport[0] = sceneFoundationState.app.view.width;
        imageFilter.uniforms.viewport[1] = sceneFoundationState.app.view.height;
        imageFilter.uniforms.time = backgroundTime;
        sceneFoundationState.stageBackground.sprite.filterArea = sceneFoundationState.app.screen;
      }
      const imageGlow: any = sceneHudState.abgr(sceneHudState.mixc(sceneHudState.GR[2], sceneHudState.CYr[2], voicePipelineState.theme)) & 0xffffff;
      const mainShading: any = [sceneFoundationState.P[4], sceneFoundationState.P[5]];
      if (rasterPrimitivesState.holoDebugVisuals.darkShading !== 1) for (let level: any = 0; level < 2; level++) {
        const base: any = sceneFoundationState.P[4 + level],
          bright: any = sceneFoundationState.P[6],
          amount: any = rasterPrimitivesState.holoDebugVisuals.darkShading;
        mainShading[level] = sceneHudState.abgr([0, 8, 16].map((shift?: any): any => {
          const dark: any = base >>> shift & 255,
            light: any = bright >>> shift & 255;
          return Math.round(amount < 1 ? light + (dark - light) * amount : dark / amount);
        }));
      }
      const hueEnabled: any = sceneFoundationState.cfg.mainColorEffect === true && rasterPrimitivesState.holoDebugVisuals.hueGradient > 0,
        hueCenter: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ),
        hueSpan: any = Math.max(1, sceneFoundationState.HR * s * 2),
        hueScale: any = 127 / hueSpan;
      if (hueEnabled) updateMainHuePalette(mainShading);
      for (let y: any = 0; y < sceneFoundationState.H; y++) for (let x: any = 0; x < sceneFoundationState.W; x++) {
        const i: any = y * sceneFoundationState.W + x,
          v: any = sceneFoundationState.px[i];
        if (v !== 255) {
          if (hueEnabled && v >= 4 && v < 8) {
            const index: any = mainHueIndex(x, y, hueCenter[0], hueCenter[1], hueScale);
            sceneFoundationState.u32[i] = frameRendererState.mainHuePalette[index + (v & 3)];
          } else sceneFoundationState.u32[i] = v === 4 || v === 5 ? mainShading[v - 4] : sceneFoundationState.P[v];
          continue;
        }
        const l: any = Math.min(3, rasterPrimitivesState.gl[(y >> 2) * GW + (x >> 2)] * 1.1 + sceneFoundationState.Bay[(y & 3) * 4 + (x & 3)] - .5 | 0);
        if (l > 0) {
          sceneFoundationState.u32[i] = sceneFoundationState.stageBackground.image ? (frameRendererState.glowMaterials[(y >> 2) * GW + (x >> 2)] > 1 ? sceneFoundationState.P[frameRendererState.glowMaterials[(y >> 2) * GW + (x >> 2)] * 4 + 2] & 0xffffff : hueEnabled ? frameRendererState.mainHuePalette[mainHueIndex(x, y, hueCenter[0], hueCenter[1], hueScale) + 2] & 0xffffff : imageGlow) | l * 24 << 24 : sceneFoundationState.HZ[l - 1];
          continue;
        }
        sceneFoundationState.u32[i] = sceneFoundationState.stageBackground.image ? 0 : sceneFoundationState.BG;
      }
    }
    frameDebugMark('glowAndOutputMs');
    if (sceneFoundationState.stageBackground.image) {
      const b: any = sceneFoundationState.stageBackground,
        c: any = b.config;
      for (let y: any = 0; y < sceneFoundationState.H; y++) for (let x: any = 0; x < sceneFoundationState.W; x++) {
        const k: any = y * sceneFoundationState.W + x;
        if (sceneFoundationState.px[k] >= 4) continue;
        const z: any = -((cy - y) / s) / sceneFoundationState.sp_,
          wx: any = (x - cx) / s * cY - z * sY,
          wz: any = (x - cx) / s * sY + z * cY,
          t: any = Math.max(0, Math.min(7, Math.floor((wx - c.x) / c.width * 8 + 4))),
          color: any = b.colors[t],
          strength: any = c.light * Math.exp(-Math.abs(wz - c.z) * .18) * Math.max(0, 1 - Math.abs(wx - c.x) / c.width);
        if (!color) continue;
        const v: any = sceneFoundationState.u32[k];
        sceneFoundationState.u32[k] = sceneHudState.abgr([Math.min(255, (v & 255) + color[0] * strength), Math.min(255, (v >>> 8 & 255) + color[1] * strength), Math.min(255, (v >>> 16 & 255) + color[2] * strength)]);
      }
    }
    frameDebugMark('backgroundLightingMs');
    sceneFoundationState.g2.putImageData(sceneFoundationState.img, 0, 0);
    sceneFoundationState.tex.baseTexture.update();
    frameDebugMark('canvasWriteMs');
    // pixi hud: pulse ring around core
    hud();
    const c: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ);
    sceneFoundationState.ring.clear();
    const R: any = (3.1 + sceneFoundationState.E * .9) * sceneFoundationState.HSC * s * sceneFoundationState.S,
      ox: any = Math.round(c[0] * sceneFoundationState.S),
      oy: any = Math.round(c[1] * sceneFoundationState.S);
    sceneFoundationState.ring.lineStyle(Math.max(2, sceneFoundationState.S), voicePipelineState.tcol, .55 + sceneFoundationState.E * .4);
    sceneFoundationState.ring.drawEllipse(ox, oy, R, R * .96);
    sceneFoundationState.ring.lineStyle(Math.max(1, sceneFoundationState.S >> 1), voicePipelineState.tcol, .22);
    sceneFoundationState.ring.drawEllipse(ox, oy, R * 1.08 + Math.sin(sceneFoundationState.tm * 2) * sceneFoundationState.S * 2, R * 1.04);
    frameDebugMark('hudMs');
    frameDebugEnd();
  });

  // ============================================================================
  // 12. AGENT / SCENE MODULE (nodes, scripts, tweens, JS command language)
  // ============================================================================
}
