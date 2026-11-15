import { createWorkspaceControls } from './runtime/workspace-ui';
import { bindWorkspaceInput } from './runtime/workspace-input';
import { createDiagnostics } from './runtime/diagnostics';

export function createWorkspace(): void {
  createWorkspaceControls();
  bindWorkspaceInput();
}

export function connectDiagnostics(): void {
  createDiagnostics();
}
