# Local CLI workers and saved state

Requires Python 3.10+, Node.js 18+, and the relevant signed-in Claude Code or Codex CLI. The helper uses the two bundled MIT relays. They send briefs over stdin, save public JSONL activity and native IDs, support exact-session resume, and apply a turn watchdog. This creates local CLI conversations, not app sidebar chats.

## Permissions and workspace ownership

Codex editable workers use `workspace-write`, passed again on resume. Claude uses `acceptEdits` with Read/Glob/Grep/Edit/Write and the platform shell, disabling MCP/skill/Agent recursion. On Linux/macOS/WSL its shell sandbox must be available. On native Windows, the inherited Claude relay allows PowerShell to run headlessly; that is not OS isolation. Use an approved container/WSL boundary if required. No helper option enables permission/sandbox bypass. Read-only mode is for reviews; Claude's read-only change check is a detection aid, not OS enforcement. Task briefs, isolated workspaces, and lead review remain necessary.

Read project constraints and preserve a baseline before dispatch. Prepare separate Git worktrees for conflicting writers, following the host's workspace tools. Do not copy unstaged user changes into a new worktree without considering whether the task needs them. Workers must not commit/push unless expressly assigned. The relays themselves never commit.

The script locks ledger updates and reserves requests before launch. It does not reserve account-wide bridge slots or provide an inter-host supervisor lease. The lead must also check external capacity and enforce any user spending/time limits.

## Helper commands

Resolve `FLEET` to the absolute `scripts/fleet.py` beside this skill. Write the small input files before calling it. Use your host's Python executable (`python`, `python3`, or bundled Python).

```text
python FLEET init --objective objective.txt --checks checks.txt --authorization authorization.txt --lead EXACT_LEAD_ID --limit 4
```

The input files contain the actual objective, measurable acceptance criteria, and user's authorization/constraints, including any budget. Output includes `state_path`; subsequent commands require that exact path as `STATE`. Default storage is private `~/.delegate-fleet/runs/RUN_ID`, outside the project. `--directory` chooses another accessible private location. Do not commit it or place it under synced `sources/`.

Create the queued tasks before dispatch. `scope.txt` records ownership and task constraints. The brief additionally contains context, outputs, check commands, and reporting contract.

```text
python FLEET --state STATE add --id api --provider codex --model gpt-6-luna --workspace ABSOLUTE_WORKSPACE --scope scope.txt
python FLEET --state STATE add --id tests --provider claude --model haiku --workspace TEST_WORKSPACE --scope test-scope.txt --depends api
python FLEET --state STATE start --id api --request-id api-turn-1 --brief api-brief.txt --timeout 15m
python FLEET --state STATE status
python FLEET --state STATE refresh
```

`start` detaches a persistent runner and returns its PID/artifact directory. It is a launch receipt. The worker can finish while the lead is idle; the lead is not automatically woken. `status`/`refresh` ingest results. `--max-turns N` is an optional Claude per-turn limit; Codex does not support that relay flag. Choose a task-appropriate timeout rather than treating 15 minutes as a completion deadline.

Ready dependencies must be `reviewed`. Finished turns become `awaiting_review`; failures are explicit. Read `result.json`, actual artifacts/diffs, and relevant checks. A relay exit alone cannot accept a task. Save actual review evidence in a file:

```text
python FLEET --state STATE review --id api --pass --evidence api-review.txt
python FLEET --state STATE review --id tests --rework --evidence test-defects.txt
python FLEET --state STATE start --id tests --request-id tests-turn-2 --brief correction.txt --timeout 15m
```

Corrections use the stored `threadId`/`sessionId` and preserve the task model. A prior turn without a confirmed ID cannot be silently replaced. Each new turn needs a new request ID. Retry the same ID and exact input to obtain the existing launch; changed input is refused. Marking rework means the lead has inspected the failure and decided another turn is justified; the helper never retries automatically.

## Tracking bridge workers with the same ledger

Use `add ... --backend bridge --read-only`, specifying the provider/model/workspace. Persist the exact tool payload before creation/follow-up:

```text
python FLEET --state STATE reserve --request-id review-1 --payload bridge-request.json
```

Then call the actual bridge tool with that request ID. The helper does not call MCP. After launch/read, save the tool's structured JSON result to `bridge-event.json`. For a creation batch, select the exact `sessions` object assigned to this task. For follow-up, select its `session` object. `record-bridge` accepts either a session object or a `read_agent_session` result with `session` and `next_cursor`:

```text
python FLEET --state STATE record-bridge --id review --event bridge-event.json
```

Drain `more` pages before review, retain `next_cursor`, and inspect truncation flags. The helper refuses changed session identities and regressing cursors. Reviews still require actual artifact evidence. For another bridge turn, mark rework, reserve a new request ID, send to that same managed ID, and record the returned starting/running state. Check dependencies/global capacity before the MCP call; ledger recording does not enforce bridge dispatch limits.

## Monitoring, pause, completion, recovery

Set up the real host monitor using [supervision.md](supervision.md), then record it:

```text
python FLEET --state STATE monitor --record actual-monitor.json
```

Record JSON with `status` (`active`, `stopped`, `unavailable`, `foreground`), `host`, actual `id` for an active schedule/goal, verified cadence/access, and wake prompt where relevant. This records an existing mechanism; it never installs or cancels it.

After combined acceptance checks pass, stop the host schedule, record it `stopped`, then:

```text
python FLEET --state STATE finish --evidence integrated-acceptance.txt
```

Evidence files are the lead's recorded verification, not checks executed by the helper. Completion is refused while tasks remain unreviewed or a recorded monitor remains active. `run-status --value paused|blocked|cancelled|active --reason TEXT` changes dispatch state; it does not terminate existing processes. Pause only on the human's request. Cancelling a run requires the lead to stop its host monitor and handle any workers already running through available controls.

Recovery: inspect the existing ledger, runner PID, logs and output. Never choose the newest CLI/app conversation. A dead runner without final status becomes `interrupted`; a launch reserved without PID stays uncertain. Do not steal a stale lock until its recorded owning process is confirmed gone. Do not resend an uncertain request as a new one; determine whether it ran first. Windows PID reuse can leave liveness ambiguous; prefer exact artifacts/process identity over assuming a missing result is safe to retry.

## Artifacts and unsupported options

Each local turn keeps `input.txt`, `command.json`, runner logs/status, and relay `result.json`, `events.jsonl`, `final.txt`, `stderr.txt`, `brief.txt`; Claude also saves `profile.json`. These can contain private workspace information. Read the final report and relevant events; do not repeatedly load full transcripts.

`codex-relay.mjs` and `claude-relay.mjs` are pinned upstream relays. Their direct `--help` includes optional upstream lane integration and bypass flags. This skill's launcher does not expose or use those flags; `--lane` needs the separate upstream delegate-setup skill and is unsupported in this package. Do not use global `--resume-last` or direct bypass flags to evade this workflow. Updating relays should preserve the MIT notice and be followed by launch/resume regression checks.
