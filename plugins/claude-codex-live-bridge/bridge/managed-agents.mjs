// Managed CLI conversations are independent of app chats and bridge calls.
// Prompts use stdin, never a shell. Only explicitly selected sessions resume.
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync, readFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, readJson } from './common.mjs';
import { findCodexCli } from './codex-cli.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const worker = fileURLToPath(new URL('./managed-agent-worker.mjs', import.meta.url));
export const agentHome = () => join(homedir(), '.codex-claude-live', 'managed-agents');
const now = () => new Date().toISOString();
function bounded(value, fallback, low, high, field) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < low || result > high) throw new Error(`${field} must be an integer from ${low} to ${high}.`);
  return result;
}
export function agentSettings() {
  const raw = readJson(join(homedir(), '.codex-claude-live', 'config.json'), {});
  return { max_running: bounded(raw.managed_agents_max_running, 4, 1, 32, 'managed_agents_max_running'),
    timeout_ms: bounded(raw.managed_agent_timeout_ms, 600000, 10000, 3600000, 'managed_agent_timeout_ms') };
}
function string(value, field, limit, required = true) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /\0/.test(value)) throw new Error(`${field} must be a nonempty string of at most ${limit} characters.`);
  return value;
}
function validId(id) { if (!UUID.test(id)) throw new Error('Choose a managed_session_id returned by this bridge.'); return id; }
const stateFile = id => join(agentHome(), validId(id) + '.json');
export function readAgent(id, kind) {
  const s = readJson(stateFile(id));
  if (!s || (kind && s.agent !== kind)) throw new Error('Managed session not found for this agent.');
  return s;
}
export function writeAgent(s) { atomicJson(stateFile(s.managed_session_id), s); }
export function agentEvent(s, event) {
  appendFileSync(join(agentHome(), s.managed_session_id + '.jsonl'), JSON.stringify({ at: now(), turn_id: s.turn_id, ...event }) + '\n', 'utf8');
}
function alive(pid) { if (!Number.isInteger(pid)) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
export function withAgentLock(fn) {
  mkdirSync(agentHome(), { recursive: true });
  const lock = join(agentHome(), '.lock');
  for (let n = 0; ; n++) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = readJson(join(lock, 'owner.json'));
      if (owner && !alive(owner.pid)) { try { unlinkSync(join(lock, 'owner.json')); rmdirSync(lock); } catch {} }
      if (n >= 100) throw new Error('Managed session registry is busy; retry with the same request_id.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  atomicJson(join(lock, 'owner.json'), { pid: process.pid });
  try { return fn(); } finally { unlinkSync(join(lock, 'owner.json')); rmdirSync(lock); }
}
function records() {
  mkdirSync(agentHome(), { recursive: true });
  return readdirSync(agentHome()).filter(f => UUID.test(f.slice(0, -5)) && f.endsWith('.json')).map(f => readJson(join(agentHome(), f)));
}
function reconcile(s) {
  if (['starting', 'running'].includes(s.state) && s.worker_pid && !alive(s.worker_pid)) {
    s.state = 'interrupted'; s.error = 'Worker stopped before confirming completion. Check recorded output; do not resend automatically.'; s.updated_at = now(); writeAgent(s);
  }
  return s;
}
function summary(s) {
  return Object.fromEntries(['managed_session_id', 'agent', 'title', 'model', 'project_path', 'workspace', 'native_session_id', 'state', 'turn_id', 'turns_started', 'created_at', 'updated_at', 'error', 'permission_denials', 'last_response', 'response_truncated'].map(k => [k, s[k] ?? null]));
}
function file(path) { try { return statSync(path).isFile(); } catch { return false; } }
export function findClaudeCli() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const override = process.env.CLAUDE_BRIDGE_CLI;
  if (override && file(override)) return { ok: true, path: override };
  const dirs = String(process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of [join(homedir(), '.local', 'bin'), ...dirs]) {
    if (file(join(dir, exe))) return { ok: true, path: join(dir, exe) };
    for (const name of ['bin/claude.exe', 'cli.js']) {
      const path = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', name);
      if (file(path)) return { ok: true, path };
    }
  }
  return { ok: false, reason: 'Install and sign in to Claude Code to create managed Claude agents. Ordinary Desktop bridge messaging does not require this.' };
}
export function invocation(cli, args) {
  if (/\.(cmd|bat|ps1)$/i.test(cli.path)) throw new Error('Use the actual executable or JavaScript entry point, not a shell wrapper.');
  return /\.[cm]?js$/i.test(cli.path) ? { command: process.execPath, args: [cli.path, ...args] } : { command: cli.path, args };
}
function preflight(kind) {
  const cli = kind === 'codex' ? findCodexCli() : findClaudeCli();
  if (!cli.ok) throw new Error(cli.reason);
  const command = invocation(cli, kind === 'codex' ? ['exec', '--help'] : ['--help']);
  const run = spawnSync(command.command, command.args, { encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false });
  const needs = kind === 'codex' ? ['--json', '--model', '--config'] : ['--output-format', '--session-id', '--resume', '--model', '--permission-mode', '--tools', '--strict-mcp-config', '--setting-sources', '--safe-mode', '--no-chrome'];
  if (run.status !== 0 || needs.some(flag => !run.stdout?.includes(flag))) throw new Error(`The installed ${kind} CLI does not support managed-session options. Update it first.`);
  return cli;
}
function specification(raw) {
  const project = string(raw.project_path, 'project_path', 4096, false);
  if (project && (!isAbsolute(project) || !statSync(project).isDirectory())) throw new Error('project_path must be an existing absolute local folder.');
  const model = string(raw.model, 'model', 200, false);
  if (model && /[\r\n]/.test(model)) throw new Error('model must be a single model name or supported alias.');
  return { title: string(raw.title, 'title', 120), prompt: string(raw.prompt, 'prompt', 20000), project_path: project, model };
}
function requestId(value) { return string(value, 'request_id', 128); }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function capacity() {
  const active = records().map(reconcile).filter(s => ['starting', 'running'].includes(s.state)).length;
  return agentSettings().max_running - active;
}
function startWorker(s) {
  try {
    const child = spawn(process.execPath, [worker, s.managed_session_id, s.turn_id], { detached: true, windowsHide: true, shell: false, stdio: 'ignore' });
    child.on('error', e => withAgentLock(() => {
      const current = readAgent(s.managed_session_id);
      if (current.turn_id === s.turn_id) { current.state = 'failed'; current.error = `Worker launch failed: ${e.code || 'unknown'}`; writeAgent(current); }
    }));
    s.worker_pid = child.pid ?? null; writeAgent(s); child.unref();
  } catch (e) { s.state = 'failed'; s.error = `Worker launch failed: ${e.code || 'unknown'}`; writeAgent(s); }
}
export function createAgents(kind, args) {
  const id = requestId(args.request_id);
  if (!Array.isArray(args.sessions) || args.sessions.length < 1 || args.sessions.length > 8) throw new Error('sessions must contain 1 to 8 explicit task specifications.');
  const specs = args.sessions.map(specification);
  const hash = digest(specs);
  return withAgentLock(() => {
    const prior = records().filter(s => s.agent === kind && s.create_request_id === id);
    if (prior.length) {
      if (prior.some(s => s.create_hash !== hash)) throw new Error('request_id already belongs to different session specifications.');
      return { reused: true, sessions: prior.sort((a,b) => a.batch_index - b.batch_index).map(reconcile).map(summary) };
    }
    const cli = preflight(kind);
    if (capacity() < specs.length) throw new Error('Managed agent concurrency limit reached. Wait for a running turn to finish or change managed_agents_max_running in config.json.');
    const sessions = specs.map((spec, batch_index) => {
      const sid = randomUUID();
      const workspace = spec.project_path || join(agentHome(), 'workspaces', sid);
      if (!spec.project_path) mkdirSync(workspace, { recursive: true });
      return { ...spec, managed_session_id: sid, agent: kind, workspace, cli, native_session_id: null,
        state: 'starting', turn_id: randomUUID(), turns_started: 1, created_at: now(), updated_at: now(),
        create_request_id: id, create_hash: hash, batch_index, send_requests: {}, permission_denials: 0,
        timeout_ms: agentSettings().timeout_ms, pending_prompt: spec.prompt };
    });
    // Persist the complete batch before launching any process.
    sessions.forEach(writeAgent);
    sessions.forEach(startWorker);
    return { reused: false, sessions: sessions.map(summary), note: 'Managed local agents, not ordinary app chats. Starting is not model receipt. Use read_agent_session for completion/output; send_agent_message resumes the exact native conversation. Tasks use read-only tools by default.' };
  });
}
export function sendAgent(kind, args) {
  const id = requestId(args.request_id), message = string(args.message, 'message', 20000);
  return withAgentLock(() => {
    const s = reconcile(readAgent(args.managed_session_id, kind));
    const hash = digest(message), previous = s.send_requests[id];
    if (previous) {
      if (previous.hash !== hash) throw new Error('request_id already belongs to a different message.');
      return { reused: true, requested_turn_id: previous.turn_id, session: summary(s) };
    }
    if (['starting', 'running'].includes(s.state)) throw new Error('This managed agent is busy. Wait for its current turn to finish; no duplicate or queued turn was sent.');
    if (!s.native_session_id) throw new Error('This agent has no confirmed native session ID to resume. Inspect its error instead of guessing another session.');
    if (capacity() < 1) throw new Error('Managed agent concurrency limit reached.');
    s.cli = preflight(kind); s.turn_id = randomUUID(); s.turns_started++; s.pending_prompt = message;
    s.timeout_ms = agentSettings().timeout_ms; s.state = 'starting'; s.updated_at = now(); s.error = null;
    s.worker_pid = null; s.last_response = null; s.permission_denials = 0; s.response_truncated = false;
    s.send_requests[id] = { hash, turn_id: s.turn_id }; writeAgent(s); startWorker(s);
    return { reused: false, session: summary(s) };
  });
}
export function listAgents(kind, args = {}) {
  return withAgentLock(() => ({ limits: agentSettings(), sessions: records().map(reconcile).filter(s => s.agent === kind && (!args.query || s.title.toLowerCase().includes(String(args.query).toLowerCase()))).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,100).map(summary) }));
}
export function readAgentSession(kind, args) {
  const s = withAgentLock(() => reconcile(readAgent(args.managed_session_id, kind)));
  const cursor = bounded(args.after_cursor, 0, 0, 1000000, 'after_cursor');
  let events = [];
  try { events = readFileSync(join(agentHome(), s.managed_session_id + '.jsonl'), 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return { session: summary(s), events: events.slice(cursor, cursor + 50), next_cursor: Math.min(events.length, cursor + 50), more: events.length > cursor + 50 };
}

export function agentTools(kind) {
  const spec = { type: 'object', properties: { title: { type: 'string' }, prompt: { type: 'string', description: 'The task authorized by the user.' }, project_path: { type: 'string', description: 'Optional absolute local folder; omitted uses a new neutral workspace.' }, model: { type: 'string', description: 'Exact model or supported CLI alias. Omit to preserve the CLI default. No automatic model substitution.' } }, required: ['title','prompt'], additionalProperties: false };
  const id = { type: 'string', description: 'Unique caller request identifier. Reuse it only to retry exactly the same operation without creating duplicates.' };
  return [
    { name: `create_${kind}_sessions`, description: `Create 1–8 managed ${kind} CLI conversations on explicit user request. Each has its own title, prompt, optional project and model. Uses local CLI login; not an app-chat or cloud-chat creator. Default four concurrent read-only turns.`, inputSchema: { type:'object', properties: { request_id: id, sessions: { type:'array', minItems:1, maxItems:8, items:spec } }, required:['request_id','sessions'] } },
    { name: 'list_agent_sessions', description: `List managed ${kind} agents by name, separate from ordinary app chat discovery.`, inputSchema: { type:'object', properties:{query:{type:'string'}} } },
    { name: 'read_agent_session', description: 'Read public responses and tool activity from the exact managed agent. No hidden reasoning or automatic polling. Completion, launch and model failure are distinct.', inputSchema: { type:'object', properties:{managed_session_id:{type:'string'},after_cursor:{type:'integer',minimum:0}}, required:['managed_session_id'] } },
    { name: 'send_agent_message', description: 'Start a follow-up turn in an idle managed agent, preserving its exact native conversation and model. Requires user authorization. Busy agents reject the message; no duplicate queue.', inputSchema: { type:'object', properties:{managed_session_id:{type:'string'},request_id:id,message:{type:'string'}},required:['managed_session_id','request_id','message'] } }
  ];
}
export function agentActions(kind) { return {
  [`create_${kind}_sessions`]: args => createAgents(kind,args), list_agent_sessions: args => listAgents(kind,args),
  read_agent_session: args => readAgentSession(kind,args), send_agent_message: args => sendAgent(kind,args)
}; }

export function agentCommand(s) {
  if (s.agent === 'codex') return invocation(s.cli, ['exec', ...(s.native_session_id ? ['resume', s.native_session_id] : []),
    '--json','--skip-git-repo-check','-c','sandbox_mode="read-only"','-c','approval_policy="never"',
    ...(s.model ? ['--model',s.model] : []), '-']);
  return invocation(s.cli, ['--print','--verbose','--output-format','stream-json',
    ...(s.native_session_id ? ['--resume',s.native_session_id] : ['--session-id',s.managed_session_id]),
    '--permission-mode','plan','--tools','Read,Glob,Grep','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
    '--setting-sources','', '--safe-mode', '--no-chrome', ...(s.model ? ['--model',s.model] : [])]);
}
