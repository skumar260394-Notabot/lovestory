# Install and invoke

The portable skill directory is `delegate-fleet` with `SKILL.md`, `agents/`, `references/`, `scripts/`, and `LICENSE`. Instructions can work with bridge-only hosts; editable local workers additionally require signed-in CLIs, Python 3.10+, and Node.js 18+.

- Codex: copy the directory into `~/.codex/skills/` (or the configured skill directory). Start a fresh session if discovery has already occurred. Invoke `$delegate-fleet`.
- Claude Code: copy the same directory into `~/.claude/skills/`. Invoke `/delegate-fleet`. The skill retains automatic discovery; it does not force a worker context or change your model.
- Claude Desktop/Cowork: upload the ZIP containing the top-level `delegate-fleet` folder through **Customize → Skills**, and enable it. A filesystem install into `.claude/skills` only installs for Claude Code. The local bridge connector must be separately installed/reachable in that environment.

Example request after selecting Opus or Sol as the lead:

```text
Use delegate-fleet for this task: [describe the task and acceptance checks]. Create Haiku and Luna worker sessions as needed, with at most four running at once. You control them and review/integrate their work. Keep monitoring until the acceptance checks pass; use an available goal or a five-minute monitor. Preserve worker model choices and correct the same sessions. Tell me if a capability prevents unattended completion.
```

Creating/using the skill is separate from authorizing commits, deployments, or external messages. Add those actions only when intended. For a fixed budget, include it in the request.

Desktop Chat, Cowork, CLI, and cloud environments differ. This package provides routing/guidance; it cannot supply a missing scheduler, grant model entitlement, make a local connector reachable from the cloud, or create ordinary app conversations through managed CLI tools. Do not promise capabilities without discovering and testing the actual host.

Official references: [Claude custom skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude), [Claude Code skills](https://code.claude.com/docs/en/skills). Checked 2026-10-10.
