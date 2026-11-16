/** agent-questions: runtime implementation. */
import { hologramControlsState } from './hologram-controls';
import { notifyLuma } from './agent-orchestrator';
import { addMcps, addSkills, integrationsState, parseSkill, renderSk } from './integrations';

interface ModuleState {
  pendingQuestions: any;
  questionTray: any;
  marketplaces: any;
}

export const agentQuestionsState = {} as ModuleState;

export function cancelQuestions(agentId: any = null): any {
  for (const q of [...agentQuestionsState.pendingQuestions]) if (!agentId || q.agentId === agentId) q.finish({
    cancelled: true
  });
}

export function askUser(options?: any, agent: any = null): any {
  const p: any = typeof options === 'string' ? {
      question: options
    } : options || {},
    epoch: any = hologramControlsState.workspaceEpoch,
    agentId: any = agent?.id || 'main';
  return new Promise((resolve?: any): any => {
    const card: any = document.createElement('form'),
      title: any = document.createElement('strong'),
      text: any = document.createElement('p'),
      choices: any = document.createElement('div'),
      submit: any = document.createElement('button'),
      cancel: any = document.createElement('button');
    card.className = 'pn';
    card.style.padding = '12px';
    title.textContent = (agent?.name || 'LUMA') + ' asks';
    text.textContent = String(p.question || 'Please confirm');
    const raw: any = p.type === 'yesno' ? ['Yes', 'No'] : Array.isArray(p.options) ? p.options : [],
      multiple: any = !!p.multiple,
      inputs: any = [],
      name: any = crypto.randomUUID();
    for (const option of raw) {
      const label: any = document.createElement('label'),
        input: any = document.createElement('input'),
        span: any = document.createElement('span'),
        value: any = typeof option === 'object' ? String(option.value ?? option.label) : String(option);
      input.type = multiple ? 'checkbox' : 'radio';
      input.name = name;
      input.value = value;
      input.style.width = 'auto';
      span.textContent = typeof option === 'object' ? String(option.label ?? value) : value;
      label.style.cssText = 'display:flex;gap:8px;align-items:center';
      label.append(input, span);
      choices.append(label);
      inputs.push(input);
    }
    let free: any;
    if (!raw.length) {
      free = document.createElement('textarea');
      free.rows = 2;
      free.placeholder = 'Your answer';
      choices.append(free);
    }
    submit.type = 'submit';
    submit.textContent = 'ANSWER';
    cancel.type = 'button';
    cancel.textContent = 'CANCEL';
    card.append(title, text, choices, submit, cancel);
    const q: any = {
      epoch,
      agentId,
      finish: (answer?: any): any => {
        const i: any = agentQuestionsState.pendingQuestions.indexOf(q);
        if (i < 0) return;
        agentQuestionsState.pendingQuestions.splice(i, 1);
        card.remove();
        resolve(answer);
        if (!agent && epoch === hologramControlsState.workspaceEpoch && !answer.cancelled) notifyLuma({
          name: 'user-answer',
          id: 'host',
          task: text.textContent
        }, 'RESULT', JSON.stringify(answer));
      }
    };
    agentQuestionsState.pendingQuestions.push(q);
    cancel.onclick = (): any => q.finish({
      cancelled: true
    });
    card.onsubmit = (e?: any): any => {
      e.preventDefault();
      const selected: any = inputs.filter((i?: any): any => i.checked).map((i?: any): any => i.value);
      if (raw.length && !multiple && !selected.length) return;
      const value: any = free ? free.value : multiple ? selected : p.type === 'yesno' ? selected[0] === 'Yes' : selected[0];
      q.finish({
        cancelled: false,
        value
      });
    };
    agentQuestionsState.questionTray.append(card);
    card.scrollIntoView({
      block: 'nearest'
    });
  });
}
export async function installRemoteSkill(url?: any, agent?: any): Promise<any> {
  const u: any = new URL(String(url));
  if (u.protocol !== 'https:') throw new Error('Skill source must be an HTTPS raw SKILL.md URL');
  const answer: any = await askUser({
    type: 'yesno',
    question: 'Install a skill from ' + u.href + '? Skill instructions will be available to agents; review untrusted content before enabling.'
  }, agent);
  if (answer.cancelled || answer.value !== true) return {
    installed: false
  };
  const r: any = await fetch(u.href, {
    signal: AbortSignal.timeout(30000),
    credentials: 'omit'
  });
  if (!r.ok) throw new Error('Skill download HTTP ' + r.status);
  const reader: any = r.body.getReader(),
    chunks: any = [];
  let total: any = 0;
  try {
    while (true) {
      const {
        done,
        value
      }: any = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 262144) {
        await reader.cancel();
        throw new Error('Skill source exceeds 256 KiB');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data: any = new Uint8Array(total);
  let offset: any = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  const skill: any = parseSkill(new TextDecoder().decode(data));
  if (!skill.name) throw new Error('SKILL.md needs name frontmatter');
  addSkills([{
    ...skill,
    on: false,
    source: u.href
  }]);
  const saved: any = integrationsState.SK.find((s?: any): any => s.name === skill.name);
  if (saved) {
    saved.on = false;
    saved.source = u.href;
    integrationsState.saveSK();
    renderSk();
  }
  return {
    installed: true,
    name: skill.name,
    enabled: false,
    message: 'Review in Settings → Skills, then enable'
  };
}
export async function installRemoteMcp(config?: any, agent?: any): Promise<any> {
  if (!config || typeof config.name !== 'string') throw new Error('MCP config requires name and HTTPS Streamable HTTP URL');
  const u: any = new URL(config.url);
  if (u.protocol !== 'https:') throw new Error('Remote MCP URL must use HTTPS');
  const answer: any = await askUser({
    type: 'yesno',
    question: 'Install remote MCP ' + config.name + ' at ' + u.href + '? It can expose tools to your agents. The server is installed disabled for review; local stdio packages are not executed.'
  }, agent);
  if (answer.cancelled || answer.value !== true) return {
    installed: false
  };
  addMcps([{
    ...config,
    url: u.href,
    on: false
  }]);
  return {
    installed: true,
    name: config.name,
    enabled: false
  };
}
// ---------------- 16b. Pointer selection (objects + mini-holos) & keyboard ----------------
export function createQuestionTray(): void {
  agentQuestionsState.pendingQuestions = [];
  agentQuestionsState.questionTray = document.createElement('section');
  agentQuestionsState.questionTray.setAttribute('aria-label', 'Agent questions');
  agentQuestionsState.questionTray.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);width:min(640px,94vw);max-height:45vh;overflow:auto;z-index:8;display:grid;gap:8px';
  document.body.append(agentQuestionsState.questionTray);
  agentQuestionsState.marketplaces = [{
    name: 'Agent Skills standard',
    url: 'https://agentskills.io',
    kind: 'documentation'
  }, {
    name: 'Skills.sh directory',
    url: 'https://skills.sh',
    kind: 'skills'
  }, {
    name: 'Anthropic skills',
    url: 'https://github.com/anthropics/skills',
    kind: 'skills'
  }, {
    name: 'Smithery',
    url: 'https://smithery.ai',
    kind: 'mcp'
  }, {
    name: 'Official MCP Registry',
    url: 'https://registry.modelcontextprotocol.io',
    kind: 'mcp'
  }, {
    name: 'MCP servers repository',
    url: 'https://github.com/modelcontextprotocol/servers',
    kind: 'mcp'
  }];
}
