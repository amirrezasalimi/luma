/** agent-conversations: runtime implementation. */
import { profilesContextState } from './profiles-context';
import { sceneFoundationState } from './scene-foundation';
import { cancelTurn, clearSTTDebounce, speak, startRec, stopRec, userText, voicePipelineState } from './voice-pipeline';
import { renderAg, workspaceUiState } from './workspace-bridge';
import { cameraInputState } from './camera-input';
import { tap } from './microphone';
import { logA, tell } from './agent-orchestrator';
import { logAdd } from './scene-hud';
import { hologramControlsState } from './hologram-controls';
import { drain } from './speech-playback';
import { mainOrchestratorState } from './main-orchestrator';
import { loadVoiceCatalog } from './voice-preview';
import { checkpointConversation } from './workspace-history';
import { fitPanel, stopPanelMove } from './panels-widgets';

interface ModuleState {
  ansW: any;
  mq: any;
}

export const agentConversationsState = {} as ModuleState;

export
// ---------------- 15b. Talk target: click a sub-agent to talk to it, click the core for Luma ----------------
function setTalk(id?: any): any {
  const a: any = id && profilesContextState.AG.get(id),
    next: any = a ? a.id : null;
  if (next !== sceneFoundationState.talkTo) {
    cancelTurn();
    clearSTTDebounce();
    sceneFoundationState.pulses = [];
    sceneFoundationState.bars.fill(0);
    sceneFoundationState.micE = 0;
  }
  sceneFoundationState.talkTo = next;
  sceneFoundationState.talkName = a ? a.name : '';
  workspaceUiState.msg(a ? 'Talking to ' + a.name + ' (tap the core to return to Luma)' : 'Talking to Luma');
  sceneFoundationState.lab.text = a ? 'TALKING TO ' + a.name.toUpperCase() : sceneFoundationState.mode === 'idle' ? 'TAP THE CORE TO SPEAK' : voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
}
export async function awaitAgentConversation(a?: any, text?: any): Promise<any> {
  try {
    sceneFoundationState.actx = sceneFoundationState.actx || new AudioContext({
      sampleRate: 16000
    });
    await sceneFoundationState.actx.resume();
    if (profilesContextState.AG.get(a.id) !== a) return;
    if (sceneFoundationState.mode === 'idle') sceneFoundationState.mode = 'listening';
    setTalk(a.id);
    await userText(text);
  } catch (e: any) {
    logA(a, 'Conversation failed: ' + e.message, true);
  }
}
export function queueSpeech(text?: any, voice?: any, agent: any = null): any {
  const epoch: any = voicePipelineState.speechEpoch,
    id: any = voicePipelineState.turnId,
    workspace: any = hologramControlsState.workspaceEpoch;
  const valid: any = (): any => epoch === voicePipelineState.speechEpoch && id === voicePipelineState.turnId && workspace === hologramControlsState.workspaceEpoch && (agent ? profilesContextState.AG.get(agent.id) === agent && voicePipelineState.speechTargetActive(agent) : !sceneFoundationState.talkTo);
  const p: any = voicePipelineState.sq.then(async (): Promise<any> => {
    if (!valid() || voicePipelineState.profileMuted(agent)) return;
    const v: any = await pickVoice(voice == null ? voicePipelineState.profileVoice(agent) : voice);
    while (valid() && voicePipelineState.busy) await profilesContextState.sl(100);
    if (!valid()) return;
    const wasIdle: any = sceneFoundationState.mode === 'idle',
      idle: any = wasIdle && !agent,
      c: any = new AbortController();
    voicePipelineState.speechController = c;
    voicePipelineState.aborted = false;
    if (!idle) {
      voicePipelineState.busy = true;
      stopRec();
      sceneFoundationState.mode = 'speaking';
      sceneFoundationState.spkT = 0;
      if (agent) sceneFoundationState.lab.text = '< ' + agent.name + ': ' + text.slice(0, 50);
    }
    try {
      sceneFoundationState.actx = sceneFoundationState.actx || new AudioContext({
        sampleRate: 16000
      });
      await sceneFoundationState.actx.resume();
      if (!valid()) return;
      c.signal.throwIfAborted();
      await speak(text, c.signal, v, agent);
      await drain(c.signal);
    } finally {
      if (voicePipelineState.speechController === c) voicePipelineState.speechController = null;
      if (valid() && !idle) {
        voicePipelineState.busy = false;
        voicePipelineState.pAn = null;
        if (sceneFoundationState.mode === 'speaking') {
          sceneFoundationState.mode = wasIdle ? 'idle' : 'listening';
          sceneFoundationState.lab.text = wasIdle ? 'TAP THE CORE TO SPEAK' : sceneFoundationState.talkTo ? 'TALKING TO ' + sceneFoundationState.talkName.toUpperCase() : voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
          if (!wasIdle) startRec();
        }
      }
    }
  });
  voicePipelineState.sq = p.catch((): any => {});
  return p;
}
export function agentVoice(a?: any, t?: any): any {
  t = mainOrchestratorState.strip(String(t || '')).trim().slice(0, 300);
  if (!t || a.muted || !voicePipelineState.speechTargetActive(a)) return;
  a.lastNarration = {
    text: t,
    at: Date.now(),
    turn: voicePipelineState.turnId
  };
  queueSpeech(t, voicePipelineState.profileVoice(a), a).catch((e?: any): any => {
    if (e.name !== 'AbortError') {
      logA(a, 'Speech failed: ' + e.message, true);
      console.warn(e);
    }
  });
}
// ---------------- TTS from scripts, voices list, ask main / agents ----------------
export function waitA(a?: any): any {
  return new Promise((res?: any): any => {
    const f: any = (v?: any): any => {
        clearTimeout(i);
        res(v);
      },
      i: any = setTimeout((): any => {
        a.waiters = a.waiters.filter((w?: any): any => w !== f);
        res(null);
      }, 90000);
    a.waiters.push(f);
  });
}
export async function voicesList(): Promise<any> {
  const catalog: any = await loadVoiceCatalog();
  return {
    model: [...(voicePipelineState.ph?.voices || [])],
    catalog: catalog.map((v?: any): any => ({
      id: 'catalog:' + v.voice_id,
      name: v.name,
      locale: v.locale,
      gender: v.gender
    })),
    current: sceneFoundationState.cfg.voice || 'default'
  };
}
// voice is optional: empty / null / undefined falls back to the voice chosen in Settings
export async function pickVoice(n?: any): Promise<any> {
  if (n == null || n === '') return undefined;
  const L: any = await voicesList(),
    lc: any = String(n).toLowerCase();
  if (L.model.includes(n)) return n;
  const c: any = L.catalog.find((v?: any): any => v.id === n || String(v.name).toLowerCase() === lc || v.id.toLowerCase() === 'catalog:' + lc);
  if (c) return c.id;
  throw new Error('unknown voice "' + n + '" (see getVoicesLists())');
}
export function ttsQ(text?: any, voice?: any, agent: any = null): any {
  if (agent) agent.reportSpeechEpoch = voicePipelineState.speechEpoch;
  const clean: any = mainOrchestratorState.strip(String(text ?? '')).trim().slice(0, 400);
  if (agent?.lastNarration?.turn === voicePipelineState.turnId && agent.lastNarration.text === clean && Date.now() - agent.lastNarration.at < 15000) return Promise.resolve();
  return queueSpeech(clean, voice, agent);
}
export function askMain(text?: any, by?: any): any {
  const epoch: any = voicePipelineState.speechEpoch,
    workspace: any = hologramControlsState.workspaceEpoch;
  const p: any = agentConversationsState.mq.then(async (): Promise<any> => {
    const valid: any = (): any => epoch === voicePipelineState.speechEpoch && workspace === hologramControlsState.workspaceEpoch && !sceneFoundationState.talkTo;
    while (valid() && (voicePipelineState.busy || sceneFoundationState.mode === 'thinking' || sceneFoundationState.mode === 'speaking')) await profilesContextState.sl(100);
    if (!valid()) return '';
    const idle: any = sceneFoundationState.mode === 'idle';
    sceneFoundationState.actx = sceneFoundationState.actx || new AudioContext({
      sampleRate: 16000
    });
    await sceneFoundationState.actx.resume();
    if (!valid()) return '';
    const response: any = userText('[from ' + by + '] ' + String(text).slice(0, 800), true),
      id: any = voicePipelineState.turnId;
    const answer: any = await response;
    if (id !== voicePipelineState.turnId || workspace !== hologramControlsState.workspaceEpoch) return '';
    if (idle) {
      sceneFoundationState.mode = 'idle';
      voicePipelineState.busy = false;
      stopRec();
      sceneFoundationState.lab.text = 'TAP THE CORE TO SPEAK';
    }
    return mainOrchestratorState.strip(answer || '').trim();
  });
  agentConversationsState.mq = p.catch((): any => {});
  return p;
}
// ---------------- draggable panels (drag only by the handle, so the title stays editable) ----------------
export function dragPanel(n?: any): any {
  const h: any = profilesContextState.$$('h4', n);
  h.addEventListener('pointerdown', (e?: any): any => {
    if (!e.target.closest('.ph')) return;
    const r0: any = n.getBoundingClientRect(),
      ox: any = e.clientX - r0.left,
      oy: any = e.clientY - r0.top,
      pq: any = [...profilesContextState.PN.values()].find((v?: any): any => v.node === n);
    if (pq) {
      stopPanelMove(pq);
      if (n.classList.contains('fl')) fitPanel(n, r0.left, r0.top);
    }
    h.setPointerCapture(e.pointerId);
    const mv: any = (ev?: any): any => {
      if (pq) pq.corner = null;
      if (!n.classList.contains('fl')) {
        n.classList.add('fl');
        n.style.width = r0.width + 'px';
        document.body.append(n);
      }
      fitPanel(n, ev.clientX - ox, ev.clientY - oy);
    };
    const un: any = (): any => {
      h.removeEventListener('pointermove', mv);
      h.removeEventListener('pointerup', un);
      h.removeEventListener('pointercancel', un);
    };
    h.addEventListener('pointermove', mv);
    h.addEventListener('pointerup', un);
    h.addEventListener('pointercancel', un);
  });
}

// ---------------- 15a. Luma awareness + orchestrator directives ----------------
export function selectAgentAtPointer(e?: any): any {
    const r: any = cameraInputState.V.getBoundingClientRect(),
      k: any = cameraInputState.V.width / r.width,
      x: any = (e.clientX - r.left) * k,
      y: any = (e.clientY - r.top) * k;
    const hit: any = [...profilesContextState.AG.values()].filter((a?: any): any => Number.isFinite(a.sx) && Math.hypot(x - a.sx, y - a.sy) < a.sr).sort((a?: any, b?: any): any => Math.hypot(x - a.sx, y - a.sy) - Math.hypot(x - b.sx, y - b.sy))[0];
    if (!hit) return false;
    hit.open = true;
    workspaceUiState.agp.classList.remove('c');
    renderAg();
    setTalk(hit.id);
    if (sceneFoundationState.mode === 'idle') tap();
    e.lumaAgentSelected = true;
    return true;
}
export function agentTalk(t?: any, target: any = sceneFoundationState.talkTo): any {
    const a: any = profilesContextState.AG.get(target);
    if (!a) {
      return false;
    }
    checkpointConversation(a.name + ' conversation turn');
    logAdd('user', '> ' + a.name + ': ' + t);
    tell(a, 'USER SAYS (spoken): ' + t + ' -- You are the selected conversation partner. Answer directly in one short speakable status line, then act if needed; call idle() when only conversing. Your status line is automatically spoken using your own voice: do not repeat it with speak_tts(), say(), or ask_main_agent().');
    return true;
}
export function connectAgentConversations(): void {
  agentConversationsState.ansW = (a?: any, t?: any): any => a.waiters.splice(0).forEach((f?: any): any => f(t));
  agentConversationsState.mq = Promise.resolve();
}
