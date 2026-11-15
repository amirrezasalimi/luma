import { create } from 'zustand';

export interface VoiceOption { value: string; label: string }
export interface Skill { name: string; description: string; body: string; on: boolean }
export interface McpConfig {
  name: string; url?: string; token?: string; headers?: string | Record<string, string>;
  command?: string; args?: string[]; env?: Record<string, string>; on?: boolean;
}
export interface McpView extends McpConfig { status: string; error?: string; tools: number }
export interface Profile {
  name: string; soul: string; voice: string; muted: boolean;
  aesthetics: Record<string, unknown>; unlimited: boolean; autoload: boolean;
}
export interface AgentDefaults { am: string; ar: string; ae: string; ak: string; max: number; code: boolean }
export interface ContextConfig { strategy: string; maxTokens: number; threshold: number; lastN: number }
export interface SettingsSnapshot {
  agents: AgentDefaults;
  context: ContextConfig;
  main: Profile;
  profiles: Profile[];
  guidance: string;
  skills: Skill[];
  mcps: McpView[];
  background: string;
}
export interface SettingsServices {
  snapshot(): SettingsSnapshot;
  stopVoice(): void;
  loadVoices(): Promise<VoiceOption[]>;
  testVoice(options: { tts: string; dev: string; voice: string; text: string }): Promise<void>;
  setAgentDefaults(patch: Partial<AgentDefaults>): void;
  setContext(config: ContextConfig): void;
  updateMain(patch: Partial<Profile>): void;
  saveProfile(profile: Profile, previousName: string): void;
  deleteProfile(name: string): void;
  loadProfile(name: string): void;
  setGuidance(text: string): void;
  checkCodeHost(): Promise<{ enabled: boolean; workspace?: string; error?: string }>;
  importSkills(input: string): void;
  setSkill(name: string, enabled: boolean): void;
  deleteSkill(name: string): void;
  importMcps(input: unknown): void;
  setMcp(name: string, enabled: boolean): Promise<void>;
  deleteMcp(name: string): Promise<void>;
  reconnectMcp(name: string): Promise<void>;
  setBackground(url: string): Promise<void>;
  arrangePanels(): void;
  listSessions(): Promise<Array<{ id: string; name: string; updatedAt: number }>>;
  saveSession(): Promise<void>;
  loadSession(id: string): Promise<void>;
  newSession(name: string): Promise<void>;
  resumeScripts(): void;
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
}

interface RuntimeSettingsState {
  services: SettingsServices | null;
  revision: number;
  voiceStatus: string;
  voiceBusy: boolean;
  sessionStatus: string;
  newSessionRequested: boolean;
}

export const useRuntimeSettings = create<RuntimeSettingsState>(() => ({
  services: null, revision: 0, voiceStatus: '', voiceBusy: false,
  sessionStatus: 'Opening session storage…', newSessionRequested: false,
}));

export function settingsChanged() {
  useRuntimeSettings.setState(state => ({ revision: state.revision + 1 }));
}
