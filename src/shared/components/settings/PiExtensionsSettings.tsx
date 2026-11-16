import { useEffect, useRef, useState } from 'react';
import { host } from '../../services/host';
import { Action, Field } from './controls';
import { useSettingsConfirm } from './ConfirmDialog';

type Result = Awaited<ReturnType<typeof host.piExtensions.browse>>;
type PackageAction = 'install' | 'uninstall' | 'enable' | 'disable';
const progressLabel: Record<PackageAction, string> = { install: 'Installing…', uninstall: 'Uninstalling…', enable: 'Enabling…', disable: 'Disabling…' };

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  { value: 'mcp', label: 'MCP' },
  { value: 'agents', label: 'Agents & Workflows' },
  { value: 'providers', label: 'Providers' },
  { value: 'tools', label: 'Dev Tools' },
  { value: 'memory', label: 'Memory & Context' },
  { value: 'web', label: 'Web & Search' },
  { value: 'ui', label: 'UI & Themes' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  mcp: 'MCP',
  agents: 'Agents',
  providers: 'Providers',
  tools: 'Tools',
  memory: 'Memory',
  web: 'Web',
  ui: 'UI/Theme',
};

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name (A-Z)' },
] as const;

export function PiExtensionsSettings() {
  const confirm = useSettingsConfirm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState({
    q: '',
    installedOnly: false,
    type: 'all' as 'all' | 'npm' | 'github' | 'manual',
    category: 'all' as 'all' | 'mcp' | 'agents' | 'providers' | 'tools' | 'memory' | 'web' | 'ui',
    sort: 'popularity' as 'popularity' | 'updated' | 'name',
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [operation, setOperation] = useState<{ source: string; action: PackageAction } | null>(null);
  const [cardNotice, setCardNotice] = useState<{ source: string; text: string; error: boolean } | null>(null);
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const [moreError, setMoreError] = useState('');
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setResult(null);
    setPage(1);
    setMoreError('');
    loadingMore.current = false;
    host.piExtensions.browse({ ...filter, page: 1 }).then(value => {
      if (generation.current === current) setResult(value);
    }).catch(error => {
      if (generation.current === current) setStatus(String(error));
    }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [filter]);

  useEffect(() => {
    if (!sentinel.current || !result?.hasMore || loading || mutating) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || loadingMore.current) return;
      loadingMore.current = true;
      setMoreError('');
      const current = generation.current;
      host.piExtensions.browse({ ...filter, page: page + 1 }).then(value => {
        if (generation.current !== current) return;
        loadingMore.current = false;
        setResult(previous => previous ? { ...value, rows: [...previous.rows, ...value.rows.filter(row => !previous.rows.some(existing => existing.id === row.id))] } : value);
        setPage(value.page);
      }).catch(error => {
        if (generation.current === current) setMoreError(String(error));
      }).finally(() => { if (generation.current === current) loadingMore.current = false; });
    }, { root: sentinel.current.closest('.settings-content'), rootMargin: '240px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [result, loading, mutating, filter, page]);

  async function manage(source: string, action: PackageAction) {
    const needsTrust = action === 'install' || action === 'enable';
    if (needsTrust && !await confirm(`${action === 'install' ? 'Install' : 'Enable'} ${source} in your user Pi? Third-party packages can execute code with your host-user permissions. Only proceed if you trust the author and source.`)) return;
    if (action === 'uninstall' && !await confirm(`Uninstall ${source} from your user Pi?`)) return;
    setMutating(true);
    setOperation({ source, action });
    setCardNotice(null);
    setStatus('');
    try {
      const response = await host.piExtensions.manage({ source, action, trusted: needsTrust });
      setResult(previous => previous ? { ...previous, rows: previous.rows.map(row => row.source === source ? { ...row, installed: response.installed } : row) } : previous);
      const text = action === 'install' ? 'Installed successfully' : action === 'uninstall' ? 'Uninstalled successfully' : action === 'enable' ? 'Enabled successfully' : 'Disabled successfully';
      setCardNotice({ source, text, error: false });
      setStatus(`${text}. Luma loads enabled resources on the next conversation request. Standalone Pi requires /reload or restart.`);
    } catch (error) {
      setCardNotice({ source, text: String(error), error: true });
      setStatus('Package update failed. Reopen this tab to recheck installation status.');
    }
    finally { setMutating(false); setOperation(null); }
  }
  const busy = loading || mutating;
  return <>
    <div className="pi-heading"><h3>Pi extensions</h3></div>
    <form className="pi-search" onSubmit={event => { event.preventDefault(); setPage(1); setFilter(previous => ({ ...previous, q: query })); }}>
      <div className="pi-search-input-wrap"><Field label="Find extensions" placeholder="Search name, description, or pattern (tag:mcp, source:npm)…" value={query} onChange={setQuery} /></div>
      <Action disabled={busy} onClick={() => { setPage(1); setFilter(previous => ({ ...previous, q: query })); }}>SEARCH</Action>
      <label className="pi-installed-filter" title="Show only installed packages"><span>Installed only</span><input className="settings-switch" type="checkbox" role="switch" checked={filter.installedOnly} disabled={mutating} onChange={event => setFilter(previous => ({ ...previous, installedOnly: event.target.checked }))} /></label>
      <label className="pi-filter">Category<select aria-label="Extension category" value={filter.category} disabled={mutating} onChange={event => setFilter(previous => ({ ...previous, category: event.target.value as typeof filter.category }))}>{CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
      <label className="pi-filter">Source<select aria-label="Extension source" value={filter.type} disabled={mutating} onChange={event => setFilter(previous => ({ ...previous, type: event.target.value as typeof filter.type }))}><option value="all">All sources</option><option value="npm">npm</option><option value="github">GitHub</option><option value="manual">Manual</option></select></label>
      <label className="pi-filter">Sort<select aria-label="Sort extensions" value={filter.sort} disabled={mutating} onChange={event => setFilter(previous => ({ ...previous, sort: event.target.value as typeof filter.sort }))}>{SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
    </form>
    <div aria-busy={busy} className="pi-results">
      {loading && <p role="status">Loading extensions…</p>}
      {result && <div className="pi-results-meta"><span>{result.total.toLocaleString()} extensions</span><span>{result.rows.length} loaded · Cached for 1 hour</span></div>}
       <div className="pi-grid">{result?.rows.map(row => <article className="pi-extension-card" key={row.id} aria-busy={operation?.source === row.source}>
        <div className="pi-card-heading"><b>{row.name}</b><span className={`pi-badge ${row.installed?.enabled ? 'is-enabled' : ''}`}>{row.installed ? row.installed.enabled ? 'Installed · Enabled' : 'Installed · Disabled' : row.source ? 'Not installed' : 'Manual setup'}</span></div>
        {row.tags && row.tags.length > 0 && <div className="pi-tags">{row.tags.map(tag => <button key={tag} type="button" className={`pi-tag ${filter.category === tag ? 'is-active' : ''}`} title={`Filter by ${CATEGORY_LABELS[tag] || tag}`} onClick={() => setFilter(previous => ({ ...previous, category: previous.category === tag ? 'all' : tag as typeof filter.category }))}>{CATEGORY_LABELS[tag] || tag}</button>)}</div>}
        <p className="pi-description">{row.description || 'No description available.'}</p>
        <p className="pi-card-meta">{[row.popularity, row.updated].filter(Boolean).join(' · ')}</p>
        <div className="pi-card-actions">{row.url && <a href={row.url} target="_blank" rel="noreferrer">Source ↗</a>}
        {operation?.source === row.source ? <span className="pi-operation" role="status"><span className="pi-spinner" aria-hidden="true" />{progressLabel[operation.action]}</span> : row.installed ? <div className="pi-installed-actions">
          <Action disabled={busy} onClick={() => { void manage(row.installed!.source, row.installed!.enabled ? 'disable' : 'enable'); }}>{row.installed.enabled ? 'DISABLE' : 'ENABLE'}</Action>
          <Action disabled={busy} onClick={() => { void manage(row.installed!.source, 'uninstall'); }}>UNINSTALL</Action>
        </div> : row.source ? <Action disabled={busy} onClick={() => { void manage(row.source!, 'install'); }}>INSTALL</Action>
          : <span className="mut">Manual setup</span>}</div>
        {cardNotice?.source === row.source && <p className={`pi-card-notice${cardNotice.error ? ' is-error' : ''}`} role={cardNotice.error ? 'alert' : 'status'}>{cardNotice.text}</p>}
      </article>)}</div>
      {result && !result.rows.length && <p>No matching extensions.</p>}
    </div>
    <div ref={sentinel} className="pi-scroll-sentinel" role="status">{moreError ? `Could not load more extensions. Scroll away and back to retry. ${moreError}` : result?.hasMore ? 'Loading more as you scroll…' : result?.rows.length ? 'You’re all caught up.' : ''}</div>
    <p role="status">{mutating ? 'Updating Pi package…' : status}</p>
  </>;
}
