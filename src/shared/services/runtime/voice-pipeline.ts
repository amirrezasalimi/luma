/** voice-pipeline: runtime implementation. */
import { useSettingsStore, saveSettings } from "../../../stores/settings";
import { sceneFoundationState } from './scene-foundation';
import { logAdd } from './scene-hud';
import { drain, stopSpeech } from './speech-playback';
import { resolveVoice, stopVoiceDemo } from './voice-preview';
import { setBuildToolsVisible } from './workspace-bridge';

interface ModuleState {
  pAn: any;
  pFd: any;
  proc: any;
  busy: boolean;
  vadOn: boolean;
  aborted: boolean;
  chunks: any;
  prev: any;
  quiet: number;
  talking: boolean;
  hist: any;
  cat: any;
  imp: any;
  muted: boolean;
  theme: number;
  tcol: number;
  nf: number;
  vc: number;
  lastLive: number;
  liveBusy: boolean;
  rec: any;
  wq: any;
  turnId: number;
  turnController: any;
  LOG: any;
  btns: any;
  hTx: any;
  sleep: any;
  STT_DEBOUNCE_MS: number;
  sttTimer: any;
  sttPending: string;
  junk: any;
  ww: any;
  wReady: any;
  wRes: any;
  wseq: number;
  sq: any;
  speechEpoch: number;
  speechController: any;
  speechOwner: any;
  speechLevel: number;
  ph: any;
  pctl: any;
  pt: number;
  srcs: any;
  phLoading: any;
  phKey: string;
  profileMuted: any;
  profileVoice: any;
  speechTargetActive: any;
}

export const voicePipelineState = {} as ModuleState;

export function clearSTTDebounce(): any {
  clearTimeout(voicePipelineState.sttTimer);
  voicePipelineState.sttTimer = null;
  voicePipelineState.sttPending = '';
}
export function debounceSTT(text: any = ''): any {
  if (text) voicePipelineState.sttPending += (voicePipelineState.sttPending ? ' ' : '') + text;
  clearTimeout(voicePipelineState.sttTimer);
  if (!voicePipelineState.sttPending) return;
  voicePipelineState.sttTimer = setTimeout((): any => {
    const t: any = voicePipelineState.sttPending;
    clearSTTDebounce();
    if (sceneFoundationState.mode === 'listening' && !voicePipelineState.busy && !voicePipelineState.muted && !voicePipelineState.junk(t)) userText(t);
  }, voicePipelineState.STT_DEBOUNCE_MS);
}
export
// VAD with adaptive noise floor + minimum voiced length; live text every ~1.3 s
function startVAD(src?: any): any {
  voicePipelineState.proc = sceneFoundationState.actx.createScriptProcessor(4096, 1, 1);
  const z: any = sceneFoundationState.actx.createGain();
  z.gain.value = 0;
  src.connect(voicePipelineState.proc);
  voicePipelineState.proc.connect(z);
  z.connect(sceneFoundationState.actx.destination);
  voicePipelineState.proc.onaudioprocess = (e?: any): any => {
    if (!voicePipelineState.vadOn || voicePipelineState.busy || voicePipelineState.muted || sceneFoundationState.cfg.sttMode === 'browser') return;
    const d: any = e.inputBuffer.getChannelData(0);
    let s: any = 0;
    for (let i: any = 0; i < d.length; i++) s += d[i] * d[i];
    const rms: any = Math.sqrt(s / d.length),
      thr: any = Math.max(.02, voicePipelineState.nf * 3 + .01);
    if (rms > thr) {
      if (!voicePipelineState.talking && voicePipelineState.prev) voicePipelineState.chunks.push(voicePipelineState.prev);
      voicePipelineState.talking = true;
      voicePipelineState.quiet = 0;
      voicePipelineState.vc++;
    } else if (!voicePipelineState.talking) voicePipelineState.nf = voicePipelineState.nf * .97 + rms * .03;else voicePipelineState.quiet += d.length / sceneFoundationState.actx.sampleRate;
    if (voicePipelineState.talking) {
      voicePipelineState.chunks.push(new Float32Array(d));
      const now: any = performance.now();
      if (now - voicePipelineState.lastLive > 1300 && !voicePipelineState.liveBusy && voicePipelineState.chunks.length > 4) {
        voicePipelineState.lastLive = now;
        voicePipelineState.liveBusy = true;
        const id: any = voicePipelineState.turnId;
        stt(voicePipelineState.cat(voicePipelineState.chunks)).then((t?: any): any => {
          if (id === voicePipelineState.turnId && voicePipelineState.talking && t) sceneFoundationState.lab.text = '> ' + t.trim().slice(-58);
        }).catch((): any => {}).finally((): any => {
          voicePipelineState.liveBusy = false;
        });
      }
      if (voicePipelineState.quiet > voicePipelineState.STT_DEBOUNCE_MS / 1000) {
        const a: any = voicePipelineState.cat(voicePipelineState.chunks),
          ok: any = voicePipelineState.vc >= 3;
        voicePipelineState.chunks = [];
        voicePipelineState.talking = false;
        voicePipelineState.quiet = 0;
        voicePipelineState.vc = 0;
        if (ok) turn(a);else sceneFoundationState.lab.text = 'LISTENING...';
      }
    } else voicePipelineState.prev = new Float32Array(d);
  };
}
// LLM streaming -> sentence queue -> TTS
// Each response owns its parser: hold partial delimiters until the next token.
export function streamSpeech(): any {
  let pending: any = '',
    hidden: any = '';
  return (t?: any, final: any = false): any => {
    pending += t;
    let out: any = '';
    while (pending) {
      if (hidden) {
        const close: any = hidden === 'fence' ? '```' : ']]',
          i: any = pending.indexOf(close);
        if (i < 0) {
          pending = final ? '' : pending.slice(-Math.min(close.length - 1, pending.length));
          break;
        }
        pending = pending.slice(i + close.length);
        hidden = '';
        out += ' ';
        continue;
      }
      if (pending.startsWith('```')) {
        pending = pending.slice(3);
        hidden = 'fence';
        continue;
      }
      if (pending.startsWith('[[')) {
        pending = pending.slice(2);
        hidden = 'directive';
        continue;
      }
      if (!final && (/^`{1,2}$/.test(pending) || pending === '[')) break;
      out += pending[0];
      pending = pending.slice(1);
    }
    return out;
  };
}
export async function ask(text?: any, id: any = voicePipelineState.turnId): Promise<any> {
  const controller: any = new AbortController();
  voicePipelineState.turnController = controller;
  const signal: any = controller.signal,
    user: any = {
      role: 'user',
      content: text
    };
  voicePipelineState.hist.push(user);
  logAdd('user', text);
  sceneFoundationState.lab.text = 'THINKING...';
  const q: any = [],
    speech: any = streamSpeech();
  let fin: any = false,
    sp: any = null,
    full: any = '',
    sb: any = '',
    buf: any = '',
    committed: any = false;
  const enqueue: any = (t?: any, final: any = false): any => {
    sb += speech(t, final);
    let m: any;
    while (m = /^([\s\S]*?[.!?])\s+/.exec(sb)) {
      q.push(m[1]);
      sb = sb.slice(m[0].length);
      pump();
    }
    if (final && sb.trim()) {
      q.push(sb);
      sb = '';
      pump();
    }
  };
  const check: any = (): any => {
    signal.throwIfAborted();
    if (id !== voicePipelineState.turnId) throw new DOMException('Turn cancelled', 'AbortError');
  };
  const pump: any = (): any => {
    if (sp) return;
    sp = (async (): Promise<any> => {
      while (q.length || !fin) {
        check();
        if (!q.length) {
          await voicePipelineState.sleep(40);
          continue;
        }
        sceneFoundationState.mode = 'speaking';
        sceneFoundationState.spkT = 0;
        sceneFoundationState.lab.text = '< ' + full.slice(-58);
        await speak(q.shift(), signal);
      }
    })();
    sp.catch((): any => {});
  };
  try {
    const r: any = await fetch(sceneFoundationState.cfg.endpoint.replace(/\/$/, '') + '/chat/completions', {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + sceneFoundationState.cfg.key
      },
      body: JSON.stringify({
        model: sceneFoundationState.cfg.model,
        ...(sceneFoundationState.cfg.reasoningEffort ? {
          reasoning_effort: sceneFoundationState.cfg.reasoningEffort
        } : {}),
        stream: true,
        messages: [{
          role: 'system',
          content: sceneFoundationState.cfg.sys
        }, ...(window.prepareJarvisMessages ? await window.prepareJarvisMessages(voicePipelineState.hist) : voicePipelineState.hist.slice(-12))]
      })
    });
    check();
    if (!r.ok) throw new Error('LLM ' + r.status);
    const rd: any = r.body.getReader(),
      dc: any = new TextDecoder();
    for (;;) {
      const {
        value,
        done
      }: any = await rd.read();
      check();
      buf += dc.decode(value, {
        stream: !done
      });
      const ls: any = buf.split('\n');
      buf = ls.pop();
      if (done && buf) {
        ls.push(buf);
        buf = '';
      }
      const consume: any = (l?: any): any => {
        if (!l.startsWith('data:') || l.slice(5).trim() === '[DONE]') return;
        let t: any = '';
        try {
          t = JSON.parse(l.slice(5)).choices[0].delta.content || '';
        } catch (e: any) {}
        full += t;
        enqueue(t);
      };
      for (const l of ls) consume(l);
      if (done) break;
    }
    check();
    enqueue('', true);
    fin = true;
    voicePipelineState.hist.push({
      role: 'assistant',
      content: full
    });
    committed = true;
    logAdd('ai', full);
    if (sp) await sp;
    check();
    await drain(signal);
    check();
    return full;
  } finally {
    fin = true;
    controller.abort();
    if (id !== voicePipelineState.turnId && !committed) {
      const i: any = voicePipelineState.hist.indexOf(user);
      if (i >= 0) voicePipelineState.hist.splice(i, 1);
    }
    if (voicePipelineState.turnController === controller) voicePipelineState.turnController = null;
  }
}
export async function turn(a?: any): Promise<any> {
  if (a.length < sceneFoundationState.actx.sampleRate * .5) return;
  const id: any = ++voicePipelineState.turnId;
  voicePipelineState.busy = true;
  voicePipelineState.aborted = false;
  sceneFoundationState.mode = 'thinking';
  sceneFoundationState.lab.text = 'TRANSCRIBING...';
  let t: any = '';
  try {
    t = (await stt(a)).trim();
  } catch (e: any) {
    if (id !== voicePipelineState.turnId) return;
    console.error(e);
    sceneFoundationState.lab.text = 'ERROR: ' + String(e.message || e).slice(0, 50);
    await voicePipelineState.sleep(2500);
  }
  if (id !== voicePipelineState.turnId) return;
  if (t && !voicePipelineState.junk(t)) await userText(t);else {
    voicePipelineState.busy = false;
    if (sceneFoundationState.mode !== 'idle') {
      sceneFoundationState.mode = 'listening';
      sceneFoundationState.lab.text = voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
    }
  }
}
export async function userText(t?: any, force?: any): Promise<any> {
  const target: any = sceneFoundationState.talkTo;
  cancelTurn();
  if (target && !force) {
    const routed: any = window.agentTalk?.(t, target);
    voicePipelineState.busy = false;
    if (sceneFoundationState.mode !== 'idle') {
      sceneFoundationState.mode = 'listening';
      sceneFoundationState.lab.text = routed ? 'TALKING TO ' + sceneFoundationState.talkName.toUpperCase() : 'SELECT AN AGENT AGAIN';
      startRec();
    }
    return;
  }
  const id: any = ++voicePipelineState.turnId;
  voicePipelineState.busy = true;
  voicePipelineState.aborted = false;
  stopRec();
  sceneFoundationState.mode = 'thinking';
  sceneFoundationState.lab.text = '> ' + t.slice(0, 58);
  let answer: any;
  try {
    answer = await ask(t, id);
  } catch (e: any) {
    if (id !== voicePipelineState.turnId || e.name === 'AbortError') return;
    console.error(e);
    sceneFoundationState.lab.text = 'ERROR: ' + String(e.message || e).slice(0, 50);
    await voicePipelineState.sleep(2500);
  }
  if (id !== voicePipelineState.turnId) return;
  voicePipelineState.busy = false;
  voicePipelineState.pAn = null;
  if (sceneFoundationState.mode !== 'idle') {
    sceneFoundationState.mode = 'listening';
    sceneFoundationState.lab.text = voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
    startRec();
  }
  return answer;
}
// STT = whistle-webgpu Space worker (init{cfg} -> progress/status/ready/result). UNVERIFIED: the request message below.
export function loadW(): any {
  if (voicePipelineState.wReady) return voicePipelineState.wReady;
  voicePipelineState.wReady = new Promise((ok?: any, bad?: any): any => {
    try {
      voicePipelineState.ww = new Worker('whistle/worker.js', {
        type: 'module'
      });
    } catch (e: any) {
      return bad(e);
    }
    voicePipelineState.ww.onerror = (): any => bad(new Error('whistle worker failed: put Space files in ./whistle/'));
    voicePipelineState.ww.onmessage = ({
      data: d
    }: any): any => {
      if (d.type === 'progress') sceneFoundationState.lab.text = 'STT ' + Math.round(100 * d.loaded / d.total) + '%';else if (d.type === 'status') sceneFoundationState.lab.text = 'STT: ' + d.text;else if (d.type === 'ready') ok(d);else if (d.type === 'result' && !d.partial && voicePipelineState.wRes) {
        const r: any = d.result || d.r || d;
        voicePipelineState.wRes(r.text || '');
        voicePipelineState.wRes = null;
      }
    };
    voicePipelineState.ww.postMessage({
      type: 'init',
      cfg: {}
    });
  });
  return voicePipelineState.wReady;
}
// whistle STT, serialized so live partials and the final pass never collide
export function stt(pcm?: any): any {
  const r: any = voicePipelineState.wq.then(async (): Promise<any> => {
    await loadW();
    const a: any = pcm.length > 480000 ? pcm.slice(-480000) : pcm;
    return new Promise((res?: any): any => {
      voicePipelineState.wRes = res;
      voicePipelineState.ww.postMessage({
        type: 'transcribe',
        pcm: a,
        seq: ++voicePipelineState.wseq
      });
    });
  });
  voicePipelineState.wq = r.catch((): any => {});
  return r;
}
// browser STT: interim text shown live
export function startRec(): any {
  if (sceneFoundationState.cfg.sttMode !== 'browser' || voicePipelineState.rec || voicePipelineState.muted || voicePipelineState.busy) return;
  const R: any = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) {
    sceneFoundationState.lab.text = 'BROWSER STT UNSUPPORTED';
    return;
  }
  voicePipelineState.rec = new R();
  voicePipelineState.rec.continuous = true;
  voicePipelineState.rec.interimResults = true;
  voicePipelineState.rec.lang = navigator.language || 'en-US';
  voicePipelineState.rec.onresult = (e?: any): any => {
    if (voicePipelineState.busy || voicePipelineState.muted) return;
    let t: any = '',
      final: any = '';
    for (let i: any = e.resultIndex; i < e.results.length; i++) {
      const r: any = e.results[i];
      t += r[0].transcript;
      if (r.isFinal && (r[0].confidence || 1) > .35) final += (final ? ' ' : '') + r[0].transcript;
    }
    t = t.trim();
    if (!t) return;
    sceneFoundationState.lab.text = '> ' + t.slice(-58);
    debounceSTT(final.trim());
  };
  voicePipelineState.rec.onerror = (e?: any): any => {
    if (e.error === 'not-allowed') sceneFoundationState.lab.text = 'MIC / SPEECH PERMISSION DENIED';
  };
  voicePipelineState.rec.onend = (): any => {
    voicePipelineState.rec = null;
    if (sceneFoundationState.mode === 'listening' && !voicePipelineState.busy && !voicePipelineState.muted && sceneFoundationState.cfg.sttMode === 'browser') setTimeout(startRec, 200);
  };
  try {
    voicePipelineState.rec.start();
  } catch (e: any) {
    voicePipelineState.rec = null;
  }
}
export function stopRec(): any {
  clearSTTDebounce();
  if (voicePipelineState.rec) {
    voicePipelineState.rec.onend = null;
    try {
      voicePipelineState.rec.abort();
    } catch (e: any) {}
    voicePipelineState.rec = null;
  }
}
// mute / cancel / engine switch
export function setMute(v?: any): any {
  voicePipelineState.muted = v;
  sceneFoundationState.stream && sceneFoundationState.stream.getAudioTracks().forEach((t?: any): any => t.enabled = !v);
  if (v) {
    stopRec();
    voicePipelineState.chunks = [];
    voicePipelineState.talking = false;
    voicePipelineState.vc = 0;
    if (sceneFoundationState.mode === 'listening') sceneFoundationState.lab.text = 'MIC MUTED (M)';
  } else if (sceneFoundationState.mode === 'listening') {
    sceneFoundationState.lab.text = 'LISTENING...';
    startRec();
  }
}
export function cancelTurn(): any {
  voicePipelineState.turnId++;
  voicePipelineState.speechEpoch++;
  voicePipelineState.speechController?.abort();
  voicePipelineState.speechController = null;
  voicePipelineState.sq = Promise.resolve();
  voicePipelineState.aborted = true;
  voicePipelineState.turnController?.abort();
  voicePipelineState.turnController = null;
  stopSpeech();
  stopRec();
  voicePipelineState.chunks = [];
  voicePipelineState.prev = null;
  voicePipelineState.talking = false;
  voicePipelineState.quiet = 0;
  voicePipelineState.vc = 0;
  voicePipelineState.busy = false;
  if (sceneFoundationState.mode !== 'idle') {
    sceneFoundationState.mode = 'listening';
    sceneFoundationState.lab.text = voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
    startRec();
  }
}
export function applyEngine(): any {
  stopRec();
  if (sceneFoundationState.mode === 'listening' && !voicePipelineState.muted && !voicePipelineState.busy) {
    if (sceneFoundationState.cfg.sttMode === 'browser') startRec();else loadW().catch(console.error);
  }
}
export function setEngine(): any {
  saveSettings({
    ...sceneFoundationState.cfg,
    sttMode: sceneFoundationState.cfg.sttMode === 'browser' ? 'whistle' : 'browser'
  });
}
export async function loadP(options: any = sceneFoundationState.cfg): Promise<any> {
  const key: any = JSON.stringify([options.tts, options.dev]);
  if (voicePipelineState.phLoading) {
    await voicePipelineState.phLoading;
    return loadP(options);
  }
  if (voicePipelineState.ph && voicePipelineState.phKey === key) return voicePipelineState.ph;
  if (voicePipelineState.ph) {
    voicePipelineState.ph.dispose();
    voicePipelineState.ph = null;
  }
  voicePipelineState.phKey = key;
  voicePipelineState.phLoading = initP(options);
  try {
    return await voicePipelineState.phLoading;
  } finally {
    voicePipelineState.phLoading = null;
  }
}
export async function initP(options?: any): Promise<any> {
  sceneFoundationState.lab.text = 'LOADING LOCAL TTS...';
  const M: any = await voicePipelineState.imp('./vendor/phonon-tts/index.js');
  const root: any = new URL('./models/phonon-31m-en-local-snapshot-92741c5b07d085ff840e26fea8ce43110b87852f/', location.href),
    file: any = (name?: any): any => new URL(name, root).href;
  const o: any = {
    lang: 'en',
    model: {
      weights: {
        q8: file('model.q8.gguf')
      },
      tokenizer: file('tokenizer.json'),
      config: file('config.json'),
      voices: {
        default: file('default-voice.safetensors')
      },
      defaultVoice: 'default'
    },
    onProgress: (p?: any): any => {
      sceneFoundationState.lab.text = 'TTS ' + Math.round(100 * p.loaded / (p.total || 1)) + '%';
    }
  };
  if ((options.tts || '').startsWith('hf://')) o.model = options.tts;
  if (options.dev === 'webgpu') {
    try {
      voicePipelineState.ph = await M.PhononTTS.load({
        ...o,
        device: 'webgpu'
      });
    } catch (e: any) {
      console.warn('phonon webgpu failed, using cpu', e);
      voicePipelineState.ph = await M.PhononTTS.load({
        ...o,
        device: 'cpu'
      });
    }
  } else voicePipelineState.ph = await M.PhononTTS.load({
    ...o,
    device: 'cpu'
  });
  return voicePipelineState.ph;
}
export async function speak(txt?: any, signal?: any, voice?: any, agent: any = null): Promise<any> {
  if (!voicePipelineState.speechTargetActive(agent) || voicePipelineState.profileMuted(agent)) return;
  signal?.throwIfAborted();
  const t: any = await loadP();
  signal?.throwIfAborted();
  if (!voicePipelineState.speechTargetActive(agent) || voicePipelineState.profileMuted(agent)) return;
  const ctl: any = new AbortController();
  voicePipelineState.pctl = ctl;
  voicePipelineState.speechOwner = agent;
  const abort: any = (): any => ctl.abort();
  signal?.addEventListener('abort', abort, {
    once: true
  });
  try {
    if (!voicePipelineState.pAn) {
      voicePipelineState.pAn = sceneFoundationState.actx.createAnalyser();
      voicePipelineState.pAn.fftSize = 256;
      voicePipelineState.pFd = new Uint8Array(voicePipelineState.pAn.frequencyBinCount);
      voicePipelineState.pAn.connect(sceneFoundationState.actx.destination);
    }
    const v: any = await resolveVoice(t, voice == null ? voicePipelineState.profileVoice(agent) : voice);
    signal?.throwIfAborted();
    if (!voicePipelineState.speechTargetActive(agent) || voicePipelineState.profileMuted(agent) || ctl.signal.aborted) return;
    for await (const c of t.stream(txt, {
      voice: v,
      signal: ctl.signal
    })) {
      signal?.throwIfAborted();
      if (!voicePipelineState.speechTargetActive(agent) || voicePipelineState.profileMuted(agent) || ctl.signal.aborted) break;
      const b: any = sceneFoundationState.actx.createBuffer(1, c.length, t.sampleRate);
      b.getChannelData(0).set(c);
      const s: any = sceneFoundationState.actx.createBufferSource();
      s.buffer = b;
      s.connect(voicePipelineState.pAn);
      voicePipelineState.pt = Math.max(voicePipelineState.pt, sceneFoundationState.actx.currentTime + .05);
      s.start(voicePipelineState.pt);
      voicePipelineState.pt += b.duration;
      voicePipelineState.srcs.push(s);
    }
  } catch (e: any) {
    if (signal?.aborted || !ctl.signal.aborted) throw e;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
export function connectVoicePipeline(): void {
  voicePipelineState.busy = false;
  voicePipelineState.vadOn = false;
  voicePipelineState.aborted = false;
  voicePipelineState.chunks = [];
  voicePipelineState.prev = null;
  voicePipelineState.quiet = 0;
  voicePipelineState.talking = false;
  voicePipelineState.hist = [];
  voicePipelineState.cat = (a?: any): any => {
    const o: any = new Float32Array(a.reduce((n?: any, x?: any): any => n + x.length, 0));
    let k: any = 0;
    for (const x of a) {
      o.set(x, k);
      k += x.length;
    }
    return o;
  };
  voicePipelineState.imp = (u?: any): any => import(/* @vite-ignore */new URL(u, location.href).href);
  voicePipelineState.muted = false;
  voicePipelineState.theme = 0;
  voicePipelineState.tcol = 0xffb400;
  voicePipelineState.nf = .004;
  voicePipelineState.vc = 0;
  voicePipelineState.lastLive = 0;
  voicePipelineState.liveBusy = false;
  voicePipelineState.rec = null;
  voicePipelineState.wq = Promise.resolve();
  voicePipelineState.turnId = 0;
  voicePipelineState.turnController = null;
  voicePipelineState.LOG = [];
  voicePipelineState.btns = [];
  voicePipelineState.hTx = [];
  voicePipelineState.sleep = (ms?: any): any => new Promise((r?: any): any => setTimeout(r, ms));
  voicePipelineState.STT_DEBOUNCE_MS = 1100;
  voicePipelineState.sttTimer = null;
  voicePipelineState.sttPending = '';
  voicePipelineState.junk = (t?: any): any => t.length < 2 || /^[\s.,!?-]*(you|uh+|um+|hm+|mm+|ah+|oh+|thanks for watching|bye)?[\s.,!?-]*$/i.test(t) || /^[\[(*].*[\])*]$/.test(t);
  voicePipelineState.wseq = 0;
  voicePipelineState.sq = Promise.resolve();
  voicePipelineState.speechEpoch = 0;
  voicePipelineState.speechController = null;
  addEventListener('keydown', (e?: any): any => {
    if (e.key === 'Escape') {
      e.preventDefault();
      stopVoiceDemo();
      cancelTurn();
      return;
    }
    if (e.defaultPrevented || e.isComposing) return;
    if ((e.key.toLowerCase() === 'm' || e.code === 'KeyM') && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.composedPath().some((n?: any): any => n instanceof Element && (n.matches('textarea,select,[role="textbox"],input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])') || (n instanceof HTMLElement && n.isContentEditable)))) {
      e.preventDefault();
      setMute(!voicePipelineState.muted);
      return;
    }
    if (e.composedPath().some((n?: any): any => n instanceof Element && (n.matches('form,input,textarea,select,button,a[href],[role="textbox"]') || (n instanceof HTMLElement && n.isContentEditable)))) return;
    if (e.key === 'Enter' && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && sceneFoundationState.mode !== 'idle') {
      e.preventDefault();
      stopVoiceDemo();
      cancelTurn();
      return;
    }
  });
  useSettingsStore.subscribe((state?: any, previous?: any): any => {
    sceneFoundationState.cfg = state.config;
    if (state.config.sttMode !== previous.config.sttMode) applyEngine();
  });
  // TTS = phonon-tts: PhononTTS.load({lang,device}) + tts.stream(text,{voice,signal}) -> Float32Array chunks @ tts.sampleRate
  voicePipelineState.speechOwner = null;
  voicePipelineState.speechLevel = 0;
  voicePipelineState.pt = 0;
  voicePipelineState.srcs = [];
  voicePipelineState.phLoading = null;
  voicePipelineState.phKey = '';
  voicePipelineState.profileMuted = (agent?: any): any => window.jarvisVoiceProfile?.muted(agent) ?? false;
  voicePipelineState.profileVoice = (agent?: any): any => window.jarvisVoiceProfile?.voice(agent) ?? sceneFoundationState.cfg.voice;
  voicePipelineState.speechTargetActive = (agent?: any): any => agent ? sceneFoundationState.talkTo === agent.id || agent.reportSpeechEpoch === voicePipelineState.speechEpoch : !sceneFoundationState.talkTo;
}
