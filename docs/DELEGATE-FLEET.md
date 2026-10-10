# Delegate Fleet in both clients

The bridge bundles one portable `delegate-fleet` skill, sourced from
`plugins/claude-codex-live-bridge/skills/delegate-fleet`. The builder copies the
same skill into the Codex plugin, Claude companion plugin, Desktop extension
resources, and standalone Claude Skills upload ZIP. There are no independent
copies to maintain.

## Install

- **Codex:** install/update the bridge plugin; `$delegate-fleet` is discovered in
  its skills folder. Start a fresh chat if the current one has already loaded skills.
- **Claude Code:** install the matching companion plugin ZIP; it includes
  `/delegate-fleet`. The alert hooks still need the supported connector route;
  the skill does not depend on those alerts being live. Alternatively copy the
  canonical skill directory into `~/.claude/skills/`. Connect the project/channel
  separately to expose the bridge's Codex worker tools.
- **Claude Desktop/Cowork:** install the matching MCPB for bridge tools, then
  upload `claude-codex-live-bridge-skills-0.3.0-beta.8.zip` through
  **Customize → Skills**. MCPB resources do not automatically enable a skill.

Local editable workers need Python 3.10+, Node.js, the relevant signed-in CLIs,
and a host with local process/filesystem access. Read-only bridge coordination
does not require Python. App model availability does not guarantee CLI access.

## Use

Choose Opus or Sol as lead and give it this request, filling in the task and checks:

```text
Use delegate-fleet for [task]. Create and control Haiku and Luna worker sessions
as needed, with at most four active workers. Delegate implementation and tests,
review their results, and correct the same sessions. Keep monitoring until
[acceptance checks] pass, using an available goal or a five-minute monitor.
Preserve worker models and report any capability that prevents unattended work.
```

The lead records task dependencies, file ownership, exact worker IDs, model
choices, cursors, and acceptance evidence in accessible durable state. It queues
additional workers in waves, sends bounded corrections to idle existing
conversations, and finishes only after review/integration and combined checks.
Follow-up prompts stay within the human's original task authorization.

Codex uses `create_claude_sessions`; Claude uses `create_codex_sessions`.
Both sides read and continue exact managed IDs with `read_agent_session` and
`send_agent_message`. Managed sessions are local CLI conversations, separate
from app chats and bridge call IDs. See [managed sessions](MANAGED-AGENTS.md).

Current managed workers are read-only. Writable implementation uses the
skill's local CLI adapter when available, with workspace-write for Codex and
acceptEdits for Claude. Native Windows Claude permits PowerShell, which is not
an OS sandbox. The launcher exposes no permission-bypass option. Review the
skill's [local-worker reference](../plugins/claude-codex-live-bridge/skills/delegate-fleet/references/local-workers.md)
for exact commands and recovery rules.

## Monitoring and completion

Reuse a suitable goal when available. Otherwise, for human-requested continued
monitoring, use the host's actual scheduler and save its ID and wake prompt.
The ledger helper only records monitors; it does not install one. A five-minute
cadence is a preference, subject to the host's supported interval.

The wake context must reach the same saved state and worker endpoints. Cloud
Cowork scheduling alone cannot reach a local-only bridge. Ordinary Desktop
Chat may have no scheduler/local shell, and the bridge does not wake a fully
idle Desktop chat. Disclose those limitations rather than promising a timer
that has not been installed. Cancel only this run's monitor after verified
completion and keep sessions/artifacts recoverable.

Automated checks exercise local launch/resume, duplicate prevention, dependencies,
capacity, review/completion gates, and failure recovery with fake CLIs. Package
verification checks identical skill bytes and advertised session tools in both
fresh MCP servers. Live model entitlement and host scheduling are separate tests.

The CLI relays derive from MIT-licensed
[amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) at commit
`8ef02103ad99b53801f2b13d04755313fbbfafb2`; their notice ships inside the skill.
