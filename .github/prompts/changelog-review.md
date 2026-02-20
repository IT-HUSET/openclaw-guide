Review and implement any necessary updates to this documentation guide based on new OpenClaw releases.

## Context

- New version to review up to: `{{NEW_VERSION}}`
- New release notes since last review: `.changelog-diff.md`

## Instructions

1. Read `.changelog-diff.md` — these are new OpenClaw release notes since the last reviewed version.
2. Read `CLAUDE.md` for guide structure and content descriptions.
3. For each release entry, determine if it affects any documented content (see criteria below).
4. For entries that affect the guide, spot-check the relevant doc files to understand current content, then make the necessary edits directly. Only edit files under `content/docs/`, `examples/`, `scripts/`, `.claude/commands/`, or `.guide-version` — do not touch `.github/`, `extensions/`, `CLAUDE.md`, or any other infrastructure/config files.
5. Update `.guide-version` to `{{NEW_VERSION}}` (always, whether or not content changes were made).
6. Always update these version references to `{{NEW_VERSION}}` as mechanical housekeeping (regardless of content changes):
   - `content/docs/_index.md` — the "last reviewed against **OpenClaw X.Y.Z**" callout
   - `content/docs/hardened-multi-agent.md` — the "OpenClaw X.Y.Z+ recommended (guide baseline version)" prerequisite line
   - If the release includes security fixes: add a new `- [ ] Version ≥ {{NEW_VERSION}} (…)` checklist item to `.claude/commands/security-review.md` under "Version & Known Vulnerabilities", describing the relevant security changes in ≤ 10 words

## What affects the guide

- Config option changes (new, renamed, removed, changed defaults)
- CLI command/flag changes (new, renamed, removed)
- Breaking changes that invalidate documented procedures
- New features the guide should cover (channels, plugins, deployment, security)
- Security-related changes (affects Phase 3, Phase 6, or security audit example)
- Plugin/extension API changes (affects extensions/ docs or Phase 5)
- Deployment or service management changes (affects Phase 6, Phase 7, scripts/)
- Sandbox image changes — if `Dockerfile.sandbox` base image or packages changed, update `scripts/custom-sandbox/Dockerfile` to match
- Memory or session behavior changes (affects Phase 2, sessions doc)

## What to ignore

- IDE-specific changes (`[VSCode]`, `[IDE]`, `[JetBrains]`)
- Windows-specific changes (`Windows:`)
- Internal performance improvements with no user-facing config/behavior change
- Bug fixes for issues not mentioned in the guide
- UI/UX tweaks to the Claude Code terminal interface

## Output

Return JSON matching the provided schema:

- `needs_update`: true if any guide content files were changed (not counting `.guide-version`)
- `summary`: markdown string — if `needs_update` is true, describe what was changed and why (with affected file paths); if false, a 1-2 sentence summary of what was in the releases
