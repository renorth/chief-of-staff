# Chief of Staff

Claude Code configured as an interactive Chief of Staff for Rebecca North (Growth PM).
Works on any device. Uses WorkIQ for live M365 reads; Power Automate for scheduled Teams push.

---

## File Tree

```
chief-of-staff/
├── CLAUDE.md                   ← Role definition, output rules, safety constraints
├── README.md
├── agents/
│   ├── triage.md               ← "What needs my attention today?"
│   ├── meeting_prep.md         ← "Prep me for my next meeting"
│   └── status_update.md        ← "Draft my weekly status update"
└── scripts/
    └── workiq_triage.py        ← Pull daily brief via WorkIQ CLI
```

---

## 5 Example Commands

Open this repo in Claude Code (`claude .` from `chief-of-staff/`), then:

```
# 1. Morning triage — what needs your attention right now
What needs my attention today?

# 2. Pre-meeting prep — auto-finds your next calendar event
Prep me for my next meeting

# 3. Weekly status update — reconstructs the week from M365 activity
Draft my weekly status update

# 4. Run the triage script directly (outputs markdown brief)
python scripts/workiq_triage.py

# 5. Quick email draft using live context
Draft a reply to the most urgent email in my inbox. Keep it under 5 sentences.
```

---

## Install WorkIQ CLI

WorkIQ queries your Microsoft 365 data (email, calendar, Teams, documents) using
natural language from the terminal.

```bash
# Install globally
npm install -g @microsoft/workiq

# Authenticate (opens browser for M365 sign-in)
workiq login

# Verify
workiq ask -q "What meetings do I have today?"
```

**Requirements:** Node.js 18+, an M365 account with appropriate read permissions.

---

## Configure WorkIQ as an MCP Server (for Claude Code)

Adding WorkIQ as an MCP server lets Claude call it as a tool automatically —
no manual CLI commands needed.

### Option A — Project-level (this repo only)

Create `.claude/mcp_servers.json` in this repo:

```json
{
  "workiq": {
    "command": "workiq",
    "args": ["mcp"],
    "description": "WorkIQ — read-only access to Rebecca's M365 data (email, calendar, Teams, docs)"
  }
}
```

Then in Claude Code:

```
/mcp
```

Select WorkIQ and confirm. Claude will now call WorkIQ as a tool when it needs M365 data.

### Option B — Global (all Claude Code projects on this device)

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "workiq": {
      "command": "workiq",
      "args": ["mcp"],
      "description": "WorkIQ M365 read access"
    }
  }
}
```

### Option C — Copilot CLI / VS Code (GitHub Copilot)

If you use Copilot CLI, WorkIQ can be registered as an MCP server via
VS Code settings (`settings.json`):

```json
{
  "github.copilot.chat.mcpServers": {
    "workiq": {
      "command": "workiq",
      "args": ["mcp"]
    }
  }
}
```

---

## Run the Triage Script

```bash
# Full daily brief to stdout
python scripts/workiq_triage.py

# Write to file
python scripts/workiq_triage.py --output brief.md

# Single section only
python scripts/workiq_triage.py --section meetings
python scripts/workiq_triage.py --section emails mentions

# Test without WorkIQ (dry run)
python scripts/workiq_triage.py --dry-run

# Debug: dump raw WorkIQ responses as JSON
python scripts/workiq_triage.py --json
```

---

## How It Works

```
You (any device)
     │
     ▼
Claude Code  ←──── CLAUDE.md (role + rules loaded automatically)
     │
     ├── agents/triage.md        ← loaded when you ask for triage
     ├── agents/meeting_prep.md  ← loaded when you ask for meeting prep
     └── agents/status_update.md ← loaded when you ask for status update
     │
     ▼
WorkIQ CLI / MCP  ──── READ ────►  Microsoft 365
(emails, calendar, Teams, docs)

Power Automate (separate)  ──── scheduled push ────► Teams 1:1 chat
```

**CLAUDE.md is always loaded** when Claude Code opens this directory.
It tells Claude who Rebecca is, how to format outputs, and the safety rules
(never fabricate; surface WorkIQ errors clearly).

---

## Safety & Data Rules

- WorkIQ has **read-only** access to M365. No emails or messages are sent via this repo.
- Claude will **never fabricate** meeting details, email content, or Teams messages.
  If WorkIQ is unavailable, it says so.
- Sensitive content (personnel, legal, financials) shared in context is treated as confidential.
- Power Automate handles all **write** operations (posting to Teams).
  This repo contains no write-capable credentials.
