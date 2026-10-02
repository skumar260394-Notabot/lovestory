# Local review resolution — 0.3.0-beta.6

The seven questions from the owner's Claude review were checked against source,
installed-client help and the vendors' current documentation.

| Finding | Resolution |
| --- | --- |
| Old installed cache paths survive an update | Fixed in beta.3; reconnect refreshes owned hooks/channel paths and preserves other settings. Upgrade regressions remain in the suite. |
| Hard-coded SQLite version and Node 18 claim | Fixed: discover descending numbered state databases, inspect available columns, require id/cwd/archived, support optional name/title/time, expose failures. Node 22.13.0+ is now required. A current database wins over stale index entries and hook logs. |
| Manifest format and missing hook reference | Both manifest formats are supported. Root OpenAI extensions replace the compatibility overlay. Explicit `./hooks/hooks.json` is now declared in both; the previous default discovery was valid. Portable MCP launch paths retain `${PLUGIN_ROOT}`. |
| Different server names | Intentional: Codex and Claude Code use `claude-live-bridge`; the Desktop companion targets `Claude Codex Live Bridge`. Documented host scope; Desktop hook resolution still needs a native test. |
| POSIX-only probe | Fixed: the returned Node command works in PowerShell, cmd and POSIX shells with the required runtime installed. Automated tests execute the command without a model session. |
| Availability of `codex queue` | Confirmed in the installed desktop client's help. The bridge now probes support before advertising availability or attempting a send; unsupported clients leave inbox messages pending. Queue acceptance still does not prove model visibility. |
| Machine paths in project configs | Fixed: generated files receive exact local Git exclusions, including nested workspace paths. Setup refuses tracked files and never untracks them or changes shared ignore rules. |

References: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins),
[Node SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html), and
[Claude Code MCP scopes](https://code.claude.com/docs/en/mcp#local-scope).

This local review does not establish cloud connector visibility, automatic
Codex return delivery, or native Desktop reply-hook support. Those need their
separate host tests. No live Claude messages were sent for these checks.

## Follow-up review

Claude's Linux re-review confirmed the seven original fixes. New improvements:

- Teams with a tracked `.mcp.json` can select `channel_config: "private"` and
  use the returned `--mcp-config` launch command. Tracked files remain intact.
- Non-Git folders work without Git. Repository/worktree markers or Git
  environment overrides require Git; the guard does not assume safe absence.
- Privacy checks now cover macOS user directories and the root user's home.
- The former preview name was removed from runtime matching. Historical
  changelog/release names remain to document migration; they are not secrets.
- Linux runs 23 local-review checks; Windows runs 24 because it also executes
  the returned probe in cmd. The beta.5 counts were 16 and 17 respectively.
- Reply-only alert configuration now accepts an explicit server/tool route.
  The owner's device-linked chat exposes `remote-devices` with a namespaced
  alias, unlike the direct companion's server. A matching route package still
  needs a native receipt and pending-message acknowledgement test.
- Claude can select hooks-only delivery to Codex; it does not start a queue
  wake or claim that the model received the pending message.
