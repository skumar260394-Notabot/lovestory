import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readAgent, writeAgent, agentEvent, agentCommand, withAgentLock } from './managed-agents.mjs';

const [, , id, turnId] = process.argv;
let s, child;
try {
  s = withAgentLock(() => {
    const state = readAgent(id);
    if (state.turn_id !== turnId || state.state !== 'starting') throw new Error('Turn already claimed.');
    state.state = 'running'; state.worker_pid = process.pid; state.updated_at = new Date().toISOString(); writeAgent(state); return state;
  });
  const command = agentCommand(s);
  agentEvent(s, { event: 'turn_started', agent: s.agent, model: s.model });
  child = spawn(command.command, command.args, { cwd: s.workspace, shell: false, windowsHide: true, stdio:['pipe','pipe','pipe'] });
  let bytes = 0, eventCount = 0, stderr = '', timedOut = false, resultSeen = false, resultError = null;
  let response = '', responseTruncated = false;
  function event(value) { if (eventCount++ < 500) agentEvent(s,value); }
  function text(value) { const room = 20000 - response.length; response += String(value).slice(0, Math.max(0,room)); if (String(value).length > room) responseTruncated = true; }
  function native(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('CLI returned an invalid conversation ID.');
    if (s.native_session_id && s.native_session_id !== value) throw new Error('CLI resumed a different conversation.');
    s.native_session_id = value; writeAgent(s);
  }
  const lines = createInterface({ input: child.stdout, crlfDelay:Infinity });
  lines.on('line', line => {
    bytes += Buffer.byteLength(line);
    if (bytes > 8 * 1024 * 1024) { resultError = 'Agent output exceeded its bound.'; child.kill(); return; }
    let e; try { e = JSON.parse(line); } catch { return; }
    try {
      if (s.agent === 'codex') {
        if (e.type === 'thread.started') native(e.thread_id);
        if (e.type === 'item.completed' && e.item?.type === 'agent_message') { text(e.item.text); event({event:'agent_message',text:String(e.item.text).slice(0,4000)}); }
        if (e.type === 'item.completed' && ['command_execution','file_change','mcp_tool_call'].includes(e.item?.type)) event({event:'tool_completed',tool:e.item.type,status:e.item.status});
        if (e.type === 'turn.completed') resultSeen = true;
        if (e.type === 'turn.failed' || e.type === 'error') resultError = e.error?.message || e.message || 'Codex turn failed.';
      } else {
        if (e.type === 'system' && e.subtype === 'init') native(e.session_id);
        if (e.type === 'assistant') for (const block of e.message?.content || []) {
          if (block.type === 'text') event({event:'agent_message',text:String(block.text).slice(0,4000)});
          if (block.type === 'tool_use') event({event:'tool_started',tool:block.name});
        }
        if (e.type === 'result') {
          native(e.session_id); resultSeen = true; text(e.result || '');
          s.permission_denials = Array.isArray(e.permission_denials) ? e.permission_denials.length : 0;
          if (e.is_error || e.subtype !== 'success') resultError = e.result || (e.errors || []).join('; ') || 'Claude turn failed.';
        }
      }
    } catch (error) { resultError = error.message; child.kill(); }
  });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  // Prompt content is never put in argv or a shell command.
  child.stdin.on('error', () => {});
  child.stdin.end(s.pending_prompt);
  const timer = setTimeout(() => { timedOut = true; child.kill(); },s.timeout_ms);
  const exit = await new Promise(resolve => {
    child.once('error', error => resolve({ error: `CLI launch failed: ${error.code || 'unknown'}` }));
    child.once('close', (code,signal) => resolve({code,signal}));
  });
  clearTimeout(timer);
  s.state = !timedOut && exit.code === 0 && resultSeen && !resultError && s.native_session_id ? 'completed' : 'failed';
  s.error = s.state === 'completed' ? null : String(timedOut ? 'Agent turn timed out; no automatic retry.' : resultError || exit.error || stderr || `CLI exited without a successful final result (${exit.code ?? exit.signal}).`).slice(0,2000);
  s.last_response = response; s.response_truncated = responseTruncated; s.updated_at = new Date().toISOString();
  delete s.pending_prompt; delete s.prompt;
  withAgentLock(() => writeAgent(s));
  agentEvent(s,{event:'turn_finished',state:s.state,error:s.error,permission_denials:s.permission_denials});
} catch (error) {
  if (child) child.kill();
  if (s) withAgentLock(() => { s.state = 'failed'; s.error = error.message; delete s.pending_prompt; delete s.prompt; writeAgent(s); });
  process.exitCode = 1;
}
