import { useEffect, useRef, useState } from 'react';
import { commitSettings, useSettingsStore, type LumaConfig } from '../../../stores/settings';
import { useRuntimeSettings } from '../../services/settings';
import { Action, Field, ReasoningOptions, Select, Toggle } from './controls';
import { VoiceSettings, AgentSettings, CodeSettings } from './RuntimeTabs';
import { SoulSettings } from './SoulSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { MarketplaceSettings } from './MarketplaceSettings';
import { PiExtensionsSettings } from './PiExtensionsSettings';
import { SettingsConfirmProvider } from './ConfirmDialog';
import { WorkspaceSettings } from './WorkspaceSettings';
import { Modal } from '../Modal';

const TABS = [
  ['main', 'Main LLM'], ['voice', 'Voice'], ['agents', 'Sub-agents'],
  ['souls', 'Souls & Memory'], ['code', 'Code Agent'], ['skills', 'Skills'],
  ['mcp', 'MCP Servers'], ['market', 'Marketplace'], ['pi', 'Pi Extensions'],
] as const;
type Tab = typeof TABS[number][0];

export function SettingsDialog() {
  return <SettingsConfirmProvider><SettingsDialogContent /></SettingsConfirmProvider>;
}

function SettingsDialogContent() {
  const services = useRuntimeSettings(state => state.services);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('main');
  const [draft, setDraft] = useState<LumaConfig>(() => ({ ...useSettingsStore.getState().config }));
  const changes = useRef<Partial<LumaConfig>>({});
  const gear = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    services?.stopVoice();
    setOpen(false);
    gear.current?.focus();
  }
  function show() {
    setDraft({ ...useSettingsStore.getState().config });
    changes.current = {};
    setError('');
    setOpen(true);
  }
  async function save() {
    setSaving(true);
    try {
      // Preserve settings changed by runtime commands while the dialog was open.
      await commitSettings({ ...useSettingsStore.getState().config, ...changes.current });
      close();
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    if (open) card.current?.focus();
  }, [open]);

  const patch = (values: Partial<LumaConfig>) => {
    changes.current = { ...changes.current, ...values };
    setDraft(previous => ({ ...previous, ...values }));
  };
  return <>
    <button ref={gear} id="gear" title="Settings" aria-label="Settings" aria-haspopup="dialog" onClick={show}>⚙</button>
    <Modal open={open} onClose={close} className="settings-modal-base" aria-labelledby="settings-title">
    <div id="m" className={open ? 'on' : ''} aria-hidden={!open} inert={!open} onClick={event => {
      if (event.target === event.currentTarget) close();
    }}>
      <div ref={card} id="card" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
          if (event.key !== 'Tab') return;
          const items = Array.from(card.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]') || [])
            .filter(element => !element.closest('[hidden]') && !element.hasAttribute('disabled') && element.tabIndex >= 0);
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="settings-heading"><div><span className="settings-eyebrow">LUMA / CONTROL CENTER</span><h2 id="settings-title">Settings</h2><p>Make this workspace yours.</p></div><button type="button" className="settings-dismiss" aria-label="Close settings" onClick={close}>×</button></header>
        <div className="settings-layout">
          <nav className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical"
            onKeyDown={event => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = TABS.findIndex(([id]) => id === tab);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + TABS.length) % TABS.length;
              setTab(TABS[next][0]); buttons.current[next]?.focus();
            }}>
            {TABS.map(([id, title], index) => <button key={id} ref={element => { buttons.current[index] = element; }}
              id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id}
              aria-controls={`settings-page-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}><span>{title}</span><span aria-hidden="true" className="settings-nav-arrow">↗</span></button>)}
          </nav>
          <div className="settings-content">
            {TABS.map(([id]) => <section key={id} id={`settings-page-${id}`} className="settings-page" role="tabpanel"
              aria-labelledby={`settings-tab-${id}`} hidden={tab !== id}>
              {id === 'pi' && open && tab === 'pi' && <PiExtensionsSettings />}
              {id === 'main' && <>
                <h3>LLM · OPENAI-COMPATIBLE</h3>
                <Field label="Endpoint" value={draft.endpoint} onChange={endpoint => patch({ endpoint })} />
                <Field label="API key" type="password" value={draft.key} onChange={key => patch({ key })} />
                <Field label="Model" value={draft.model} onChange={model => patch({ model })} />
                <Select label="Main-agent reasoning effort" value={draft.reasoningEffort} onChange={reasoningEffort => patch({ reasoningEffort })}><ReasoningOptions /></Select>
                <p className="mut">Reasoning effort requires model/provider support. Provider default omits the parameter.</p>
                <Field label="System prompt" multiline value={draft.sys} onChange={sys => patch({ sys })} />
                <h3>WORKSPACE TOOLS</h3>
                <Toggle label="Show Build Tools" checked={draft.showBuildTools === true} onChange={showBuildTools => patch({ showBuildTools })} />
                <Toggle label="Enable animated color mix on the main hologram" checked={draft.mainColorEffect === true} onChange={mainColorEffect => patch({ mainColorEffect })} />
                {services && <WorkspaceSettings services={services} active={open && tab === 'main'} />}
              </>}
              {!services && id !== 'main' && <p role="status">Waiting for the runtime…</p>}
              {services && id === 'voice' && <VoiceSettings services={services} draft={draft} patch={patch} />}
              {services && id === 'agents' && <AgentSettings services={services} />}
              {services && id === 'souls' && <SoulSettings services={services} active={open && tab === 'souls'} />}
              {services && id === 'code' && <CodeSettings services={services} active={open && tab === 'code'} />}
              {services && (id === 'skills' || id === 'mcp') && <IntegrationSettings services={services} kind={id} />}
              {services && id === 'market' && <MarketplaceSettings services={services} />}
            </section>)}
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="r settings-footer"><span className="settings-footer-note">Connection & workspace preferences</span><Action disabled={saving} onClick={close}>CLOSE</Action><button type="button" className="b settings-save" disabled={saving} onClick={() => { void save(); }}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</button></div>
      </div>
    </div>
    </Modal>
  </>;
}
