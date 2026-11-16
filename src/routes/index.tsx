import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { SettingsDialog } from '../shared/components/settings/SettingsDialog';
import { NewSessionDialog } from '../shared/components/settings/WorkspaceSettings';
import { initializeSettings } from '../stores/settings';
import { initializePersistence } from '../shared/services/persistence';
import { startLuma } from '../shared/services/runtime';
import { PersistenceStatus } from '../shared/components/PersistenceStatus';
import { RuntimeOverlays } from '../shared/components/workspace/RuntimeOverlays';
import { ScriptManager } from '../shared/components/workspace/ScriptManager';
import { DiagnosticsPanel } from '../shared/components/workspace/DiagnosticsPanel';
import { WorkspaceHosts } from '../shared/components/workspace/WorkspaceHosts';

export const Route = createFileRoute('/')({ component: Luma });

function Luma() {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Keep browser-only audio, WebGL, storage and workers out of the server bundle.
    initializePersistence().then(async () => {
      initializeSettings();
      await startLuma();
    }).catch((cause) => {
      console.error('Luma startup failed:', cause);
      setError(String(cause));
    });
  }, []);

  return <><WorkspaceHosts /><SettingsDialog /><NewSessionDialog /><PersistenceStatus /><RuntimeOverlays /><ScriptManager /><DiagnosticsPanel />{error && <p role="alert">Luma startup failed: {error}</p>}</>;
}
