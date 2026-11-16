import { rpc } from '../rpc';
import { sessionsState } from './sessions';
import { speak, startRec, stopRec, streamSpeech, voicePipelineState } from './voice-pipeline';
import { hologramControlsState, logM } from './hologram-controls';
import { logAdd } from './scene-hud';
import { sceneFoundationState } from './scene-foundation';
import { updateSoul } from './profiles-context';
import { drain } from './speech-playback';
import { rq } from './workspace-bridge';
import type { AIEvent } from '../../../server/services/ai';

export let backendAgents: any[] = [];
let monitoring = false;
const outcomeCursors = new Map<string, number>();
let monitorBusy = false;
export function monitorBackendAgents(): void {
  if (monitoring) return;
  monitoring = true;
  const update = async () => {
    if (monitorBusy) return;
    monitorBusy = true;
    try {
    const session = sessionsState.activeSession?.id;
    if (session) {
      const agents = await rpc.host.ai.agents({ session });
      if (sessionsState.activeSession?.id !== session) return;
      backendAgents = agents;
      const { syncBackground } = await import('./background-sync');
      await syncBackground();
      const outcomes: any[] = await rpc.host.ai.outcomes({ session, after: outcomeCursors.get(session) || 0 });
      if (sessionsState.activeSession?.id !== session) return;
      for (const outcome of outcomes) {
        outcomeCursors.set(session, outcome.sequence);
        const key = 'outcome:' + outcome.run_id;
        if (hologramControlsState.MAIN.log.some((entry: any) => entry.backendEvent === key)) continue;
        logM(outcome.agent + ': ' + outcome.status + (outcome.outcome === 'unverified' ? ' — unverified' : '') + '\n' + outcome.detail.slice(0, 2000), outcome.status !== 'completed');
        const entry = hologramControlsState.MAIN.log.at(-1);
        if (entry) entry.backendEvent = key;
      }
      if (!voicePipelineState.busy && !recoveringRun && !activeRun) await restoreBackendRuns();
      const { rq } = await import('./workspace-bridge');
      rq();
    }
    } finally { monitorBusy = false; }
  };
  void update().catch(() => {});
  setInterval(() => { void update().catch(() => {}); }, 2000);
}

export async function* durableChat(input: Parameters<typeof rpc.host.ai.start>[0], signal: AbortSignal): AsyncGenerator<AIEvent> {
  const run = await rpc.host.ai.start(input);
  activeRun = run.id;
  try {
    const events = await rpc.host.ai.watch({ id: run.id, after: 0 }, { signal });
    for await (const item of events) {
      yield item.event;
      // Tag any tool entry produced by the normal stream consumer for replay deduplication.
      const entry = hologramControlsState.MAIN.log.at(-1);
      if (entry && item.event.type === 'pi') entry.backendEvent = run.id + ':' + item.sequence;
    }
  } finally { if (activeRun === run.id) activeRun = null; }
}
let activeRun: string | null = null;
let recovery: AbortController | null = null;
let recoveringRun: string | null = null;
export function cancelBackendRun(): void {
  recovery?.abort();
  if (activeRun) void rpc.host.ai.cancel({ id: activeRun }).catch(error => logM('Cancel failed: ' + error.message, true));
}

/** Reconnect to backend work without replaying browser scripts or actions. */
export async function restoreBackendRuns(): Promise<void> {
  const session = sessionsState.activeSession?.id;
  if (!session) return;
  const runs: any[] = await rpc.host.ai.runs({ session });
  if (sessionsState.activeSession?.id !== session) return;
  for (const run of runs.filter(r => r.agent === 'main' && (r.status === 'running' || r.status === 'completed')).slice(0, 1)) {
    if (recoveringRun === run.id || activeRun === run.id) continue;
    if (run.answer && voicePipelineState.hist.some((m: any) => m.role === 'assistant' && m.content === run.answer)) continue;
    void (async () => {
      recovery?.abort();
      const controller = new AbortController();
      recovery = controller;
      recoveringRun = run.id;
      const turn = voicePipelineState.turnId;
      const valid = () => !controller.signal.aborted && sessionsState.activeSession?.id === session && voicePipelineState.turnId === turn;
      const ownsStatus = run.status === 'running';
      if (ownsStatus) {
        activeRun = run.id;
        voicePipelineState.busy = true;
        stopRec();
        sceneFoundationState.mode = 'thinking';
        sceneFoundationState.lab.text = 'THINKING... (RECONNECTED)';
      }
      const speech = streamSpeech();
      let speechBuffer = '', speechQueue = Promise.resolve(), full = '', after = 0;
      const queueSpeech = (text: string) => {
        if (!text.trim() || sceneFoundationState.actx?.state !== 'running') return;
        speechQueue = speechQueue.then(async () => {
          if (!valid()) return;
          sceneFoundationState.mode = 'speaking';
          await speak(text, controller.signal);
        }).catch(error => { if (!controller.signal.aborted) logM('Speech: ' + error.message, true); });
      };
      const seen = new Set(hologramControlsState.MAIN.log.map((entry: any) => entry.backendEvent).filter(Boolean));
      let partial: any;
      try {
      const stream = await rpc.host.ai.watch({ id: run.id, after }, { signal: controller.signal });
      for await (const item of stream) {
        if (!valid()) { controller.abort(); break; }
        if (item.sequence <= after) continue;
        after = item.sequence;
        const event = item.event;
        const historical = item.sequence <= run.sequence;
        if (event.type === 'text') {
          full += event.text;
          const visible = full.replace(/```[\s\S]*?(```|$)/g, '').replace(/\[\[[\s\S]*?(\]\]|$)/g, '').trim();
          if (ownsStatus && visible) {
            if (!partial) {
              logM('AI (streaming): ' + visible.slice(-1000));
              partial = hologramControlsState.MAIN.log.at(-1);
            } else partial.text = 'AI (streaming): ' + visible.slice(-1000);
            rq();
          }
          if (ownsStatus) sceneFoundationState.lab.text = visible ? '< ' + visible.slice(-58) : 'THINKING...';
          if (!historical && ownsStatus) {
            speechBuffer += speech(event.text);
            let match: RegExpExecArray | null;
            while ((match = /^([\s\S]*?[.!?])\s+/.exec(speechBuffer))) {
              queueSpeech(match[1]); speechBuffer = speechBuffer.slice(match[0].length);
            }
          } else speech(event.text); // Track code fences, but never speak historical output.
        }
        if (event.type === 'pi') {
          const info = event.event;
          if (info.type === 'soul_updated') updateSoul(null, info.text);
          const key = run.id + ':' + item.sequence;
          if (!seen.has(key) && (info.type === 'tool_execution_start' || info.type === 'tool_execution_end' || info.type === 'extension_error')) {
            logM(info.type === 'extension_error' ? info.message : 'Pi: ' + info.toolName + (info.type === 'tool_execution_start' ? ' started' : info.isError ? ' failed' : ' completed'), info.type === 'extension_error' || (info.type === 'tool_execution_end' && !!info.isError));
            const entry = hologramControlsState.MAIN.log.at(-1);
            if (entry) {
              entry.backendEvent = key;
              if ('recordId' in info && info.recordId) entry.toolRecord = { id: info.recordId, session };
            }
            seen.add(key);
          }
          if (ownsStatus && info.type === 'tool_execution_start') sceneFoundationState.lab.text = 'WORKING: ' + info.toolName;
        }
        if (item.event.type === 'complete') {
          const text = item.event.text;
          if (partial) partial.text = 'AI: ' + text.replace(/```[\s\S]*?```/g, '').slice(-1000);
          if (ownsStatus) { speechBuffer += speech('', true); queueSpeech(speechBuffer); }
          if (!voicePipelineState.hist.some((m: any) => m.role === 'assistant' && m.content === text)) {
            voicePipelineState.hist.push({ role: 'assistant', content: text });
            // Do not replay code/directives after reconnect: host effects already ran.
            logM('Backend run completed: ' + text.slice(0, 250));
            logAdd('ai', text.replace(/```[\s\S]*?```/g, '').replace(/\[\[[\s\S]*?\]\]/g, '').trim());
            const { saveSession } = await import('./sessions');
            void saveSession(true).catch(error => logM('Backend result save failed: ' + error.message, true));
          }
        }
      }
      await speechQueue;
      if (valid() && ownsStatus && sceneFoundationState.actx?.state === 'running') await drain(controller.signal);
      } finally {
        if (valid() && ownsStatus) {
          voicePipelineState.busy = false;
          sceneFoundationState.mode = 'listening';
          sceneFoundationState.lab.text = voicePipelineState.muted ? 'MIC MUTED (M)' : 'LISTENING...';
          startRec();
        }
        if (activeRun === run.id) activeRun = null;
        if (recovery === controller) { recovery = null; recoveringRun = null; }
      }
    })().catch(error => { if (error.name !== 'AbortError') logM('Backend run: ' + error.message, true); });
  }
}
