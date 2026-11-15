import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { flushPreferences, readPreference, writePreference } from '../shared/services/persistence';

export interface JarvisConfig {
  endpoint: string;
  key: string;
  model: string;
  reasoningEffort: string;
  sys: string;
  tts: string;
  voice: string;
  stt: string;
  sttMode: string;
  dev: string;
  [key: string]: unknown;
}

export const DEFAULT_CONFIG: JarvisConfig = {
  endpoint: 'https://api.openai.com/v1',
  key: '',
  model: 'gpt-4o-mini',
  reasoningEffort: '',
  sys: 'Be a concise, helpful assistant. Your personal identity is defined by your saved SOUL.md, not the application name.',
  tts: 'phonon-tts',
  voice: '',
  stt: 'whistle-webgpu',
  sttMode: 'browser',
  dev: 'webgpu',
};

const STORAGE_KEY = 'jarvis-cfg';

export function parseConfig(raw: string | null): JarvisConfig {
  try {
    const saved: unknown = JSON.parse(raw || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_CONFIG };
    const config = { ...DEFAULT_CONFIG, ...saved };
    // Migrate only the exact former app default; preserve user-authored prompts.
    if (config.sys === 'You are JARVIS, a concise, witty AI assistant.') config.sys = DEFAULT_CONFIG.sys;
    // Old files and manual edits must not turn controlled text fields into null/objects.
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (typeof config[key] !== 'string') config[key] = DEFAULT_CONFIG[key];
    }
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

interface SettingsStore {
  config: JarvisConfig;
  setConfig: (config: JarvisConfig) => void;
  updateConfig: (patch: Partial<JarvisConfig>) => void;
}

export const useSettingsStore = create<SettingsStore>()(immer(set => ({
  config: DEFAULT_CONFIG,
  setConfig: config => set(state => { state.config = config; }),
  updateConfig: patch => set(state => { Object.assign(state.config, patch); }),
})));

/** Initialize once on the client; keeps the existing persisted config schema/key. */
export function initializeSettings() {
  let raw: string | null = null;
  raw = readPreference(STORAGE_KEY);
  useSettingsStore.getState().setConfig(parseConfig(raw));
}

/** Save user settings without dropping runtime-owned legacy config fields. */
export function saveSettings(config: JarvisConfig) {
  useSettingsStore.getState().setConfig(config);
  try {
    writePreference(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage may be unavailable or full; the in-memory settings still apply.
  }
}

export async function commitSettings(config: JarvisConfig): Promise<void> {
  saveSettings(config);
  await flushPreferences();
}
