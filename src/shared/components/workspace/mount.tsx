import { createRoot } from 'react-dom/client';
import { BuildTools } from './build-tools';
import { AgentsPanel } from './agents-panel';

export function mountAgentsPanel(host: HTMLElement): void {
  createRoot(host).render(<AgentsPanel />);
}

export function mountBuildTools(host: HTMLElement, initialStepBack: boolean, initialAutoReport: boolean): void {
  createRoot(host).render(<BuildTools initialStepBack={initialStepBack} initialAutoReport={initialAutoReport} />);
}
