import { create } from 'zustand';

export type QuestionAnswer = { cancelled: true } | { cancelled: false; value: string | string[] | boolean };
export interface RuntimeQuestion {
  id: string;
  epoch: number;
  agentId: string;
  title: string;
  question: string;
  options: { label: string; value: string }[];
  multiple: boolean;
  yesNo: boolean;
  finish: (answer: QuestionAnswer) => void;
}

export interface ScriptRow {
  nodeId: string;
  name: string;
  source: string;
  status: string;
  callbacks: number;
  autoResume: boolean;
  error: string | null;
}

export interface RuntimeImage {
  url: string;
  alt: string;
  caption: string;
  index: number;
  count: number;
  disabled: boolean;
  open: boolean;
  fit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  height: 'auto' | 'fixed' | 'default';
}

interface RuntimeUIState {
  questions: RuntimeQuestion[];
  restoringSession: boolean;
  storageWarning: string;
  images: Record<string, RuntimeImage>;
  debug: { open: boolean; metrics: string; load: string; memory: string; agents: { id: string; title: string; info: string; profile: string; context: string; summary: string }[] };
  scripts: {
    open: boolean;
    owner: string;
    rows: ScriptRow[];
    callbacks: number;
    frames: number;
    intervals: number;
    name: string;
    source: string;
    editNode: string | null;
    status: string;
    saving: boolean;
  };
}

export const useRuntimeUI = create<RuntimeUIState>(() => ({
  questions: [],
  restoringSession: false,
  storageWarning: '',
  images: {},
  debug: { open: false, metrics: '', load: '', memory: '', agents: [] },
  scripts: { open: false, owner: 'jarvis', rows: [], callbacks: 0, frames: 0, intervals: 0,
    name: '', source: '', editNode: null, status: '', saving: false },
}));

export function updateScriptUI(patch: Partial<RuntimeUIState['scripts']>): void {
  useRuntimeUI.setState(state => ({ scripts: { ...state.scripts, ...patch } }));
}

export function updateDebugUI(patch: Partial<RuntimeUIState['debug']>): void {
  useRuntimeUI.setState(state => ({ debug: { ...state.debug, ...patch } }));
}
