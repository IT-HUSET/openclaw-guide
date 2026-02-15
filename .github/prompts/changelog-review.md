Review the OpenClaw changelog for entries that may require updates to this documentation guide.

## Instructions

1. Read `.changelog-diff.md` in the repo root — these are new changelog entries since the last reviewed version.
2. Read `CLAUDE.md` for guide structure and content descriptions.
3. For each changelog entry, determine if it affects any documented content.
4. When in doubt, spot-check the relevant doc files to confirm whether content is affected.

## What affects the guide

- Config option changes (new, renamed, removed, changed defaults)
- CLI command/flag changes (new, renamed, removed)
- Breaking changes that invalidate documented procedures
- New features the guide should cover (channels, plugins, deployment, security)
- Security-related changes (affects Phase 3, Phase 6, or security audit example)
- Plugin/extension API changes (affects extensions/ docs or Phase 5)
- Deployment or service management changes (affects Phase 6, Phase 7, scripts/)
- Memory or session behavior changes (affects Phase 2, sessions doc)

## What to ignore

- IDE-specific changes (`[VSCode]`, `[IDE]`, `[JetBrains]`)
- Windows-specific changes (`Windows:`)
- Internal performance improvements with no user-facing config/behavior change
- Bug fixes for issues not mentioned in the guide
- UI/UX tweaks to the Claude Code terminal interface

## Output

Return JSON matching the provided schema:

- `needs_update`: true if any changelog entry affects guide content
- `report`: markdown string — if `needs_update` is true, include:
  - **Affected guide sections** with file paths and what to check
  - **Changelog entries requiring attention** with impact description
  - **Priority** (high/medium/low) with brief justification
  If `needs_update` is false, a 1-2 sentence summary of what was in the changelog.
