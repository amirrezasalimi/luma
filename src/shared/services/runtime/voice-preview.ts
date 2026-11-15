/** voice-preview: runtime implementation. */
import { useRuntimeSettings } from "../settings";
import { loadP, setMute, voicePipelineState } from './voice-pipeline';
import { sceneFoundationState } from './scene-foundation';

interface ModuleState {
  VOICE_CATALOG: any;
  voiceCatalog: any;
  catalogLoading: any;
  demoAudio: any;
  demoUrl: any;
  demoController: any;
  demoRestoreMic: boolean;
}

export const voicePreviewState = {} as ModuleState;

export function voiceOptions(): any {
  return [...new Map([...(voicePipelineState.ph?.voices || []).map((name?: any): any => [name, {
    value: name,
    label: name
  }]), ...voicePreviewState.voiceCatalog.map((v?: any): any => ['catalog:' + v.voice_id, {
    value: 'catalog:' + v.voice_id,
    label: v.name + ' · ' + v.locale + ' · ' + v.gender
  }])]).values()];
}
export async function loadVoiceCatalog(): Promise<any> {
  if (voicePreviewState.voiceCatalog.length) return voicePreviewState.voiceCatalog;
  if (!voicePreviewState.catalogLoading) voicePreviewState.catalogLoading = (async (): Promise<any> => {
    try {
      const r: any = await fetch(voicePreviewState.VOICE_CATALOG + 'voices.jsonl');
      if (!r.ok) throw new Error('Voice catalog HTTP ' + r.status);
      const voices: any = (await r.text()).split('\n').filter((s?: any): any => s.trim()).map((s?: any): any => JSON.parse(s)).filter((v?: any): any => v.language === 'en').sort((a?: any, b?: any): any => a.name.localeCompare(b.name));
      if (!voices.length) throw new Error('No English voices found in local voice catalog');
      voicePreviewState.voiceCatalog = voices;
      return voicePreviewState.voiceCatalog;
    } finally {
      voicePreviewState.catalogLoading = null;
    }
  })();
  return voicePreviewState.catalogLoading;
}
export async function refreshVoices(): Promise<any> {
  await loadVoiceCatalog();
  const select: any = sceneFoundationState.$('avoice');
  if (select) {
    const saved: any = select.value;
    select.replaceChildren(new Option('Inherit saved profile / Settings', ''), ...voiceOptions().map((v?: any): any => new Option(v.label, v.value)));
    select.value = saved;
  }
  return voiceOptions();
}
export async function resolveVoice(tts?: any, name?: any): Promise<any> {
  if (!name) return undefined;
  if (name.startsWith('catalog:')) {
    if (!voicePreviewState.voiceCatalog.length) await refreshVoices();
    const v: any = voicePreviewState.voiceCatalog.find((v?: any): any => 'catalog:' + v.voice_id === name);
    if (!v) throw new Error('Selected voice is unavailable. Reload the voice catalog.');
    if (!tts.voices.includes(name)) await tts.addVoice(name, voicePreviewState.VOICE_CATALOG + v.filename);
    return name;
  }
  if (!tts.voices.includes(name)) throw new Error('Voice "' + name + '" is not in this model. Choose a voice in Settings.');
  return name;
}
export function stopVoiceDemo(): any {
  voicePreviewState.demoController?.abort();
  voicePreviewState.demoController = null;
  if (voicePreviewState.demoAudio) {
    voicePreviewState.demoAudio.pause();
    voicePreviewState.demoAudio = null;
  }
  if (voicePreviewState.demoUrl) {
    URL.revokeObjectURL(voicePreviewState.demoUrl);
    voicePreviewState.demoUrl = null;
  }
  useRuntimeSettings.setState({
    voiceBusy: false
  });
  const restore: any = voicePreviewState.demoRestoreMic;
  voicePreviewState.demoRestoreMic = false;
  if (restore && sceneFoundationState.mode === 'listening' && voicePipelineState.muted) setMute(false);
}
export async function testVoice(options?: any): Promise<any> {
  if (voicePipelineState.busy || sceneFoundationState.mode === 'thinking' || sceneFoundationState.mode === 'speaking') throw new Error('Wait for the current AI response to finish, then test a voice.');
  stopVoiceDemo();
  if (sceneFoundationState.mode === 'listening' && !voicePipelineState.muted) {
    voicePreviewState.demoRestoreMic = true;
    setMute(true);
    voicePipelineState.prev = null;
    voicePipelineState.quiet = 0;
  }
  const controller: any = new AbortController();
  voicePreviewState.demoController = controller;
  useRuntimeSettings.setState({
    voiceBusy: true,
    voiceStatus: 'Loading TTS model and voice…'
  });
  try {
    const text: any = options.text.trim();
    if (!text) throw new Error('Enter a short demo text.');
    const t: any = await loadP(options);
    if (controller.signal.aborted) return;
    const voice: any = await resolveVoice(t, options.voice);
    if (controller.signal.aborted) return;
    useRuntimeSettings.setState({
      voiceStatus: 'Generating demo…'
    });
    const wav: any = await t.synthWav(text.slice(0, 300), {
      voice,
      signal: controller.signal
    });
    if (controller.signal.aborted) return;
    voicePreviewState.demoUrl = URL.createObjectURL(wav);
    voicePreviewState.demoAudio = new Audio(voicePreviewState.demoUrl);
    voicePreviewState.demoAudio.onended = (): any => {
      stopVoiceDemo();
      useRuntimeSettings.setState({
        voiceStatus: 'Demo finished.'
      });
    };
    await voicePreviewState.demoAudio.play();
    useRuntimeSettings.setState({
      voiceStatus: 'Playing selected voice…'
    });
  } catch (e: any) {
    if (!controller.signal.aborted) {
      stopVoiceDemo();
      throw e;
    }
  } finally {
    if (voicePreviewState.demoController === controller && !voicePreviewState.demoAudio) stopVoiceDemo();
  }
}

// ============================================================================
// 10. THEME, FLOOR LOG & IN-SCENE HUD
// ============================================================================
export function prepareVoicePreview(): void {
  voicePreviewState.VOICE_CATALOG = new URL('./models/phonon-voices-local/', location.href).href;
  voicePreviewState.voiceCatalog = [];
  voicePreviewState.catalogLoading = null;
  voicePreviewState.demoAudio = null;
  voicePreviewState.demoUrl = null;
  voicePreviewState.demoController = null;
  voicePreviewState.demoRestoreMic = false;
}
