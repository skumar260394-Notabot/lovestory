# Claude Codex Live Bridge 0.3.0-beta.8

This preview bundles Delegate Fleet for Claude and Codex and includes the
latest managed-session creation and exact-session follow-up tools in both
directions. An Opus or Sol lead can coordinate Haiku/Luna workers, queue tasks,
review outputs, correct the same conversations, and arrange monitoring through
the host's available goal or scheduler.

## Downloads

- `claude-codex-live-bridge-codex-0.3.0-beta.8.zip`: Codex plugin with `$delegate-fleet`; repository marketplace installation is recommended.
- `claude-codex-live-bridge-desktop-0.3.0-beta.8.mcpb`: Claude Desktop bridge tools and bundled skill resources.
- `claude-codex-live-bridge-alerts-0.3.0-beta.8.zip`: Claude companion plugin with `/delegate-fleet` and experimental reply-only alerts.
- `claude-codex-live-bridge-skills-0.3.0-beta.8.zip`: upload through **Customize → Skills** in Desktop/Cowork. The MCPB alone does not register the skill.
- `SHA256SUMS.txt`: checksums for all four packages.

See [installation](https://github.com/skumar260394-Notabot/claude-codex-live-bridge/blob/main/docs/INSTALL.md)
and [fleet usage](https://github.com/skumar260394-Notabot/claude-codex-live-bridge/blob/main/docs/DELEGATE-FLEET.md).

## Changes

- Persistent task state, dependency/capacity controls, exact model/session choices,
  review gates, recovery on uncertain launch, and goal/scheduler guidance.
- Identical skill content in all four packages, from one canonical source.
- Native worker state updates are serialized with status reads to avoid Windows
  atomic-rename failures while leads poll their workers.
- Includes managed local worker creation in both directions, private channel
  configuration, native alert identity handling, and single-path Codex delivery
  from the latest local development commits.

## Validation and limitations

Isolated bridge suites and nine fleet behavior checks run without contacting
real models. Packages pass checksum/integrity checks and fresh MCP startup;
both servers advertise worker creation, reading, and follow-up tools.

Managed bridge workers are currently read-only. Editable workers use the
bundled CLI adapter where local shell access and signed-in CLIs are available.
That adapter needs Python 3.10+; native Windows Claude permits PowerShell and
does not gain an OS sandbox. The launcher does not expose permission bypass.

Live model availability, writable execution, and uninterrupted host scheduling
remain host-dependent. Idle Claude Desktop wake and a cross-machine/cloud relay
are not supplied. Queue acceptance is not model receipt. Existing native alert
transport limitations remain; run the real probe before relying on silent alerts.

Runtime data stays in local user stores; delivered messages enter provider
conversations. No private prompts, credentials, machine paths, or unfinished
cloud-development files are included. MIT licensed, with the delegation relays'
upstream notice retained. Independent of Anthropic and OpenAI.
