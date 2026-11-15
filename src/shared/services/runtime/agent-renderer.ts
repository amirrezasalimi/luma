/** agent-renderer: runtime implementation. */
import { ln, mat, objectRendererState, palMat, pset, setPlaneTxt } from './object-renderer';
import { profilesContextState } from './profiles-context';
import { sceneFoundationState } from './scene-foundation';
import { voicePipelineState } from './voice-pipeline';
import { hologramControlsState } from './hologram-controls';
import { frameRendererState } from './frame-renderer';
import { proj, rasterPrimitivesState } from './raster-primitives';

const ERROR_PALETTE = { name: 'err_red', p: ['#3a060c', '#9e1122', '#ff2a38', '#ffd2d6'], hex: '#ff2a38' };

export function drawMiniHolos(): any {
  objectRendererState.aused = new Set();
  const d: any = profilesContextState.dpr();
  for (const a of profilesContextState.AG.values()) {
    a.spawnA = Math.min(1, (a.spawnA || 0) + .05);
    // ease radius / position toward their targets (set through hologram(agent).set / radius / pos)
    a.r += ((a.rt ?? a.r) - a.r) * .12;
    if (a.tp) for (const k of ['x', 'y', 'z']) a.pos[k] += (a.tp[k] - a.pos[k]) * .12;
    const ea: any = a.spawnA,
      isErr: any = a.status === 'error',
      isRun: any = a.status === 'running',
      isThink: any = a.think,
      isSpeaking: any = sceneFoundationState.mode === 'speaking' && voicePipelineState.speechOwner === a;
    const visual: any = hologramControlsState.agentVisuals(a),
      pal: any = isErr ? ERROR_PALETTE : a.pal,
      m: any = isErr ? palMat(pal) : palMat(hologramControlsState.palFromHex(visual.lineColor)),
      coreMaterial: any = isErr ? m : mat(visual.coreColor),
      particleMaterial: any = isErr ? m : mat(visual.particleColor);
    frameRendererState.hologramGlowMaterials[m] = 1;
    frameRendererState.hologramGlowMaterials[coreMaterial] = 1;
    frameRendererState.hologramGlowMaterials[particleMaterial] = 1;
    const tSpd: any = isSpeaking ? 2.4 : isThink ? 3.2 : isRun ? 1.8 : isErr ? .35 : .65;
    a.tm = (a.tm || 0) + 0.016 * tSpd;
    const tE: any = isSpeaking ? .15 + voicePipelineState.speechLevel : isThink ? .85 + .2 * Math.sin(sceneFoundationState.tm * 12) : isRun ? .45 + .2 * Math.sin(sceneFoundationState.tm * 6) : isErr ? .65 * (Math.random() > .35 ? 1 : .1) : .08 + (sceneFoundationState.talkTo === a.id ? sceneFoundationState.micE * .8 : 0);
    a.E = ((a.E || 0) + (tE - (a.E || 0)) * .2) * ea;
    const sc: any = (a.r + a.E * .1) * ea;
    const jx: any = isErr ? (Math.random() - .5) * .14 : 0,
      jy: any = isErr ? (Math.random() - .5) * .14 : 0;
    const hx: any = a.pos.x + jx,
      hy: any = a.pos.y + Math.sin(sceneFoundationState.tm * 2 + a.slot) * 0.12 + jy,
      hz: any = a.pos.z;
    const cen: any = proj(hx, hy, hz);
    a.sx = cen[0] * sceneFoundationState.S;
    a.sy = cen[1] * sceneFoundationState.S;
    a.sr = Math.max(22 * d, sc * 1.1 * rasterPrimitivesState.scl() * sceneFoundationState.S);
    // cast shadow on floor
    const shc: any = proj(hx + hy * 2.2, 0, hz),
      srx: any = Math.max(2, sc * .55 * rasterPrimitivesState.scl()),
      sry: any = srx * sceneFoundationState.sp_;
    for (let y: any = Math.max(0, Math.floor(shc[1] - sry)); y <= Math.min(sceneFoundationState.H - 1, shc[1] + sry); y++) for (let x: any = Math.max(0, Math.floor(shc[0] - srx)); x <= Math.min(sceneFoundationState.W - 1, shc[0] + srx); x++) {
      if (((x - shc[0]) / srx) ** 2 + ((y - shc[1]) / sry) ** 2 > 1) continue;
      const i: any = y * sceneFoundationState.W + x;
      if (sceneFoundationState.px[i] > 0 && sceneFoundationState.px[i] < 4) sceneFoundationState.px[i]--;
    }
    // ground anchor ring & vertical projection beam
    for (let i: any = 0; i < 36; i++) {
      if (!isRun && i & 1) continue;
      const th: any = i / 36 * 6.2832 + a.tm * .7,
        gp: any = proj(a.pos.x + Math.cos(th) * sc * 1.05, .04, a.pos.z + Math.sin(th) * sc * 1.05);
      pset(gp[0], gp[1], gp[2], m, isRun ? 3.3 : 2.1);
    }
    if (isRun || isThink) {
      const gp: any = proj(a.pos.x, .05, a.pos.z),
        bp: any = proj(hx, hy - sc * 1.1, hz);
      ln(gp, bp, m, 2.2, 1, -sceneFoundationState.tm * 7);
    }
    // peer-to-peer communication beam
    if (a.beamT > 0) {
      a.beamT -= .016;
      const peer: any = profilesContextState.AG.get(a.beamTo);
      if (peer) {
        const p2: any = proj(peer.pos.x, peer.pos.y, peer.pos.z);
        ln(cen, p2, m, 3.8, 2, -sceneFoundationState.tm * 12);
      }
    }
    // Audio waves belong to the hologram whose voice is playing.
    if (isSpeaking && voicePipelineState.pFd) for (let i: any = 0; i < 48; i++) {
      const angle: any = i / 48 * Math.PI * 2,
        level: any = (voicePipelineState.pFd[2 + i * 2] || 0) / 255,
        r: any = sc * 1.15;
      ln(proj(hx + Math.cos(angle) * r, hy + Math.sin(angle) * r, hz), proj(hx + Math.cos(angle) * (r + level * sc * .9), hy + Math.sin(angle) * (r + level * sc * .9), hz), m, 2 + level * 2, 1);
    }
    // rotating rings (same style as main Jarvis)
    const cs: any = Math.cos(a.tm * .4),
      sn: any = Math.sin(a.tm * .4);
    for (let i: any = 0; i < Math.round(hologramControlsState.MNR * visual.lineDensity * rasterPrimitivesState.holoDebugVisuals.lineDensity); i++) {
      const r: any = hologramControlsState.mrA[i],
        dir: any = r.sp < 0 ? -1 : 1;
      let pv: any = null;
      for (let j: any = 0; j < hologramControlsState.MNP; j++) {
        const th: any = r.ph + a.tm * r.sp + j / hologramControlsState.MNP * r.span,
          rr: any = r.R * sc * (1 + a.E * .38 * Math.sin(j * .4 + a.tm * 3 + i)),
          c: any = Math.cos(th) * rr,
          s: any = Math.sin(th) * rr;
        const x: any = c * r.u[0] + s * r.v[0],
          y: any = c * r.u[1] + s * r.v[1],
          z: any = c * r.u[2] + s * r.v[2];
        const q: any = proj(hx + x * cs + z * sn, hy + y, hz - x * sn + z * cs);
        if (pv) {
          const f: any = .5 + .5 * Math.sin(j * .35 - a.tm * 2.5 * dir + i);
          ln(pv, q, m, 3.8 - (2.5 - f * f * 2.5) * rasterPrimitivesState.holoDebugVisuals.fade, rasterPrimitivesState.holoDebugVisuals.lineWidth);
        }
        pv = q;
      }
    }
    // ragged dashes & tangents
    const fl: any = a.tm * 5 | 0,
      st: any = 1 + a.E * .85;
    for (let i: any = 0; i < Math.round(hologramControlsState.MND * visual.lineDensity * rasterPrimitivesState.holoDebugVisuals.lineDensity); i++) {
      const h: any = (i * 2654435761 + fl * 40503 >>> 0) % 100;
      if (h < (isErr ? 42 : 8)) continue;
      const k: any = i * 3,
        x0: any = hologramControlsState.mdpp[k] * sc,
        y0: any = hologramControlsState.mdpp[k + 1] * sc,
        z0: any = hologramControlsState.mdpp[k + 2] * sc,
        x1: any = x0 + hologramControlsState.mdtn[k] * sc * st,
        y1: any = y0 + hologramControlsState.mdtn[k + 1] * sc * st,
        z1: any = z0 + hologramControlsState.mdtn[k + 2] * sc * st;
      ln(proj(hx + x0 * cs + z0 * sn, hy + y0, hz - x0 * sn + z0 * cs), proj(hx + x1 * cs + z1 * sn, hy + y1, hz - x1 * sn + z1 * cs), m, 3.8 + (hologramControlsState.mdbr[i] - 3.8) * rasterPrimitivesState.holoDebugVisuals.fade, rasterPrimitivesState.holoDebugVisuals.lineWidth);
    }
    // Solid core sphere, lit from the upper left; front-surface depth preserves ring occlusion.
    const coreRadius: any = sc * (.22 + a.E * .12),
      corePixels: any = Math.max(.5, coreRadius * rasterPrimitivesState.scl());
    for (let y: any = Math.max(0, Math.ceil(cen[1] - corePixels)); y <= Math.min(sceneFoundationState.H - 1, Math.floor(cen[1] + corePixels)); y++) for (let x: any = Math.max(0, Math.ceil(cen[0] - corePixels)); x <= Math.min(sceneFoundationState.W - 1, Math.floor(cen[0] + corePixels)); x++) {
      const nx: any = (x - cen[0]) / corePixels,
        ny: any = (y - cen[1]) / corePixels,
        r2: any = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz: any = Math.sqrt(1 - r2),
        light: any = Math.max(0, -nx * .45 - ny * .55 + nz * .7);
      pset(x, y, cen[2] + nz * coreRadius, m, 2 + light * 1.7);
    }
    const satN: any = Math.max(0, Math.min(16, visual.particleCount + rasterPrimitivesState.holoDebugVisuals.agentCount - rasterPrimitivesState.holoDebugDefaults.agentCount));
    for (let k: any = 0; k < satN; k++) {
      const t: any = sceneFoundationState.tm * visual.particleSpeed + k * (6.283 / satN),
        q: any = proj(hx + Math.cos(t) * sc * visual.particleRadius, hy + .4 * sc * Math.sin(t + k), hz + Math.sin(t) * sc * visual.particleRadius);
      for (let u: any = 0; u < visual.particleSize; u++) for (let v: any = 0; v < visual.particleSize; v++) pset(q[0] + u, q[1] + v, q[2] + .1, particleMaterial, 3.9);
    }
    // big name in 3D plane under the mini-hologram
    const stLabel: any = (sceneFoundationState.talkTo === a.id ? '* TALK * ' : '') + (isSpeaking ? '[SPEAKING]' : isErr ? '[FAILED]' : isThink ? '[THINKING]' : isRun ? '[WORKING]' : a.status === 'done' ? '[READY]' : '[' + a.status.toUpperCase() + ']');
    setPlaneTxt('ag_' + a.id, a.name, stLabel, a.pos.x, Math.max(.08, a.pos.y - sc * 1.4), a.pos.z + 0.35, profilesContextState.c2n(pal.p[3]), ea * .95);
  }
  for (const o of profilesContextState.O.values()) if (o.fx > .03) {
    const g: any = mat('#2fe38a'),
      r: any = o.sr / sceneFoundationState.S * (1.15 + .7 * (1 - o.fx)),
      cx: any = o.sx / sceneFoundationState.S,
      cy: any = o.sy / sceneFoundationState.S;
    for (let i: any = 0; i < 40; i++) {
      if (i >> 1 & 1) continue;
      const th: any = i / 40 * 6.2832 + sceneFoundationState.tm * 3;
      pset(cx + Math.cos(th) * r, cy + Math.sin(th) * r * .8, 60, g, 3.6);
    }
    o.fx *= .97;
  }
  for (const [k, t] of objectRendererState.ATP) if (!objectRendererState.aused.has(k)) t.visible = false;
}

// ---------------- 12h. Object frame update & draw ----------------
