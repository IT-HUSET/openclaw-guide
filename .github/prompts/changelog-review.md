Review and implement any necessary updates to this documentation guide based on new OpenClaw releases.

## Context

- New version to review up to: `{{NEW_VERSION}}`
- New release notes since last review: `.changelog-diff.md`

## Instructions

1. Read `.changelog-diff.md` — these are new OpenClaw release notes since the last reviewed version.
2. Read `CLAUDE.md` for guide structure and content descriptions.
3. For each release entry, determine if it affects any documented content (see criteria below).
4. For entries that affect the guide, spot-check the relevant doc files to understand current content, then make the necessary edits directly. Only edit files under `content/docs/`, `examples/`, `scripts/`, `extensions/`, `.claude/commands/`, or `.guide-version` — do not touch `.github/`, `CLAUDE.md`, or any other infrastructure/config files.
5. If you edited any extension source or test file, run `npm test` in that extension's directory to verify the tests still pass. Fix any failures before proceeding.
6. Update `.guide-version` to `{{NEW_VERSION}}` (always, whether or not content changes were made).
7. Always update these version references to `{{NEW_VERSION}}` as mechanical housekeeping (regardless of content changes):
   - `content/docs/_index.md` — the "last reviewed against **OpenClaw X.Y.Z**" callout
   - `content/docs/hardened-multi-agent.md` — the "OpenClaw X.Y.Z+ recommended (guide baseline version)" prerequisite line
   - If the release includes security fixes: add a new `- [ ] Version ≥ {{NEW_VERSION}} (…)` checklist item to `.claude/commands/security-review.md` under "Version & Known Vulnerabilities", describing the relevant security changes in ≤ 10 words

## Pass 2: Improvement scan

After completing all changelog-driven updates above, do a broader scan of the repository:

8. Check "Pending Cleanup" in `CLAUDE.md` — if any version-gated TODOs reference issues resolved in `{{NEW_VERSION}}`, implement the cleanup.
9. Scan for improvements caused or revealed by the version update, in priority order:
   - **Correctness:** outdated config snippets, broken cross-references, dead links between docs
   - **Test coverage:** missing test cases for edge cases in extensions
   - **Consistency:** config examples that contradict each other or the docs
   - **Completeness:** documented features missing from examples
   - **Feature Atlas:** known-issues table entries that reference issues resolved in `{{NEW_VERSION}}` — remove or mark as fixed; new features documented in phases but missing from the atlas

Keep these changes focused. Do NOT modify `.github/` or `CLAUDE.md`. Run `npm test` / `hugo --gc` to verify after edits.

Include any improvement findings in the `summary` output alongside changelog changes.

## What affects the guide

- Config option changes (new, renamed, removed, changed defaults)
- CLI command/flag changes (new, renamed, removed)
- Breaking changes that invalidate documented procedures
- New features the guide should cover (channels, plugins, deployment, security)
- Security-related changes (affects Phase 3, Phase 6, or security audit example)
- Plugin/extension API changes (affects extensions/ docs or Phase 5) — if the plugin API changed, also check and update extension source code in `extensions/` to match
- Deployment or service management changes (affects Phase 6, Phase 7, scripts/)
- Sandbox image changes — if `Dockerfile.sandbox` base image or packages changed, update `scripts/custom-sandbox/Dockerfile` to match
- Memory or session behavior changes (affects Phase 2, sessions doc)
- Feature additions or deprecations → update Feature Atlas (`content/docs/feature-atlas.md`): add/update rows in the relevant category table, set the "Since" column to `{{NEW_VERSION}}`. If the change adds a new feature category or significantly restructures existing ones, add a note to the PR description: `<!-- ATLAS_DIAGRAM_UPDATE: [describe change] -->` so the Excalidraw diagram can be updated manually

## What to ignore

- IDE-specific changes (`[VSCode]`, `[IDE]`, `[JetBrains]`)
- Windows-specific changes (`Windows:`)
- Internal performance improvements with no user-facing config/behavior change
- Bug fixes for issues not mentioned in the guide
- UI/UX tweaks to the Claude Code terminal interface

## Output

Return JSON matching the provided schema:

- `needs_update`: true if any guide content files were changed (not counting `.guide-version`)
- `summary`: if `needs_update` is true, a bullet list (one `- ` prefixed line per change) describing what was changed and why — these lines are inserted directly into `CHANGELOG.md`, so keep them concise and user-facing (no file paths). If false, a 1-2 sentence summary of what was in the releases
