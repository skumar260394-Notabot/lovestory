# Release verification — 0.3.0-beta.8

## Checked locally on Windows

- Source checks: JSON/manifests, JavaScript syntax, personal path and credential patterns.
- Legacy hook/setup suite passed.
- Setup upgrade suite: seven checks passed for missing caches, existing old files,
  settings preservation, repeat setup, incomplete events and server collisions.
- Reciprocal MCP/channel/protocol suite: 20 checks passed with a recording CLI stub.
- Reply-only notifications: 54 checks passed with isolated homes and synthetic sessions.
- Local review regressions: 24 Windows / 23 Linux checks for numbered database/schema discovery,
  stale chat exclusion, local Git protection, queue capabilities and real
  PowerShell/cmd probe execution. No live Claude model was contacted.
- Four built archives passed integrity and SHA-256 verification.
- Nine fleet behavior checks use fake Codex/Claude CLIs to exercise launch,
  exact-session resume, duplicate requests, dependency/capacity limits,
  review/completion gates, bridge pagination, and uncertain-launch recovery.
- The bundled skill has identical bytes in all four packages; freshly extracted
  MCP servers advertise creation, reading, and follow-up tools in both directions.
- Freshly extracted Codex and Desktop packages initialized and listed tools through real MCP subprocesses. They did not launch or contact real assistant sessions.
- Shared module bytes in the Desktop archive match the canonical runtime source.
- Git history starts from the sanitized public source; private development history and runtime state are excluded.

## Still requires live host verification

- Installing the public identities through each app's UI.
- Native Desktop direct MCP hook support, correct connector name, and actual model-visible pending-message acknowledgement.
- Codex delivery during an active turn without user steering on each supported host version.
- macOS/Linux client installation; Windows is the preview target.
- Live Haiku/Luna entitlement, writable model execution, and unattended host scheduling.

Automated simulation and fresh MCP startup do not replace these live checks. This is a prerelease so users can test and report host compatibility.


## Follow-up setup and route diagnostics

When `.mcp.json` is tracked, use connect_project with channel_config="private"
and the returned launch command. Shared files stay unchanged. Non-Git folders
can connect without Git; repositories still require it.

Activity lookup lists only locally registered feeds, not all Claude chats or
their histories. An unregistered cloud review cannot be read by title through
this connector. It must connect/register/send findings explicitly.

Alert hooks use the host's exact configured server/tool route. Device-linked
tasks may use remote-devices and a namespaced reply_hook alias. Obtain these
from the actual tool list, use reply_hook_configuration or build-alert-route.py,
then install the matching companion and run its native probe. No model-authored
fake hook receipts, timers or activity reminders. Routing repair does not prove
host support. Hooks-only sending skips Codex queue and cannot wake an idle chat.
