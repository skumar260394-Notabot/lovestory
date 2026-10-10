import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home = mkdtempSync(join(tmpdir(),'bridge-managed-test-'));
process.env.HOME=home; process.env.USERPROFILE=home; process.env.CODEX_HOME=join(home,'.codex');
const stub = join(home,'agent.mjs'), log = join(home,'invocations.jsonl');
writeFileSync(stub, `
import {appendFileSync,readFileSync} from 'node:fs'; import {randomUUID} from 'node:crypto';
const argv=process.argv.slice(2);
if(argv.includes('--help')) {console.log('--json --model --config --output-format --session-id --resume --permission-mode --tools --strict-mcp-config --setting-sources --safe-mode --no-chrome');process.exit(0);}
const prompt=readFileSync(0,'utf8'); appendFileSync(${JSON.stringify(log)},JSON.stringify({argv,prompt,cwd:process.cwd()})+'\\n');
const get=flag=>argv[argv.indexOf(flag)+1]; const claude=argv.includes('--print');
const id=claude ? get(argv.includes('--resume')?'--resume':'--session-id') : argv.includes('resume') ? get('resume') : randomUUID();
console.log(JSON.stringify(claude?{type:'system',subtype:'init',session_id:id}:{type:'thread.started',thread_id:id}));
await new Promise(r=>setTimeout(r,300));
const failure=get('--model')==='bad-model';
console.log(JSON.stringify(claude?{type:'result',subtype:failure?'error_during_execution':'success',is_error:failure,session_id:id,result:failure?'unknown model':'response: '+prompt,permission_denials:[]}:
{type:'item.completed',item:{type:'agent_message',text:'response: '+prompt}}));
console.log(JSON.stringify({type:failure?'turn.failed':'turn.completed',error:{message:'unknown model'}}));
`);
process.env.CODEX_BRIDGE_CLI=stub; process.env.CLAUDE_BRIDGE_CLI=stub;
const m = await import('../plugins/claude-codex-live-bridge/bridge/managed-agents.mjs');
let checks=0;
const check=(v,n)=>{assert.ok(v,n);checks++;};
const specs=[{title:'first',prompt:'literal ` $(not-a-command) & text',model:'selected-model'}, {title:'second',prompt:'separate task'}];
const args={request_id:'create-first',sessions:specs};
const batch=m.createAgents('codex',args);
check(batch.sessions.length===2,'two independent sessions');
check(batch.sessions[0].managed_session_id!==batch.sessions[1].managed_session_id,'unique conversations');
check(batch.sessions[0].project_path===null,'no caller cwd guessed');
check(batch.sessions.every(s=>s.workspace.startsWith(m.agentHome())),'neutral per-session workspaces');
const repeat=m.createAgents('codex',args);
check(repeat.reused && repeat.sessions[0].managed_session_id===batch.sessions[0].managed_session_id,'idempotent create');
assert.throws(()=>m.createAgents('codex',{...args,sessions:[{...specs[0],model:'other'}]}),/different/);checks++;
assert.throws(()=>m.sendAgent('codex',{managed_session_id:batch.sessions[0].managed_session_id,request_id:'busy',message:'followup'}),/busy/);checks++;
const cb=m.createAgents('claude',{request_id:'claude-batch',sessions:[{title:'claude 1',prompt:'hello',model:'opus'},{title:'claude 2',prompt:'hello'}]});
check(cb.sessions.length===2,'reverse batch creation');
assert.throws(()=>m.createAgents('codex',{request_id:'over-cap',sessions:[{title:'over',prompt:'hello'}]}),/concurrency/);checks++;
assert.throws(()=>m.readAgentSession('claude',{managed_session_id:batch.sessions[0].managed_session_id}),/not found/);checks++;
async function done(kind,id) {
  const deadline=Date.now()+15000;
  while(Date.now()<deadline) {
    const value=m.readAgentSession(kind,{managed_session_id:id});
    if(!['starting','running'].includes(value.session.state)) return value;
    await new Promise(r=>setTimeout(r,50));
  }
  throw new Error('worker timeout in test');
}
for(const [kind,b] of [['codex',batch],['claude',cb]]) for(const session of b.sessions) {
  const result=await done(kind,session.managed_session_id);
  check(result.session.state==='completed',JSON.stringify(result));
  check(Boolean(result.session.native_session_id),'native conversation confirmed');
  check(result.events.at(-1).event==='turn_finished','public activity recorded');
}
const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
check(calls.some(c=>c.prompt===specs[0].prompt),'prompt passed literally via stdin');
const codex=calls.find(c=>c.argv.includes('selected-model'));
check(codex.argv.includes('sandbox_mode="read-only"') && codex.argv.includes('approval_policy="never"'),'read-only Codex turn');
const claude=calls.find(c=>c.argv.includes('opus'));
check(claude.argv.includes('plan') && claude.argv.includes('Read,Glob,Grep') && claude.argv.includes('{"mcpServers":{}}'),'Claude tools and MCP constrained');
const resumed=m.sendAgent('codex',{managed_session_id:batch.sessions[0].managed_session_id,request_id:'resume-first',message:'follow-up'});
const duplicate=m.sendAgent('codex',{managed_session_id:batch.sessions[0].managed_session_id,request_id:'resume-first',message:'follow-up'});
check(duplicate.reused && duplicate.requested_turn_id===resumed.session.turn_id,'idempotent follow-up');
assert.throws(()=>m.sendAgent('codex',{managed_session_id:batch.sessions[0].managed_session_id,request_id:'resume-first',message:'different'}),/different/);checks++;
const resumedDone=await done('codex',batch.sessions[0].managed_session_id);
check(resumedDone.session.native_session_id===m.readAgent(batch.sessions[0].managed_session_id).native_session_id && resumedDone.session.turns_started===2,'same saved native conversation');
const claudeDone=await done('claude',cb.sessions[0].managed_session_id);
m.sendAgent('claude',{managed_session_id:cb.sessions[0].managed_session_id,request_id:'resume-claude',message:'follow-up'});
check((await done('claude',cb.sessions[0].managed_session_id)).session.native_session_id===claudeDone.session.native_session_id,'exact Claude resume');
const failures=m.createAgents('claude',{request_id:'bad-model-test',sessions:[{title:'bad-model',prompt:'hello',model:'bad-model'}]});
const failure=await done('claude',failures.sessions[0].managed_session_id);
check(failure.session.state==='failed' && failure.session.error==='unknown model','CLI exit zero with error result fails honestly');
check(m.listAgents('codex',{query:'first'}).sessions.length===1,'name lookup');
assert.throws(()=>m.readAgent('../escape'),/Choose/);checks++;
assert.throws(()=>m.createAgents('codex',{request_id:'invalid',sessions:[{title:'bad',prompt:'hello',project_path:'relative'}]}),/absolute/);checks++;
assert.throws(()=>m.invocation({path:'shell.cmd'},[]),/wrapper/);checks++;
mkdirSync(join(home,'project'));
const project=m.createAgents('codex',{request_id:'with-project',sessions:[{title:'project',prompt:'hello',project_path:join(home,'project')}]});
check(project.sessions[0].workspace===join(home,'project'),'explicit project only');
await done('codex',project.sessions[0].managed_session_id);
const source=fileURLToPath(new URL('../',import.meta.url));
for(const [entry,tool] of [['plugins/claude-codex-live-bridge/bridge/server.mjs','create_claude_sessions'],['claude/desktop-extension/server/desktop-server.mjs','create_codex_sessions']]) {
  const run=spawnSync(process.execPath,[join(source,entry)],{input:JSON.stringify({id:1,method:'tools/list'})+'\n',encoding:'utf8',env:process.env});
  const tools=JSON.parse(run.stdout).result.tools;
  check(tools.some(t=>t.name===tool),'MCP creation tool exposed');
  check(tools.some(t=>t.name==='send_agent_message'),'MCP continuation exposed');
}
console.log('Managed agents: '+checks+' isolated checks passed. No real model calls.');
