---
title: "Knowledge Vault"
description: "Persistent knowledge base with semantic search and cron-driven autonomous research."
weight: 10
---

A structured knowledge base in your workspace that your agent can search semantically, research autonomously via cron jobs, and update over time. Save product comparisons, service evaluations, and topic deep-dives as markdown — then recall them from any channel with natural language queries.

```
You (any channel) → Main Agent → sessions_send → Search Agent (web)
                         │                             │
                         ▼                             ▼
                   knowledge/           Brave/Perplexity results
                   ├── products/
                   ├── services/
                   └── topics/
                         │
                   memory_search ← hybrid index (vector 70% + keyword 30%)
```

No new agents or plugins needed — only config additions and AGENTS.md instructions on top of Phases 1–5.

{{< callout type="info" >}}
**Prerequisites:** [Phases 1–5]({{< relref "../phases" >}}) configured, search agent with `web_search` + `web_fetch` ([Phase 5]({{< relref "../phases/phase-5-web-search" >}})), Brave or Perplexity API key.
{{< /callout >}}

---

## Step 1: Scaffold directories

Create the vault structure in your workspace:

```bash
WORKSPACE="${HOME}/.openclaw/workspaces/main"

mkdir -p "${WORKSPACE}/knowledge/products"
mkdir -p "${WORKSPACE}/knowledge/services"
mkdir -p "${WORKSPACE}/knowledge/topics"
```

Create the research queue (intake mechanism for cron-driven research):

```bash
cat > "${WORKSPACE}/knowledge/research-queue.md" << 'EOF'
# Research Queue

Items are processed by the weekly research cron job (Monday 8am).
Add topics via chat: "add to research queue: [topic]"

## Pending

## In Progress

## Completed

EOF
```

Create the research log (append-only index of all completed research):

```bash
cat > "${WORKSPACE}/knowledge/research-log.md" << 'EOF'
# Research Log

| Date | Topic | Summary | File |
|------|-------|---------|------|

EOF
```

## Step 2: Configure memory search

Add `extraPaths` to the `memorySearch` block in your `openclaw.json` so the vault files are included in the hybrid search index:

```json5
// agents.defaults.memorySearch — add this key:
extraPaths: [
  "/Users/openclaw/.openclaw/workspaces/main/knowledge/"
]
```

Paths are absolute. Adjust to match your main agent's workspace path. If you're using the [recommended config]({{< relref "../examples/config" >}}), the `memorySearch` block already exists — just add the `extraPaths` array.

> **Tip:** If your vault grows beyond ~50 entries, enable MMR re-ranking (`query.hybrid.mmr.enabled: true`) to deduplicate similar results. Many vault files follow the same structure, which can cause near-duplicate matches. See [Phase 2 — Search Quality Tuning]({{< relref "../phases/phase-2-memory" >}}#search-quality-tuning).

## Step 3: Add AGENTS.md instructions

Paste the following into your main agent's `AGENTS.md` (`~/.openclaw/workspaces/main/AGENTS.md`). This teaches the agent the vault workflow — directory conventions, writing format, staleness tracking, and research queue processing.

{{< details title="Knowledge Vault — AGENTS.md snippet" closed="true" >}}

```markdown
## Knowledge Vault

You maintain a persistent knowledge base in `knowledge/`. This is your long-term
research repository — structured markdown files that are semantically searchable
via `memory_search`.

### Directory Structure

- `knowledge/products/` — product comparisons, specs, reviews, pricing
- `knowledge/services/` — service evaluations, pricing models, experiences
- `knowledge/topics/` — deep dives on subjects (technology, science, hobbies, etc.)
- `knowledge/research-log.md` — append-only log of all research sessions

### Writing to the Vault

Before creating a new file, always `memory_search` first — update existing files
rather than creating duplicates.

Every vault entry must include:
- **Date researched** (YYYY-MM-DD)
- **Sources** (URLs, with brief description of each)
- **Key findings** (bullet points, concise)
- **Your assessment** (1-2 sentences: what matters, what to watch)

Format:

## [Topic/Product Name]
*Last researched: YYYY-MM-DD*

### Key Findings
- ...

### Sources
- [Title](URL) — brief note

### Assessment
...

When updating an existing file, add a new dated section at the top. Don't delete
previous research — it shows how things changed over time.

### Staleness Tracking

Mark outdated info with `<!-- STALE: YYYY-MM-DD -->` if you discover findings
have changed. During heartbeat or research cycles, refresh stale entries that are
older than 30 days.

### Research Queue

`knowledge/research-queue.md` is the intake mechanism. Users add topics via chat
("add to research queue: ..."). Cron jobs process pending items.

Format:

## Pending
- [ ] Topic description (added YYYY-MM-DD)

## In Progress
- [ ] Topic description (started YYYY-MM-DD)

## Completed
- [x] Topic description (completed YYYY-MM-DD → products/filename.md)

### Research Workflow

When researching a topic (ad-hoc or from the queue):
1. Move item to "In Progress" in research-queue.md
2. Delegate web searches to the search agent via `sessions_send`
3. For detailed page analysis, use search agent's `web_fetch`
4. Synthesize findings — don't just dump raw search results
5. Write structured findings to the appropriate `knowledge/` subdirectory
6. Append a one-line entry to `knowledge/research-log.md`
7. Move item to "Completed" in research-queue.md with a pointer to the output file
8. Notify the user with a brief summary (via the active channel or as configured)

### Research Log

Always append to `knowledge/research-log.md` after completing any research:

| YYYY-MM-DD | topic-slug | Short description | knowledge/path/to/file.md |

### Rules
- Never store API keys, tokens, or credentials in vault files
- Cite sources — no unsourced claims
- Be opinionated in assessments — "this is the best option because..." is more useful than neutral summaries
- One file per product/service/topic — keep files focused
- For lengthy research (many searches), use `sessions_spawn` to run in the background without blocking the conversation. For quick lookups, `sessions_send` is simpler
```

{{< /details >}}

## Step 4: Add cron jobs

Add the following jobs to the `cron.jobs` array in your `openclaw.json`. All jobs use `sessionTarget: "isolated"` so they don't clutter your main chat history.

{{< callout type="warning" >}}
Change `channel: "whatsapp"` to your actual channel name (`"signal"`, `"googlechat"`, etc.) in each job's `delivery` block.
{{< /callout >}}

### Research queue processing (weekly)

Picks up topics from `research-queue.md` every Monday and researches them autonomously:

```json5
{
  jobId: "knowledge-vault-research-queue",
  agentId: "main",
  schedule: { kind: "cron", expr: "0 8 * * 1" },  // Monday 8am
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Process the research queue. Check knowledge/research-queue.md for pending topics. For each pending item: research it thoroughly using web search (delegate to search agent), write findings to the appropriate knowledge/ subdirectory, update research-log.md, and mark the item completed in the queue. Send me a summary of what you researched and key findings."
  },
  delivery: { mode: "announce", channel: "whatsapp" }
}
```

### Freshness check (weekly)

Reviews vault entries for staleness and refreshes the 3 most outdated (>30 days old):

```json5
{
  jobId: "knowledge-vault-freshness",
  agentId: "main",
  schedule: { kind: "cron", expr: "0 9 * * 4" },  // Thursday 9am
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Run a knowledge vault freshness check. Scan files in knowledge/ for STALE markers and for entries where 'Last researched' is older than 30 days. Pick the 3 most outdated entries and refresh them: search the web for current information, update the files with new findings (keep the old research for history), and remove STALE markers. Send me a summary of what was refreshed and what changed."
  },
  delivery: { mode: "announce", channel: "whatsapp" }
}
```

### Topic monitor (optional)

Searches for breaking news on topics you're tracking. Edit the message with your actual topics:

```json5
{
  jobId: "knowledge-vault-topic-monitor",
  agentId: "main",
  schedule: { kind: "cron", expr: "0 7 * * 3,6" },  // Wed + Sat 7am
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Check for notable developments on my tracked topics. Search the web for recent news (last 7 days) on: [EDIT: list your topics here, e.g. 'home automation Matter standard', 'solar panel inverter technology', 'OpenClaw releases']. Only report if there's something genuinely new — no updates = no message. If you find something notable, update the relevant knowledge/ file and send me a brief alert with what changed and why it matters."
  },
  delivery: { mode: "announce", channel: "whatsapp" }
}
```

### Price tracker (optional)

Checks pricing for products tagged `[TRACK-PRICE]` in vault files. Alerts on drops >15%:

```json5
{
  jobId: "knowledge-vault-price-track",
  agentId: "main",
  schedule: { kind: "cron", expr: "0 10 * * 3" },  // Wednesday 10am
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Check prices for products tagged [TRACK-PRICE] in knowledge/products/. For each, search the web for current pricing, compare to the price recorded in the file, and update the file. Only message me if a price dropped more than 15% or if a product is newly on sale. Include the old price, new price, and where to buy."
  },
  delivery: { mode: "announce", channel: "whatsapp" }
}
```

### Cron schedule summary

| Job | Schedule | What it does |
|-----|----------|--------------|
| Research queue | Monday 8am | Processes all pending topics in `research-queue.md` |
| Freshness check | Thursday 9am | Refreshes the 3 most outdated vault entries |
| Topic monitor | Wed + Sat 7am | Searches for breaking news on tracked topics |
| Price tracker | Wednesday 10am | Checks `[TRACK-PRICE]` tagged products for price drops |

## Step 5: Rebuild index and restart

```bash
openclaw memory index --agent main
# then restart your gateway
```

The main agent's memory index needs rebuilding so the `knowledge/` directory is included in semantic search results. If `extraPaths` is in `agents.defaults` (shared by all agents), run `openclaw memory index` (no `--agent` flag) to rebuild all indices.

---

## Usage

**Ad-hoc research** — message from any channel:
> "Research the top home automation hubs in 2026 and save to the knowledge vault"

**Queue a topic** — for the Monday cron job to pick up:
> "Add to research queue: best NAS devices for home media under $500"

**Search the vault** — recall past research:
> "What do I know about solar panel inverters?"

**Price tracking** — tag products with `[TRACK-PRICE]` in vault files. The Wednesday cron checks pricing and alerts on drops >15%.

---

## Example vault entry

A completed research file in `knowledge/products/home-automation-hubs.md`:

```markdown
# Home Automation Hubs

## 2026-02-15 — Comprehensive Comparison

### Key Findings

- **Home Assistant Yellow** — Best for privacy-first users. Local-only by default,
  Zigbee/Thread built-in, massive integration library (2,700+). ~$150 for the kit.
  Requires comfort with YAML and occasional terminal work.
- **Apple HomePod (with Home Hub)** — Best ecosystem lock-in if already all-Apple.
  Matter support added. Limited to HomeKit-compatible devices without workarounds.
- **Samsung SmartThings Station** — Good middle ground. Matter/Thread support,
  works across ecosystems. Cloud-dependent for most automations. ~$60.
- **Hubitat Elevation** — Local processing like HA but with a GUI-first approach.
  Smaller community, fewer integrations. Good for Zigbee/Z-Wave heavy setups. ~$150.

### Pricing [TRACK-PRICE]

| Hub | Price (2026-02-15) | Where |
|-----|-------------------|-------|
| Home Assistant Yellow (CM4 4GB kit) | $149 | home-assistant.io |
| SmartThings Station | $59 | samsung.com |
| Hubitat Elevation C-8 Pro | $179 | hubitat.com |

### Sources

- [Home Assistant Yellow](https://www.home-assistant.io/yellow/) — official product page
- [SmartThings Matter support](https://www.samsung.com/smartthings/) — official
- [Hubitat C-8 Pro review](https://example.com/hubitat-review) — independent review

### Assessment

Home Assistant Yellow is the clear winner for anyone willing to invest a weekend
in setup. The local-first architecture aligns with OpenClaw's self-hosted
philosophy — you can integrate HA directly via its API and control everything
from chat. SmartThings is the pragmatic choice for non-technical households.
```

Corresponding research log entry (append to `knowledge/research-log.md`):

```
| 2026-02-15 | home-automation-hubs | Compared HA Yellow, SmartThings, HomePod, Hubitat | knowledge/products/home-automation-hubs.md |
```
