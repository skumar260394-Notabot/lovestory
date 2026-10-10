# Managed Codex and Claude sessions

The bridge can launch independent, persistent **local CLI conversations** in
both directions. Claude calls `create_codex_sessions`; Codex calls
`create_claude_sessions`. These are managed agents, not creators for ordinary
ChatGPT, Claude Desktop, Cowork, or Claude cloud chats. They may be discoverable
in a CLI's own history; app sidebar visibility is not promised.

## Create one or several agents

Creation requires an explicit user request. Each specification includes its
own title and starting prompt, and may include an exact model/CLI alias and
an absolute local project folder. Omitted model preserves the CLI default;
an unavailable model fails visibly instead of silently selecting another one.
Omitted project uses a new neutral workspace under the bridge's private state
directory, never the caller's current project.

Example tool input (use a different request ID for a different operation):

```json
{
  "request_id": "my-review-pair-1",
  "sessions": [
    {"title": "Review terrain", "prompt": "Review the terrain design and report concerns."},
    {"title": "Review buildings", "prompt": "Review the building design and report concerns."}
  ]
}
```

Use `model` on each specification to choose different models for different
agents. For a coding review, supply `project_path` deliberately. Give agents
the context they need in their prompts: they do not automatically inherit the
parent chat's transcript. Task boundaries remain the user's decision.

## Follow the same conversations

- `list_agent_sessions`: find managed sessions by title. This list is separate
  from ordinary Codex chats and Claude activity feeds.
- `read_agent_session`: pass the exact `managed_session_id` and optionally
  `after_cursor` to read public output and tool events. No hidden reasoning is
  recorded. `starting`, `running`, `completed`, `failed`, and `interrupted` are
  distinct. A launch is not proof the model responded.
- `send_agent_message`: pass the same managed ID, a new `request_id`, and the
  user-authorized message. This resumes its saved native conversation and
  preserves model selection. A busy session rejects a follow-up; it does not
  create a duplicate turn or add a second queue delivery.

Retry a request with the same request ID and identical input to retrieve its
existing sessions/turn. Reusing that ID for different input is refused. Batch
order is preserved on retries. Workers run independently of the MCP server;
closing the originating chat does not discard their saved replies.

The managed-session tools do **not** use `call_id` or the ordinary chat's
alert subscription. Managed IDs cannot be substituted as native Desktop
hook IDs or live-channel endpoints. Responses are read through the managed
tools. An always-open streaming agent connection is a separate future feature.

## Requirements and defaults

Both respective CLIs must be installed and signed in on the computer running
the bridge. No credentials are copied to a relay. Creating a managed Claude
agent requires Claude Code login; messaging an existing Desktop chat does not.
Normal subscription/API usage and limits apply.

Initial implementation uses read-only Codex sandboxing with no permission
escalation. Claude agents expose Read, Glob and Grep in plan mode, with no
project/user settings or MCP server discovery. These tools are suitable for
discussion and review; they do not authorize code modifications. Models can
report a permission blocker. No setting grants blanket permission bypass.

Configuration in the existing private `config.json`:

```json
{
  "managed_agents_max_running": 4,
  "managed_agent_timeout_ms": 600000
}
```

The concurrency setting is shared across both directions, permits 1–32
running turns, and counts turns already starting. A batch accepts 1–8
specifications, provided the whole batch fits. Turn timeout permits
10,000–3,600,000 milliseconds. Failures and uncertain interrupted turns are
never automatically retried. Permission denial counts are surfaced when the
CLI supplies them. Public response text is bounded to 20,000 characters and
its truncation is explicit; events contain up to 4,000 characters per message.

Private runtime data (session IDs, prompts, responses, workspace paths) stays
under the current user's `.codex-claude-live/managed-agents`. It must never be
committed to the public repository. Provider model inference still uses the
respective provider's network service. The feature works locally before
Railway deployment; cloud use will require the paired laptop agent and its
per-user authorization boundary.

References: [Codex noninteractive mode](https://developers.openai.com/codex/noninteractive),
[Claude programmatic sessions](https://code.claude.com/docs/en/headless).
