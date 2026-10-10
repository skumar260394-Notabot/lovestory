# Changelog

## 0.3.0-beta.7 — 2026-10-10 (local candidate)

- Create batches of managed Codex or Claude Code conversations in either direction.
- Select a model per conversation and optional explicit project; no project defaults to a neutral workspace.
- Preserve native conversation IDs for follow-ups, without silently choosing another chat.
- Idempotent request IDs prevent repeated creation and duplicate follow-up turns.
- Configurable defaults: four simultaneous turns and ten-minute turn timeout.
- Read-only tools initially; local CLI login required. Ordinary app/cloud chat creation is not provided.
- Added 39 isolated checks. Real local greeting and saved-context follow-up passed for both CLIs.
- Existing Desktop alert companion remains unchanged.

## Unreleased — alert identity and single-path delivery

- Accept opaque native hook session IDs with stable safe binding keys.
- Allow the resolved transcript identity when the host omits session_id; never read transcripts.
- Diagnose empty and unresolved hook identities without retaining raw values.
- Default Claude sends to one path: recently active target hooks, otherwise the queue.
- Queue bodies are never also injected by the hook inbox, including submission races.
- Preserve uncertain queue sends in call records without an automatic duplicate retry.
- Added 82 alert checks and 28 single-delivery checks. Native host proof remains required.

## 0.3.0-beta.6 — 2026-10-02

- Private per-session channel config supports teams that track `.mcp.json`.
- Verified non-Git folders connect without Git; repository markers remain protected.
- Reply hook routes can be configured for a device-link namespace without guessing display names.
- Added hooks-only sending to Codex as an explicit alternative to queue wake.
- Missing review feeds explain their scope; they do not claim access to all Claude history.
- Privacy scan covers more platforms. Regression counts distinguish Linux and Windows.
- Native Desktop alert support still needs a probe and real acknowledgement after installation.

## 0.3.0-beta.5 — 2026-10-02

- Canonicalize Windows short names and directory aliases before protecting
  local Git configuration, including files that do not exist yet.
- Add an alias-path regression; all seven local review resolutions from
  beta.4 remain included. Native Desktop/cloud tests are still deferred.

## 0.3.0-beta.4 — 2026-10-02

- Read the newest compatible Codex state database instead of hard-coding
  `state_5.sqlite`; support title-only schemas, expose discovery diagnostics,
  and exclude archived/deleted chats from stale indexes and hook logs.
- Require Node.js 22.13.0+ for verified named-chat routing with `node:sqlite`.
- Use a harmless Node command for the native alert probe on Windows and POSIX.
- Declare hook paths explicitly in both Codex manifest formats.
- Probe actual Codex queue support; executable presence alone is insufficient.
- Protect generated project settings with local Git exclusions; refuse to
  rewrite tracked machine configs. Preserve unrelated settings and Git rules.
- Clarify Desktop companion versus Claude Code channel server names.
- Add isolated regressions for database upgrades, unavailable commands,
  native shell probes and local-config protection. No cloud setup or live
  Claude alert test is included.

## 0.3.0-beta.3 — 2026-10-02

- Reconnecting a Claude Code project refreshes old managed hook and channel
  script paths, preserving other hooks, servers, permissions and custom options.
- Status distinguishes saved entries from usable scripts, reports missing
  lifecycle events/files and offers the repair step. Saved configuration alone
  does not establish a live channel or loaded hook.
- A conflicting third-party server is preserved and connection setup reports
  the failure instead of claiming success.
- Added six isolated upgrade regression checks and clarified that Desktop-only
  use requires neither Claude Code installation nor its CLI login.
- After updating, Claude Code users should run `connect_project` for existing
  connected projects and reload their session as needed. No cloud-session
  connector change is included in this release.

## 0.3.0-beta.2 — 2026-10-02

Renamed the public project to **Claude Codex Live Bridge** at the owner's request. Repository and current installation links use `claude-codex-live-bridge`. Matching Codex, Desktop and alert companion packages have the new identity. Protocol storage and the internal Codex MCP key are preserved.

If beta.1 was installed, disable/remove its lovestory packages before enabling the renamed packages. Historical beta.1 remains available; install beta.2 for the current name.

## 0.3.0-beta.1 — 2026-10-02

First public preview under the **lovestory** name, derived from private Codex bridge 0.2.9 and Desktop/companion 0.2.8.

- Existing named-session lookup and deliberate project-optional Desktop routing.
- Linked calls, acknowledgements and configurable 200-turn conversation default.
- Automatic Codex executable discovery after app updates.
- Claude Code hooks, development channel and optional activity observation.
- Experimental silent Desktop reply hooks with explicit native-session probing, bounded message batches and no automatic activity reports.
- Shared runtime source, portable build/test scripts, install/removal documentation, MIT license and checksums.
- Replaced personal test session IDs with synthetic fixtures; excluded live data and private development history.

### Known limits

Windows is the supported installation target for this preview. Live Desktop MCP tool-hook transport and Codex delivery during an active turn have not been confirmed for all host versions. An idle Desktop chat is not woken by this connector. Queue acceptance is not model receipt. Claude Code channels require development-channel opt-in and host support.

Public plugin identities are new: `lovestory` and `lovestory-desktop`, with companion `lovestory-alerts`. Existing private bridge installations are not upgraded automatically. Avoid enabling both versions' hooks at once. The technical MCP server key and local store retain their legacy names for protocol compatibility.
