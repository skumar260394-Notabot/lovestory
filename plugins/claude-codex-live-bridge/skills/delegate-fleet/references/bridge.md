# Claude/Codex Live Bridge adapter

Baseline: Claude Codex Live Bridge 0.3.0-beta.8 managed-session tools, inspected 2026-10-10. Tool prefixes depend on the host; discover schemas. The plugin's `docs/MANAGED-AGENTS.md` and current schemas are authoritative for later versions.

## Managed workers

| Lead | Bridge creates | Same-provider workers |
| --- | --- | --- |
| Codex with Claude Live Bridge | `create_claude_sessions` | Local Codex CLI or a native tool that permits the selected model |
| Claude with Codex Live Bridge extension | `create_codex_sessions` | Local Claude CLI or an available native Haiku agent tool |

Creation accepts `request_id` and `sessions` objects with `title`, `prompt`, optional `model`, optional `project_path`. Provide the intended absolute workspace; omission selects a neutral one. For an authorized read-only review from Codex:

```json
{
  "request_id": "fleet-r42-api-review-1",
  "sessions": [{
    "title": "r42 API review",
    "model": "haiku",
    "project_path": "C:/work/project",
    "prompt": "Task api-review. Read-only: inspect the API contract; return defects with file locations and evidence. Do not edit, spawn agents, or schedule anything."
  }]
}
```

Claude uses `create_codex_sessions` with the same shape and an available exact Luna model ID, e.g. `gpt-6-luna`. Verify CLI/account availability. Keep the requested inexpensive worker model.

Both sides expose:

- `list_agent_sessions({query?})` for managed agents.
- `read_agent_session({managed_session_id, after_cursor?})` for public output/activity.
- `send_agent_message({managed_session_id, request_id, message})` for the next turn in that exact idle session. Busy sessions reject follow-ups; do not route the same correction through a second delivery path.

Save actual states/cursors. Starting/running/completed/failed/interrupted differ. Follow-up preserves the native conversation/model. Retry request IDs only for identical inputs. Interrupted/failed turns are not automatically retried.

Defaults: four concurrent turns shared across directions. Batches accept 1–8 specifications only if the entire batch fits capacity. Launch waves rather than eight workers into four slots. Turn timeout defaults to ten minutes. Public reports can be truncated; inspect flags and obtain a concise report or inspect the artifact.

**Current managed workers are read-only**: Claude exposes Read/Glob/Grep in plan mode; Codex uses a read-only sandbox. They are local CLI conversations, with no promised app sidebar entries, inherited MCP tools, or always-open stream. Use the local adapter to edit. If unavailable, report the missing writable backend.

## Calls with existing leads

Peer calls are separate from managed workers:

- Codex: inspect `bridge_status` with the project, then `list_sessions`; select the intended existing Claude `session:<id>`. Use `call_claude` and `reply_to_claude`. Ordinary sessions receive hook messages at their next hook boundary. A live channel can reach idle Claude Code only when its identity/connection is established.
- Claude Desktop/Cowork: use `codex_sessions` to discover existing named Codex chats. Select the intended `thread:<id>` and use `call_codex`, `reply_to_codex`, `read_codex_messages` according to current schemas.
- Save returned `call_id` values. Filled segments can create linked continuations; use each returned ID. Check delivery/acknowledgement before claiming receipt. A queued message is not receipt.

Managed IDs are not hook/channel endpoints. Activity-feed IDs do not route messages. A pending bridge message alone does not wake ordinary Claude Desktop Chat. Peer participation/scheduling must be authorized by the human.

Hook installation is a separate project configuration action. If needed within authorized setup, use plugin tools/guidance, preserve unrelated settings, prefer private channel configuration, and verify observed hooks/real acknowledgements. Existing sessions may need reload/trusted hooks. Do not reinstall hooks by default.
