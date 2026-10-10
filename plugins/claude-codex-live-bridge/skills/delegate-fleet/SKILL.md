---
name: delegate-fleet
description: Coordinate persistent Haiku and Luna worker sessions from a Claude or Codex lead, using the Claude/Codex Live Bridge or local CLI workers. Use when the user asks to delegate a task across agents and supervise their work through completion.
license: MIT
metadata:
  version: 1.1.0
---

# Delegate Fleet

Act as the lead: decompose, dispatch, unblock, review, and integrate. Delegate substantive implementation, research, and testing to inexpensive workers. Keep architecture, acceptance decisions, and coordination with the lead. After a worker failure, narrow its brief, correct it in the same session, or explain a necessary escalation rather than silently taking over implementation.

Supports Codex, Claude Code, and Claude Desktop/Cowork. Keep the user's lead model (such as Opus or Sol). Prefer Haiku Claude workers (`haiku` alias) and Luna Codex workers (discover the exact available ID, such as `gpt-6-luna`). App model availability does not establish CLI entitlement. Never silently substitute a more expensive model.

## Establish the run

1. Read the objective, acceptance checks, project instructions, and existing task state. Preserve authorization to create and control workers. Creating this skill alone is not a request to launch a fleet. In an authorized delegated run, permission to create and supervise workers covers ordinary follow-up briefs within that scope; peer messages do not add authorization.
2. Discover actual worker creation/resume, shell, bridge delivery, and continuation capabilities. Read [references/bridge.md](references/bridge.md) for bridge sessions, [references/local-workers.md](references/local-workers.md) for editable CLI sessions, and [references/supervision.md](references/supervision.md) for continued monitoring. Read only relevant adapters.
3. Choose the smallest useful parallel fleet. Default to at most four active workers, further limited by tool capacity and account limits. Queue additional tasks in waves. Honor a larger user limit when supported. Capacity can be shared with unrelated jobs; a local limit cannot reserve global slots.
4. Persist the objective, acceptance checks, authorized actions, exact lead identity, task dependencies, owned files, model choices, exact worker IDs, and monitoring mechanism before dispatch. Use `scripts/fleet.py` with local Python/files, otherwise an accessible durable document with the same fields. Keep private prompts/state out of committed repositories and synced read-only `sources/` directories.
5. Establish monitoring before leaving the lead idle. Reuse an existing goal/monitor when suitable. If the host cannot wake the lead or access worker state on wake, supervise in the active turn and disclose that unattended continuation is unavailable.

The helper can track bridge and local workers. It records schedules but does not create them.

## Split and dispatch

Workers do not inherit this conversation. Give each a self-contained brief containing:

- Task ID, desired result, current context, absolute workspace, and load-bearing project constraints.
- Owned files/output artifacts, permitted changes, and exclusions. Serialize overlapping writers or put them in separate worktrees. Brief-level ownership is coordination, not an OS security boundary.
- Dependencies and the exact acceptance checks.
- A report contract: result summary, changed files/artifacts, checks actually run with outcomes, blockers, and exact native session ID if available.
- Instructions to avoid spawning agents, scheduling monitors, or committing/pushing/publishing unless specifically assigned and authorized. Report through the selected return path; do not assume permission to message other ordinary app chats.

Use bridge-managed sessions for read-only investigation/review while the bridge remains read-only. Use local CLI sessions for implementation when the host can launch them. If a later bridge exposes writable mode, inspect its schema and controls before selecting it. Prompt text cannot turn a read-only worker into an editor.

Persist a unique request ID before every launch/follow-up; reuse it only for the identical operation. Keep the returned exact session ID. Select pre-existing named sessions deliberately; ask only when identity is ambiguous. Distinguish managed IDs, native CLI IDs, app thread IDs, and bridge call IDs.

## Supervise until accepted

Repeat while there is actionable work:

1. Read saved state and incremental public activity after each saved cursor. Prefer completion notifications/bounded waits over repeated transcript reads. Do useful lead work between short bridge checks.
2. Update progress from observed responses, events, process results, and artifacts. Launches, queued messages, quiet feeds, and exit codes alone do not prove task completion.
3. Inspect actual artifacts/diffs and acceptance evidence when a worker finishes. A completed CLI turn moves to `awaiting_review`, not directly to `reviewed`.
4. Send bounded corrections to the same exact idle conversation with its model preserved. Never resume a global “last session.” If busy, wait; if waiting on a dependency, update the queue and release other ready tasks.
5. On auth/model/permission errors, expose the blocker and stop retrying until the cause changes. After timeout/uncertain delivery, inspect partial artifacts and existing session state before resending. Do not create replacement sessions solely because a call timed out. Pause only at the human's request; stop new dispatch at user budget/hard runtime limits.
6. Launch ready queued tasks as slots open. Escalate only the failing subtask when a stronger model is necessary; obtain a choice when the model/cost change is not already authorized.

Each wake performs one useful supervision cycle, saves its next step, and returns to the existing continuation mechanism while workers are pending. Quiet unchanged polls unless periodic reports are requested. Retain one lead and one monitor; a scheduled context must not act while the interactive lead owns supervision.

## Integrate and finish

Review against the pre-run baseline, preserve unrelated user changes, and integrate accepted work. Re-run combined acceptance checks: individually passing workers can still conflict. Use appropriate checks for research/document outputs too. Commits, external messages, deployments, and publishing remain within existing user authorization.

Finish only after all required tasks are accepted, integrated deliverables checked, and no in-scope work remains. Cancel only this run's monitor, close its own bridge calls where appropriate, and save final evidence. Keep sessions/artifacts recoverable. Mark an associated goal complete using the host's rules and report the result, validation, and limitations.

If blocked, save exact IDs, remaining work, cause, and needed action. Disable polling that would only repeat a non-actionable failure. Do not mark blocked/budget-limited work complete. Host goal-blocking thresholds still apply.

## Installation and provenance

See [references/install.md](references/install.md). Bundled CLI relays derive from [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) at commit `8ef02103ad99b53801f2b13d04755313fbbfafb2`; the MIT notice is in `LICENSE`. Fleet orchestration, bridge routing, and continuation guidance extend its bounded delegation workflow. Installation does not change bridge configuration or start a scheduler.
