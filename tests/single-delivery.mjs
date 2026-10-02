import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sandbox = mkdtempSync(join(tmpdir(), 'bridge-single-delivery-'));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
process.env.CODEX_HOME = join(sandbox, '.codex');
const root = join(sandbox, 'project'); mkdirSync(root);
const base = new URL('../plugins/claude-codex-live-bridge/bridge/', import.meta.url);
const hookFile = fileURLToPath(new URL('codex-hook.mjs', base));
const stub = join(sandbox, 'queue-stub.mjs'), log = join(sandbox, 'queue.jsonl');
writeFileSync(stub, `
import {appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if (process.argv.includes('--help')) {console.log('queue --thread <id> --message <text>'); process.exit(0);}
const argv=process.argv.slice(2), thread=argv[argv.indexOf('--thread')+1];
const hook=spawnSync(process.execPath,[${JSON.stringify(hookFile)},${JSON.stringify(root)}],{
 input:JSON.stringify({session_id:thread,cwd:${JSON.stringify(root)},hook_event_name:'PreToolUse'}),encoding:'utf8',env:process.env});
appendFileSync(${JSON.stringify(log)},JSON.stringify({argv,hook_output:hook.stdout,hook_error:hook.stderr})+'\\n');
if(process.env.BRIDGE_TEST_QUEUE_REJECT==='1') {console.error('queue rejected');process.exit(1);}
if(process.env.BRIDGE_TEST_QUEUE_SIGNAL==='1') {process.kill(process.pid,'SIGTERM');}
console.log('queued');
`);
process.env.CODEX_BRIDGE_CLI = stub;
const {openCall,sendTurn,takeInbox,appendCodexEvent,readCall,closeCall,bridgeConfigPath} = await import(new URL('protocol.mjs',base));
const {atomicJson} = await import(new URL('common.mjs',base));
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
const queueCalls=()=>{try{return readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}catch{return [];}};
function call(thread){return openCall(root,{subject:'single delivery',opened_by:'claude',claude_endpoint:'channel:desktop',codex_endpoint:`thread:${thread}`,max_turns:6});}
function send(thread,options={}) {const c=call(thread); const sent=sendTurn(root,c.call_id,'claude','payload; `literal` '+ 'a'.repeat(1800),options);closeCall(root,c.call_id,'test done','claude');return sent;}

appendCodexEvent(root,'active',{event:'PreToolUse'});
const active=send('active');
check(active.turn.delivery.route==='hook_only','auto uses recently active exact-thread hook');
check(queueCalls().length===0,'active delivery submits no duplicate chat turn');
check(takeInbox(root,'codex','thread:active','test-hook').length===1,'active hook inbox contains exactly one body');
check(takeInbox(root,'codex','thread:active','test-hook').length===0,'second boundary cannot receive the body again');

const idle=send('idle');
check(idle.turn.delivery.route==='queue' && idle.turn.delivery.wake.ok,'unobserved idle thread uses queue');
const queued=queueCalls().at(-1);
check(queued.argv.length===5 && queued.argv[0]==='queue','queue body is one argv value without shell parsing');
check(queued.argv[4].includes('payload; `literal`') && queued.argv[4].includes('a'.repeat(1800)),'queue keeps the full message and literal shell characters');
check(queued.argv[4].includes(idle.turn.message_id) && queued.argv[4].includes('not from the user'),'queue has a stable message ID and peer provenance');
check(queued.hook_output==='' && queued.hook_error==='','hook racing during queue submission receives no second body');
check(takeInbox(root,'codex','thread:idle','test-hook').length===0,'later hook cannot inject an accepted queue body');
check(readCall(root,idle.call.call_id).turns[0].delivered_at===null,'queue acceptance does not manufacture model receipt');

appendCodexEvent(root,'stopped',{event:'PreToolUse'});
appendCodexEvent(root,'stopped',{event:'Stop'});
appendCodexEvent(root,'stopped',{event:'BridgeMessageDelivered'});
check(send('stopped').turn.delivery.route==='queue','Stop remains idle even if a bookkeeping event follows');
appendCodexEvent(root,'stale',{event:'PreToolUse',at:'2020-01-01T00:00:00.000Z'});
check(send('stale').turn.delivery.route==='queue','stale hooks do not claim the thread is currently active');
check(send('other').turn.delivery.route==='queue','another thread activity cannot suppress selected target wake');
const before=queueCalls().length;
check(send('explicit-hook',{delivery_mode:'hook_only'}).turn.delivery.route==='hook_only','explicit hook mode works without observed activity');
check(queueCalls().length===before,'explicit hook mode never queues');
appendCodexEvent(root,'explicit-queue',{event:'PostToolUse'});
check(send('explicit-queue',{delivery_mode:'queue'}).turn.delivery.route==='queue','explicit queue overrides activity without dual publishing');
check(takeInbox(root,'codex','thread:explicit-queue','test-hook').length===0,'explicit queue has no hook copy');

atomicJson(bridgeConfigPath(),{codex_delivery_mode:'hook_only'});
check(send('configured-default').turn.delivery.route==='hook_only','config can change the default');
atomicJson(bridgeConfigPath(),{codex_delivery_mode:'auto',codex_active_hook_window_ms:1000});
appendCodexEvent(root,'configured-window',{event:'PostToolUse',at:new Date(Date.now()-2000).toISOString()});
check(send('configured-window').turn.delivery.route==='queue','configured active window is honoured');
const invalid=call('invalid-mode');
assert.throws(()=>sendTurn(root,invalid.call_id,'claude','bad',{delivery_mode:'both'}),/delivery_mode/);checks++;
check(readCall(root,invalid.call_id).turns.length===0,'invalid mode is rejected before persisting a turn');closeCall(root,invalid.call_id,'done','claude');

const unsupported=join(sandbox,'unsupported-cli.mjs');
writeFileSync(unsupported,"console.error('queue unavailable');process.exit(1);");
process.env.CODEX_BRIDGE_CLI=unsupported;
const rejected=send('rejected');process.env.CODEX_BRIDGE_CLI=stub;
check(!rejected.turn.delivery.wake.attempted && rejected.turn.delivery.route==='hook_only','unavailable queue falls back before any submission');
check(takeInbox(root,'codex','thread:rejected','test-hook').length===1,'unsent queue message remains deliverable once');
process.env.BRIDGE_TEST_QUEUE_REJECT='1';
const failed=send('failed');delete process.env.BRIDGE_TEST_QUEUE_REJECT;
check(failed.turn.delivery.wake.submission_uncertain && !failed.turn.delivery.queued,'nonzero queue result is treated conservatively as uncertain');
check(takeInbox(root,'codex','thread:failed','test-hook').length===0,'unknown queue error cannot cause duplicate fallback');
process.env.BRIDGE_TEST_QUEUE_SIGNAL='1';
const uncertain=send('uncertain');delete process.env.BRIDGE_TEST_QUEUE_SIGNAL;
check(uncertain.turn.delivery.wake.submission_uncertain && !uncertain.turn.delivery.queued,'terminated queue is reported uncertain');
check(takeInbox(root,'codex','thread:uncertain','test-hook').length===0,'uncertain submission never publishes another copy');
console.log(JSON.stringify({checks,passed:true,sandbox,live_app_delivery:'unverified'}));
