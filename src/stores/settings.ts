import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { flushPreferences, readPreference, writePreference } from '../shared/services/persistence';

export interface LumaConfig {
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

export const DEFAULT_CONFIG: LumaConfig = {
  endpoint: 'https://api.openai.com/v1',
  key: '',
  model: 'gpt-4o-mini',
  reasoningEffort: '',
  sys: 'Be Luma, a concise, helpful assistant. A user-defined personal identity in saved SOUL.md takes precedence over this default name.',
  tts: 'phonon-tts',
  voice: '',
  stt: 'whistle-webgpu',
  sttMode: 'browser',
  dev: 'webgpu',
};

const STORAGE_KEY = 'luma-cfg';

export function parseConfig(raw: string | null): LumaConfig {
  try {
    const saved: unknown = JSON.parse(raw || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_CONFIG };
    const config = { ...DEFAULT_CONFIG, ...saved };
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
  config: LumaConfig;
  setConfig: (config: LumaConfig) => void;
  updateConfig: (patch: Partial<LumaConfig>) => void;
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
export function saveSettings(config: LumaConfig) {
  useSettingsStore.getState().setConfig(config);
  try {
    writePreference(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage may be unavailable or full; the in-memory settings still apply.
  }
}

export async function commitSettings(config: LumaConfig): Promise<void> {
  saveSettings(config);
  await flushPreferences();
}
