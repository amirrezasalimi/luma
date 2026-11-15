import { useEffect, useState } from 'react';
import { installAgentPanelHandlers } from '../../services/runtime/workspace-ui';

/** React owns the workspace panel shell and agent-launch form. */
export function AgentsPanel() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const root = document.getElementById('workspace-agents-panel');
    if (!root) return;
    return installAgentPanelHandlers(root);
  }, []);
  return <section className={`pn t${collapsed ? ' c' : ''}`} id="workspace-agents-panel">
    <h4 onClick={() => setCollapsed(value => !value)}><span>JARVIS + SUB-AGENTS <b id="agn">0</b></span><span>▾</span></h4>
    <div className="bd">
      <details id="agnew"><summary>+ NEW AGENT</summary>
        <input id="an" placeholder="name (optional)" />
        <textarea id="at" rows={2} placeholder="task, e.g. draw a 3 tier web architecture with arrows" />
        <input id="am" placeholder="model (blank = sub-agent default)" />
        <input id="ap" placeholder="peers allowed (e.g. all, or Agent1,Agent2)" />
        <textarea id="asoul" rows={3} maxLength={32000} placeholder="Optional SOUL.md (without a task, starts idle)" />
        <label htmlFor="avoice">Voice (blank = saved profile / Settings)</label>
        <select id="avoice"><option value="">Inherit saved profile / Settings</option></select>
        <label><input id="amuted" type="checkbox" style={{ width: 'auto' }} /> Mute agent audio</label>
        <label htmlFor="aaesthetics">Aesthetics JSON (optional)</label>
        <textarea id="aaesthetics" rows={2} placeholder={'{"color":"#44e0e8"}'} />
        <label><input id="aunlimited" type="checkbox" style={{ width: 'auto' }} /> Unlimited steps</label>
        <label htmlFor="amaxturns">Max turns for this agent</label>
        <input id="amaxturns" type="number" min={1} max={100000} placeholder="Sub-agent default" />
        <button id="ago" type="button">LAUNCH / LOAD IDLE</button>
      </details>
      <div id="agl" />
    </div>
  </section>;
}
