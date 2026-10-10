# Continued monitoring

A skill is instructions. Supervision requires a host capability that starts another lead turn and access to saved state/workers. Verify both before promising unattended completion. Keep one mechanism per run, retain its ID, and reuse it after restart/compaction.

## Codex

During an active turn, use bounded waits and useful coordination; dispatch alone is not a reason to finish the turn. If the human explicitly requests a goal, discover `get_goal`, `create_goal`, `update_goal`; obey their authorization/status rules and reuse a compatible active goal. Never replace an unrelated goal or invent a token budget. Include acceptance checks and state path. A goal cannot guarantee progress while its host is unavailable.

For human-requested monitoring/later follow-up without a suitable active goal, use `automation_update` with a heartbeat for the existing chat. Inspect matching existing automations and current schemas. Default to five minutes if supported; record the actual cadence. Do not manufacture automation directives, evade heartbeat restrictions with standalone cron jobs, or create ordinary app chats as workers without explicit new-chat authorization.

Ephemeral native subagent IDs may not be reconnectable from scheduled contexts. For cross-turn supervision choose persistent bridge/CLI sessions with accessible state.

## Claude Code

Discover installed tools first. Current Claude Code documents `/goal` alongside `/loop`; a timer is not always necessary. A supported authorized goal can use “all required fleet tasks reviewed and combined acceptance checks pass,” with the state path/constraints. Do not overwrite an unrelated goal.

Otherwise use available `CronCreate`/`CronList`/`CronDelete` or loop tools for requested periodic supervision, at five minutes where supported. Read actual schemas, save the job ID and wake prompt. Printing `/loop` does not install it. If the human must invoke a slash command, provide it and mark monitoring pending until invoked.

Session schedules depend on CLI/session lifecycle and may expire. Check installed expiry/persistence rules and disclose prerequisites. Refresh only this run's timer when needed. Cancel it after verified completion or a non-actionable blocker.

## Claude Desktop/Cowork

Discover the scheduler and execution environment. A scheduled task may run in another task/host. Verify that it can access the same bridge endpoint, exact IDs, saved state, and workspaces before relying on it. Cloud scheduling without a local bridge connection cannot supervise laptop workers. Local scheduling may require an available machine/app. Choose the supported cadence nearest the requested interval and disclose it.

Ordinary Chat may have neither process/file access nor a scheduler. It can coordinate read-only bridge workers, but editable unattended fleets require those additional capabilities. An authorized, selected existing Codex/Code lead can supervise if reachable. Otherwise continue active-turn monitoring and report the missing capability.

## Wake prompt

Instantiate exact values, save the text with the scheduler identity, and leave no placeholders in an installed schedule:

```text
Continue authorized delegate-fleet run RUN_ID. Read STATE_PATH. Lead is LEAD_ID. If complete, cancelled, paused by the human, or blocked with no changed condition, do not dispatch; stop only this run's monitor as appropriate. If the interactive lead owns supervision, leave this cycle to it. Otherwise read exact workers after saved cursors, review new artifacts, send in-scope corrections to idle existing sessions, and launch ready tasks within saved capacity/budget. Preserve models/permissions; never create replacement chats on uncertainty. Save cursors, evidence, blockers, and next step. Quiet unchanged polls; notify on meaningful changes, required human action, or verified completion. Cancel MONITOR_ID after combined acceptance checks pass and save final evidence.
```

The scheduled context must actually read saved state. Use host non-overlapping jobs or an explicit recorded ownership handoff between interactive and scheduled leads. The helper serializes ledger commands; it is not a distributed supervisor lease.

Sources checked 2026-10-10: [Claude goal](https://code.claude.com/docs/en/goal), [Claude scheduling](https://code.claude.com/docs/en/scheduled-tasks), [Cowork scheduling](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork). Current host schemas take precedence.
