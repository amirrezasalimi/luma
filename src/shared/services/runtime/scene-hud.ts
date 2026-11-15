/** scene-hud: runtime implementation. */
import * as PIXI from 'pixi.js';
import { setEngine, setMute, voicePipelineState } from './voice-pipeline';
import { sceneFoundationState } from './scene-foundation';
import { proj } from './raster-primitives';
import { checkpointFloorMessage } from './workspace-history';

interface ModuleState {
  c3: any;
  GR: any;
  CYr: any;
  GH: any;
  CHz: any;
  mixc: any;
  abgr: any;
  mkT: any;
  lt: any;
  hgx: any;
  AGL: any;
}

export const sceneHudState = {} as ModuleState;

export function themeStep(): any {
  voicePipelineState.theme += ((sceneFoundationState.mode === 'speaking' && !voicePipelineState.speechOwner ? 1 : 0) - voicePipelineState.theme) * .07;
  for (let i: any = 0; i < 4; i++) sceneFoundationState.P[4 + i] = sceneHudState.abgr(sceneHudState.mixc(sceneHudState.GR[i], sceneHudState.CYr[i], voicePipelineState.theme));
  for (let i: any = 0; i < 3; i++) sceneFoundationState.HZ[i] = sceneHudState.abgr(sceneHudState.mixc(sceneHudState.GH[i], sceneHudState.CHz[i], voicePipelineState.theme));
  const c: any = sceneHudState.mixc(sceneFoundationState.TC0, sceneFoundationState.TCs, voicePipelineState.theme);
  voicePipelineState.tcol = c[0] << 16 | c[1] << 8 | c[2];
}
export function logAdd(role?: any, text?: any): any {
  checkpointFloorMessage(role, text);
  const t: any = new PIXI.Text((role === 'user' ? 'YOU' : 'JARVIS') + '\n' + text, {
    fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
    fontSize: 18,
    lineHeight: 28,
    fill: role === 'user' ? 0xfff1a0 : 0xe4fffb,
    wordWrap: true,
    wordWrapWidth: 480,
    breakWords: true
  });
  t.transcriptRole = role;
  t.transcriptText = text;
  t.resolution = 2;
  t.alpha = 0;
  t.logTime = performance.now();
  sceneFoundationState.app.stage.addChild(t);
  voicePipelineState.LOG.push(t);
}
export
// Floor transcript: text-local X/Y map to world X/Z, just above the floor.
function drawLog(): any {
  const unit: any = 6 / 480,
    gap: any = .35,
    visible: any = [],
    now: any = performance.now();
  let height: any = 0;
  for (let i: any = voicePipelineState.LOG.length - 1; i >= 0; i--) {
    const t: any = voicePipelineState.LOG[i];
    t.visible = false;
    const h: any = t.height * unit;
    if (visible.length >= 6 || visible.length && height + h > 9) continue;
    visible.unshift({
      t,
      h,
      age: voicePipelineState.LOG.length - 1 - i
    });
    height += h + gap;
  }
  let z: any = -4.5;
  for (const {
    t,
    h,
    age
  } of visible) {
    const p: any = proj(4.8, .04, z),
      x: any = proj(4.8 + unit, .04, z),
      y: any = proj(4.8, .04, z + unit);
    t.transform.setFromMatrix(new PIXI.Matrix((x[0] - p[0]) * sceneFoundationState.S, (x[1] - p[1]) * sceneFoundationState.S, (y[0] - p[0]) * sceneFoundationState.S, (y[1] - p[1]) * sceneFoundationState.S, p[0] * sceneFoundationState.S, p[1] * sceneFoundationState.S));
    const target: any = age === 0 ? .85 : Math.max(.12, .85 * Math.exp(-age * .3 - (now - t.logTime) / 60000));
    t.alpha += (target - t.alpha) * .06;
    t.visible = true;
    z += h + gap;
  }
}
export function lbl(k?: any, s?: any, X?: any, Y?: any, R?: any, fr?: any, fn?: any): any {
  const d: any = devicePixelRatio || 1,
    t: any = sceneHudState.lt(k);
  t.text = s;
  t.style.fontSize = Math.round(11 * d);
  t.anchor.set(R == null ? .5 : R ? 0 : 1, .5);
  t.x = X + (R == null ? 0 : (R ? 10 : -10) * d);
  t.y = Y;
  t.alpha = fr;
  t.tint = voicePipelineState.tcol;
  t.visible = true;
  if (fn) {
    const w: any = t.width,
      h: any = t.height,
      x0: any = t.x - w * t.anchor.x - 5,
      y0: any = Y - h / 2 - 3;
    sceneHudState.hgx.lineStyle(1, voicePipelineState.tcol, .7 * fr).drawRect(x0, y0, w + 10, h + 6);
    if (fr > .5) voicePipelineState.btns.push({
      x0,
      y0,
      x1: x0 + w + 10,
      y1: y0 + h + 6,
      fn
    });
  }
}
export function hud(): any {
  const d: any = devicePixelRatio || 1,
    cd: any = proj(sceneFoundationState.HX, sceneFoundationState.HY, sceneFoundationState.HQ)[2];
  sceneHudState.hgx.clear();
  voicePipelineState.btns.length = 0;
  sceneFoundationState.lab.tint = voicePipelineState.tcol;
  let k: any = 0;
  const L: any = [[.2, 2.6, 'STATUS ' + sceneFoundationState.mode.toUpperCase() + (sceneFoundationState.talkTo ? ' > ' + sceneFoundationState.talkName.toUpperCase() : ''), null, 'status'], [2.2, -1.2, 'MIC LEVEL ' + '#'.repeat(Math.round(sceneFoundationState.micE * 10)).padEnd(10, '.'), null, 'mic_level'], [3.6, 2.2, 'MIC ' + (voicePipelineState.muted ? 'MUTED' : 'LIVE') + ' [M]', (): any => setMute(!voicePipelineState.muted), 'mic'], [5.1, -.4, 'STT ' + (sceneFoundationState.cfg.sttMode === 'browser' ? 'BROWSER' : 'WHISTLE') + ' [SWITCH]', setEngine, 'stt'], [1.2, -2.2, 'LLM ' + sceneFoundationState.cfg.model, null, 'llm']].filter((l?: any): any => !sceneFoundationState.HLH.has(l[4])).map((l?: any): any => sceneFoundationState.HLT.has(l[4]) ? [l[0], l[1], sceneFoundationState.HLT.get(l[4]), l[3], l[4]] : l);
  // C = orbit centre {x,y,z,s,d}: the main hologram by default, or a sub-agent hologram
  const place: any = ([a0, y, s, fn, id, col, rad, spd]: any, C?: any): any => {
    C = C || {
      x: sceneFoundationState.HX,
      y: sceneFoundationState.HY,
      z: sceneFoundationState.HQ,
      s: sceneFoundationState.HSC
    };
    const a: any = a0 + sceneFoundationState.tm * (spd ?? .06),
      R: any = (rad ?? 5.4) * C.s,
      p: any = proj(C.x + Math.cos(a) * R, C.y + y * C.s, C.z + Math.sin(a) * R),
      q: any = proj(C.x + Math.cos(a) * 3.1 * C.s, C.y + y * .5 * C.s, C.z + Math.sin(a) * 3.1 * C.s),
      fr: any = p[2] > (C.d == null ? cd : C.d) ? 1 : .3,
      X: any = Math.round(p[0] * sceneFoundationState.S),
      Y: any = Math.round(p[1] * sceneFoundationState.S),
      c: any = col == null ? voicePipelineState.tcol : col;
    sceneHudState.hgx.lineStyle(Math.max(1, sceneFoundationState.S >> 1), c, .55 * fr).moveTo(Math.round(q[0] * sceneFoundationState.S), Math.round(q[1] * sceneFoundationState.S)).lineTo(X, Y);
    sceneHudState.hgx.lineStyle(0).beginFill(c, fr).drawRect(X - sceneFoundationState.S, Y - sceneFoundationState.S, sceneFoundationState.S * 2, sceneFoundationState.S * 2).endFill();
    lbl(k++, s, X, Y, p[0] > q[0], fr, fn);
    if (col != null) voicePipelineState.hTx[k - 1].tint = col;
  };
  L.forEach((l?: any): any => place(l));
  for (const h of sceneFoundationState.HLB.values()) place([h.a, h.y, h.text, h.fn, h.id, h.color, h.r, h.speed]);
  for (const g of sceneHudState.AGL()) for (const h of g.labels) place([h.a, h.y, h.text, h.fn, h.id, h.color, h.r, h.speed], g.C);
  for (let j: any = k; j < voicePipelineState.hTx.length; j++) voicePipelineState.hTx[j].visible = false;
  drawLog();
}
// Separate signals: microphone drives the floor; only AI activity drives the sphere.
export function updateEnergy(dt?: any): any {
  let level: any = 0;
  if (sceneFoundationState.mode === 'listening' && !voicePipelineState.muted && sceneFoundationState.an) {
    sceneFoundationState.an.getByteFrequencyData(sceneFoundationState.fd);
    let sum: any = 0;
    for (let i: any = 0; i < sceneFoundationState.fd.length; i++) sum += sceneFoundationState.fd[i];
    level = Math.min(1, sum / sceneFoundationState.fd.length / 110);
    for (let i: any = 0; i < 96; i++) sceneFoundationState.bars[i] += ((sceneFoundationState.fd[2 + i % 48 * 2] || 0) / 255 - sceneFoundationState.bars[i]) * .4;
  } else for (let i: any = 0; i < 96; i++) sceneFoundationState.bars[i] *= .9;
  sceneFoundationState.micE += (level - sceneFoundationState.micE) * .25;
  voicePipelineState.speechLevel = 0;
  if (sceneFoundationState.mode === 'speaking' && voicePipelineState.pAn) {
    voicePipelineState.pAn.getByteFrequencyData(voicePipelineState.pFd);
    let sum: any = 0;
    for (let i: any = 0; i < voicePipelineState.pFd.length; i++) sum += voicePipelineState.pFd[i];
    voicePipelineState.speechLevel = Math.min(1, sum / voicePipelineState.pFd.length / 90);
  }
  if (sceneFoundationState.mode === 'speaking' && voicePipelineState.speechOwner) sceneFoundationState.tE = .06;else if (sceneFoundationState.mode === 'speaking' && voicePipelineState.pAn) sceneFoundationState.tE = voicePipelineState.speechLevel;else if (sceneFoundationState.mode === 'thinking') sceneFoundationState.tE = .2 + .15 * Math.sin(sceneFoundationState.tm * 8);else if (sceneFoundationState.mode === 'speaking') {
    sceneFoundationState.spkT += dt;
    sceneFoundationState.tE = .15 + Math.max(0, Math.sin(sceneFoundationState.spkT * 13) * Math.sin(sceneFoundationState.spkT * 4.3 + 1)) * .72;
  } else sceneFoundationState.tE = .06;
  sceneFoundationState.E += (sceneFoundationState.tE - sceneFoundationState.E) * .25;
  if (sceneFoundationState.micE > .35 && Math.random() < .18) sceneFoundationState.pulses.push(0);
  let kept: any = 0;
  for (let i: any = 0; i < sceneFoundationState.pulses.length; i++) {
    const radius: any = sceneFoundationState.pulses[i] + dt * 4;
    if (radius < sceneFoundationState.SR) sceneFoundationState.pulses[kept++] = radius;
  }
  sceneFoundationState.pulses.length = kept;
}

// ============================================================================
// 11. FRAME LOOP
// ============================================================================
// Geometry is independent of floor radius and microphone position, which can ease every frame.
export function createSceneHud(): void {
  sceneHudState.c3 = (h?: any): any => parseInt(h.slice(1), 16);
  sceneHudState.GR = ['#5a1f8a', '#e8541c', '#ffb400', '#fff1a0'].map(sceneHudState.c3);
  sceneHudState.CYr = ['#1a2f8a', '#1fa3d6', '#44e0e8', '#e4fffb'].map(sceneHudState.c3);
  sceneHudState.GH = ['#1a0e3c', '#3a1450', '#6a2a50'].map(sceneHudState.c3);
  sceneHudState.CHz = ['#0c1a4a', '#0f3a6a', '#1a6a8a'].map(sceneHudState.c3);
  sceneHudState.mixc = (a?: any, b?: any, t?: any): any => [(a >> 16 & 255) * (1 - t) + (b >> 16 & 255) * t | 0, (a >> 8 & 255) * (1 - t) + (b >> 8 & 255) * t | 0, (a & 255) * (1 - t) + (b & 255) * t | 0];
  sceneHudState.abgr = (c?: any): any => 0xff000000 | c[2] << 16 | c[1] << 8 | c[0];
  sceneHudState.mkT = (): any => {
    const t: any = new PIXI.Text('', {
      fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
      fontSize: 12,
      fill: 0xffffff,
      letterSpacing: 2
    });
    sceneFoundationState.app.stage.addChild(t);
    return t;
  };
  sceneHudState.lt = (k?: any): any => voicePipelineState.hTx[k] || (voicePipelineState.hTx[k] = sceneHudState.mkT());
  sceneHudState.hgx = new PIXI.Graphics();
  sceneFoundationState.app.stage.addChild(sceneHudState.hgx);
  // sub-agent label sources, filled in by the agent module: [{C:{x,y,z,s,d},labels:[...]}]
  sceneHudState.AGL = (): any => [];
}
