/** scene-foundation: runtime implementation. */
// Registers Canvas renderers for Graphics/Text/Sprite as a fallback when WebGL
// is unavailable (disabled GPU, blocked contexts, or unsupported devices).
import * as PIXI from 'pixi.js-legacy';
import { useSettingsStore } from "../../../stores/settings";
import { sceneHudState } from './scene-hud';

interface ModuleState {
  $: any;
  cfg: any;
  hx: any;
  P: any;
  BG: any;
  HZ: any;
  Bay: any;
  NR: number;
  NP: number;
  rA: any;
  NT: any;
  pos: Float32Array;
  pm: Uint8Array;
  HX: number;
  HY: number;
  HQ: number;
  HR: number;
  SR: number;
  FG: number;
  HSC: number;
  TC0: number;
  TCs: number;
  HC: string;
  HCs: string;
  RC: string;
  FC: string;
  HT: any;
  HLB: any;
  HLH: any;
  HLT: any;
  sp_: any;
  cp_: any;
  rampN: any;
  holoGet: any;
  W: any;
  H: any;
  S: any;
  C: any;
  g2: any;
  img: any;
  u32: any;
  px: any;
  dep: any;
  sh: any;
  tex: any;
  spr: any;
  stageBackground: any;
  cam: any;
  mode: string;
  E: number;
  tE: number;
  micE: number;
  tm: number;
  spkT: number;
  bars: Float32Array;
  pulses: any;
  dragLock: boolean;
  talkTo: any;
  talkName: string;
  actx: any;
  an: any;
  fd: any;
  stream: any;
  app: any;
  lab: any;
  ring: any;
}

export const sceneFoundationState = {} as ModuleState;

export function holoSet(p?: any): any {
  p = p || {};
  const o: any = p.pos || p,
    cl: any = (v?: any, a?: any, b?: any): any => Math.min(b, Math.max(a, +v)),
    hex: any = (v?: any): any => {
      if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('color must be #rrggbb, got ' + v);
      return v;
    };
  if (o.x != null) sceneFoundationState.HT.x = cl(o.x, -12, 12);
  if (o.y != null) sceneFoundationState.HT.y = cl(o.y, .5, 12);
  if (o.z != null) sceneFoundationState.HT.z = cl(o.z, -12, 12);
  if (p.radius != null) sceneFoundationState.HT.r = cl(p.radius, .5, 6);
  if (p.floorRadius != null) sceneFoundationState.HT.sr = cl(p.floorRadius, 1.5, 16);
  if (p.floorGrid != null) sceneFoundationState.FG = cl(p.floorGrid, .3, 6);
  if (p.color != null) {
    sceneFoundationState.HC = hex(p.color);
    sceneHudState.GR.splice(0, 4, ...sceneFoundationState.rampN(sceneFoundationState.HC));
  }
  if (p.speakingColor != null) {
    sceneFoundationState.HCs = hex(p.speakingColor);
    sceneHudState.CYr.splice(0, 4, ...sceneFoundationState.rampN(sceneFoundationState.HCs));
  }
  if (p.ringColor != null) {
    sceneFoundationState.RC = hex(p.ringColor);
    sceneFoundationState.TC0 = parseInt(sceneFoundationState.RC.slice(1), 16);
  }
  if (p.ringSpeakingColor != null) sceneFoundationState.TCs = parseInt(hex(p.ringSpeakingColor).slice(1), 16);
  if (p.floorColor != null) {
    sceneFoundationState.FC = hex(p.floorColor);
    const f: any = sceneFoundationState.rampN(sceneFoundationState.FC);
    for (let i: any = 0; i < 4; i++) sceneFoundationState.P[i] = sceneHudState.abgr([f[i] >> 16 & 255, f[i] >> 8 & 255, f[i] & 255]);
  }
}
export function fitStageBackground(): any {
  const b: any = sceneFoundationState.stageBackground;
  if (!b.sprite || !b.image) return;
  const width: any = sceneFoundationState.app.screen.width,
    height: any = sceneFoundationState.app.screen.height,
    scale: any = Math.max(width / b.image.naturalWidth, height / b.image.naturalHeight);
  b.sprite.scale.set(scale);
  b.sprite.position.set(width / 2, height / 2);
  b.sprite.alpha = b.config.opacity;
}
export function clearStageBackgroundSprite(): any {
  const sprite: any = sceneFoundationState.stageBackground.sprite;
  if (sprite) {
    sprite.destroy({
      texture: true,
      baseTexture: true
    });
    sceneFoundationState.stageBackground.sprite = null;
  }
}
export function resize(): any {
  const d: any = devicePixelRatio || 1,
    DW: any = Math.round(innerWidth * d),
    DH: any = Math.round(innerHeight * d);
  sceneFoundationState.S = Math.max(2, Math.round(DW / (Number(new URLSearchParams(location.search).get('px')) || 600)));
  sceneFoundationState.W = Math.floor(DW / sceneFoundationState.S);
  sceneFoundationState.H = Math.floor(DH / sceneFoundationState.S);
  sceneFoundationState.app.renderer.resize(DW, DH);
  sceneFoundationState.C.width = sceneFoundationState.W;
  sceneFoundationState.C.height = sceneFoundationState.H;
  sceneFoundationState.img = sceneFoundationState.g2.createImageData(sceneFoundationState.W, sceneFoundationState.H);
  sceneFoundationState.u32 = new Uint32Array(sceneFoundationState.img.data.buffer);
  sceneFoundationState.px = new Uint8Array(sceneFoundationState.W * sceneFoundationState.H);
  sceneFoundationState.dep = new Float32Array(sceneFoundationState.W * sceneFoundationState.H);
  sceneFoundationState.sh = new Uint8Array(sceneFoundationState.W * sceneFoundationState.H);
  if (sceneFoundationState.spr) {
    sceneFoundationState.spr.destroy();
    sceneFoundationState.tex.destroy(true);
  }
  sceneFoundationState.tex = new PIXI.Texture(new PIXI.BaseTexture(sceneFoundationState.C, {
    scaleMode: PIXI.SCALE_MODES.NEAREST
  }));
  sceneFoundationState.spr = new PIXI.Sprite(sceneFoundationState.tex);
  sceneFoundationState.spr.scale.set(sceneFoundationState.S);
  sceneFoundationState.app.stage.addChildAt(sceneFoundationState.spr, sceneFoundationState.stageBackground.sprite ? 1 : 0);
  fitStageBackground();
  sceneFoundationState.lab.style.fontSize = Math.max(12, Math.round(13 * d));
  sceneFoundationState.lab.x = DW / 2;
  sceneFoundationState.lab.y = DH - 40 * d;
}
export function createStage(): void {
  sceneFoundationState.$ = (id?: any): any => document.getElementById(id);
  sceneFoundationState.cfg = useSettingsStore.getState().config;
  sceneFoundationState.hx = (h?: any): any => {
    const n: any = parseInt(h.slice(1), 16);
    return 0xff000000 | (n & 255) << 16 | n & 0xff00 | n >> 16 & 255;
  };
  sceneFoundationState.P = ['#140e30', '#241e5c', '#4a5a9e', '#d8b86a', '#5a1f8a', '#e8541c', '#ffb400', '#fff1a0', '#1a3d9a', '#1fa3d6', '#44e0d8', '#e4fff4'].map(sceneFoundationState.hx);
  sceneFoundationState.BG = sceneFoundationState.hx('#0a0720');
  sceneFoundationState.HZ = ['#1a0e3c', '#3a1450', '#6a2a50'].map(sceneFoundationState.hx);
  sceneFoundationState.Bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v?: any): any => (v + .5) / 16);
  sceneFoundationState.NR = 64;
  sceneFoundationState.NP = 44;
  sceneFoundationState.rA = [];
  for (let i: any = 0; i < sceneFoundationState.NR; i++) {
    const a: any = [Math.random() - .5, Math.random() - .5, Math.random() - .5],
      l: any = Math.hypot(...a);
    a.forEach((_?: any, k?: any): any => a[k] /= l);
    let u: any = [-a[1], a[0], 0];
    const ul: any = Math.hypot(...u) || 1;
    u = u.map((x?: any): any => x / ul);
    const v: any = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    sceneFoundationState.rA.push({
      u,
      v,
      R: 2.1 + Math.random() * .7,
      sp: (Math.random() - .5) * 1.2,
      ph: Math.random() * 6.28,
      span: 1.4 + Math.random() * 4.8,
      mat: i % 9 == 0 ? 2 : 1
    });
  }
  sceneFoundationState.NT = sceneFoundationState.NR * sceneFoundationState.NP + 160;
  sceneFoundationState.pos = new Float32Array(sceneFoundationState.NT * 3);
  sceneFoundationState.pm = new Uint8Array(sceneFoundationState.NT);
  sceneFoundationState.HX = 0;
  sceneFoundationState.HY = 3.7;
  sceneFoundationState.HQ = 0;
  sceneFoundationState.HR = 2.8;
  sceneFoundationState.SR = 6.4;
  sceneFoundationState.FG = 1.2;
  sceneFoundationState.HSC = 1;
  sceneFoundationState.TC0 = 0xffb400;
  sceneFoundationState.TCs = 0x44e0e8;
  sceneFoundationState.HC = '#ffb400';
  sceneFoundationState.HCs = '#44e0e8';
  sceneFoundationState.RC = '#ffb400';
  sceneFoundationState.FC = '#4a5a9e';
  sceneFoundationState.HT = {
    x: 0,
    y: 3.7,
    z: 0,
    r: 2.8,
    sr: 6.4
  };
  sceneFoundationState.HLB = new Map();
  sceneFoundationState.HLH = new Set();
  sceneFoundationState.HLT = new Map();
  sceneFoundationState.sp_ = Math.sin(Math.PI / 6);
  sceneFoundationState.cp_ = Math.cos(Math.PI / 6);
  sceneFoundationState.rampN = (h?: any): any => {
    const c: any = parseInt(h.slice(1), 16),
      m: any = (a?: any, b?: any, t?: any): any => a.map((v?: any, i?: any): any => v + (b[i] - v) * t),
      A: any = [c >> 16 & 255, c >> 8 & 255, c & 255],
      n: any = (a?: any): any => (a[0] | 0) << 16 | (a[1] | 0) << 8 | (a[2] | 0);
    return [n(m(A, [20, 8, 40], .75)), n(m(A, [20, 8, 40], .35)), n(A), n(m(A, [255, 246, 200], .6))];
  };
  sceneFoundationState.holoGet = (): any => ({
    x: +sceneFoundationState.HX.toFixed(2),
    y: +sceneFoundationState.HY.toFixed(2),
    z: +sceneFoundationState.HQ.toFixed(2),
    radius: +sceneFoundationState.HR.toFixed(2),
    floorRadius: +sceneFoundationState.SR.toFixed(2),
    floorGrid: sceneFoundationState.FG,
    target: {
      ...sceneFoundationState.HT
    },
    color: sceneFoundationState.HC,
    speakingColor: sceneFoundationState.HCs,
    ringColor: sceneFoundationState.RC,
    floorColor: sceneFoundationState.FC
  });
  sceneFoundationState.C = document.createElement('canvas');
  sceneFoundationState.g2 = sceneFoundationState.C.getContext('2d');
  sceneFoundationState.stageBackground = {
    config: {},
    image: null,
    colors: [],
    epoch: 0,
    sprite: null
  };
  sceneFoundationState.cam = {
    yaw: .6,
    zoom: 1,
    px: 0,
    py: 0
  };
  sceneFoundationState.mode = 'idle';
  sceneFoundationState.E = 0;
  sceneFoundationState.tE = 0;
  sceneFoundationState.micE = 0;
  sceneFoundationState.tm = 0;
  sceneFoundationState.spkT = 0;
  sceneFoundationState.bars = new Float32Array(96);
  sceneFoundationState.pulses = [];
  sceneFoundationState.dragLock = false;
  sceneFoundationState.talkTo = null;
  sceneFoundationState.talkName = '';
  sceneFoundationState.app = new PIXI.Application({
    background: 0x0a0720,
    antialias: false,
    resolution: 1,
    autoDensity: false
  });
  sceneFoundationState.app.view.id = 'v';
  document.body.prepend(sceneFoundationState.app.view);
  sceneFoundationState.lab = new PIXI.Text('TAP THE CORE TO SPEAK', {
    fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
    fontSize: 15,
    fill: 0xffffff,
    letterSpacing: 4,
    fontWeight: 'bold'
  });
  sceneFoundationState.lab.anchor.set(.5);
  sceneFoundationState.ring = new PIXI.Graphics();
  sceneFoundationState.app.stage.addChild(sceneFoundationState.ring, sceneFoundationState.lab);
  addEventListener('resize', resize);
  resize();

  // ============================================================================
  // 5. AUDIO / MIC / TAP
  // ============================================================================
}
