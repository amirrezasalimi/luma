// The bridge is intentionally dependency-light; it prevents scene and agent
// services from importing the DOM-owning workspace implementation.
interface WorkspaceFacade {
  agp: HTMLElement;
  tlp: HTMLElement;
  msg: (message: string) => void;
  rqT: ReturnType<typeof setTimeout>;
  SCR_TPL: string;
  mainRow: () => string;
  executionOpen: Set<number>;
}

let facade: WorkspaceFacade | undefined;
let refresh: () => void = () => {};
let renderAgents: () => void = () => {};
let renderInspector: () => void = () => {};

export function registerWorkspace(state: WorkspaceFacade, refreshCallback: () => void, renderAgentsCallback: () => void, renderInspectorCallback: () => void) {
  facade = state;
  refresh = refreshCallback;
  renderAgents = renderAgentsCallback;
  renderInspector = renderInspectorCallback;
}

export const workspaceUiState = new Proxy({} as WorkspaceFacade, {
  get(_target, key: keyof WorkspaceFacade) {
    if (!facade) throw new Error('Workspace is not initialized');
    return facade[key];
  },
  set(_target, key: keyof WorkspaceFacade, value) {
    if (!facade) throw new Error('Workspace is not initialized');
    facade[key] = value;
    return true;
  },
});

export function refreshUI(): void { refresh(); }
export function renderAg(): void { renderAgents(); }
export function renderInsp(): void { renderInspector(); }
let renderTimer: ReturnType<typeof setTimeout> | undefined;
export function rq(): void { clearTimeout(renderTimer); renderTimer = setTimeout(renderAgents, 120); }

export function setWorkspaceMessage(message: string): void { facade?.msg(message); }

export function setBuildToolsVisible(visible: boolean): void {
  if (facade) facade.tlp.style.display = visible ? '' : 'none';
}
