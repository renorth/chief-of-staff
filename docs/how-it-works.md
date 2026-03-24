# How It Works

Internal reference for the Chief of Staff system.
Audience: Rebecca (and anyone she onboards to this setup).

---

## Overview

When you type a prompt in Claude Code, it triggers a chain that reaches all
the way into Microsoft 365 and back — without you opening Outlook, Teams, or
a browser. This doc explains every hop in that chain.

---

## Data Flow — Step by Step

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1        Step 2           Step 3           Step 4        Step 5   │
│                                                                          │
│  You type  →  Claude Code  →  WorkIQ MCP  →  M365 Copilot  →  Graph    │
│  a prompt     reads             translates      orchestrates    API      │
│               CLAUDE.md         NL → query      the query      query    │
│                                                                          │
│                          ◄─────────────────────────────────────────────  │
│  Step 9        Step 8           Step 7           Step 6                 │
│                                                                          │
│  You read  ←  Claude           Claude           Raw JSON                │
│  formatted    formats           receives         returned                │
│  brief        the results       results          from Graph              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Detailed ASCII diagram

```
Your terminal (any device — Windows or Mac)
│
│  "What needs my attention today?"
│
▼
┌─────────────────────────────────────────────┐
│  Claude Code                                 │
│                                              │
│  1. Loads CLAUDE.md on startup               │
│     • Your role (Growth PM)                  │
│     • Output rules (exec-ready bullets)      │
│     • Safety rules (never fabricate)         │
│                                              │
│  2. Matches prompt → agents/triage.md        │
│     Reads the agent instructions             │
│                                              │
│  3. Decides to call WorkIQ MCP tool          │
│     Constructs natural-language query        │
└────────────────────┬────────────────────────┘
                     │  MCP tool call
                     │  query: "What meetings does
                     │   Rebecca North have today?"
                     ▼
┌─────────────────────────────────────────────┐
│  WorkIQ MCP Server  (local process)          │
│  command: workiq mcp                         │
│                                              │
│  4. Receives NL query from Claude            │
│  5. Translates it into a structured          │
│     Microsoft 365 Copilot API request        │
│     (search scope, entity types,             │
│      date filters, user context)             │
└────────────────────┬────────────────────────┘
                     │  HTTPS
                     │  Copilot API request
                     ▼
┌─────────────────────────────────────────────┐
│  Microsoft 365 Copilot  (cloud)              │
│                                              │
│  6. Authenticates the request                │
│     (your cached token from workiq login)    │
│  7. Determines which Graph endpoints         │
│     satisfy the query:                       │
│     • Meetings → /me/calendarView            │
│     • Email    → /me/messages                │
│     • Teams    → /me/chats, /teams/.../msgs  │
│     • Docs     → /search/query               │
└────────────────────┬────────────────────────┘
                     │  HTTPS
                     │  Microsoft Graph API calls
                     ▼
┌─────────────────────────────────────────────┐
│  Microsoft Graph  (cloud)                    │
│                                              │
│  8. Reads your M365 data — read-only         │
│  9. Returns structured JSON:                 │
│     events[], messages[], chats[], etc.      │
└────────────────────┬────────────────────────┘
                     │  JSON response
                     ▼
┌─────────────────────────────────────────────┐
│  WorkIQ MCP Server                           │
│                                              │
│  10. Deserializes Graph JSON                 │
│  11. Converts to plain-text MCP response     │
│      (human-readable, structured)            │
└────────────────────┬────────────────────────┘
                     │  MCP tool result
                     ▼
┌─────────────────────────────────────────────┐
│  Claude Code                                 │
│                                              │
│  12. Receives the WorkIQ results             │
│  13. Applies CLAUDE.md formatting rules:     │
│      • Exec-ready bullets                    │
│      • Bold names/dates                      │
│      • ## section headers                    │
│      • Critical path at the end              │
│  14. Renders final brief in terminal         │
└────────────────────┬────────────────────────┘
                     │
                     ▼
          You read your morning brief.
```

---

## What Touches What — Permissions Summary

| Layer | What it reads | Auth method |
|---|---|---|
| WorkIQ MCP | Calls M365 Copilot API | Cached OAuth token (`workiq login`) |
| M365 Copilot | Orchestrates Graph calls | Delegates to your M365 identity |
| Microsoft Graph | Your calendar, inbox, Teams, docs | Your M365 account permissions |
| Claude Code | WorkIQ results only | No direct M365 access |
| Power Automate | Calendar + email + Teams (separate flow) | Connector auth (set at flow build time) |

Claude never has direct access to Microsoft Graph. It only sees what WorkIQ
returns. WorkIQ is read-only — it cannot send emails, post messages, or
modify calendar events.

---

## Troubleshooting

### `WorkIQ CLI not found`

```
ERROR: WorkIQ CLI not found.
Install with: npm install -g @microsoft/workiq
```

**Cause:** `workiq` is not on your PATH.
**Fix:**
```bash
npm install -g @microsoft/workiq
# If npm is not installed:
#   Windows: https://nodejs.org  (install Node 18+)
#   Mac:     brew install node
```

Verify: `workiq --version`

---

### `WorkIQ authentication required`

```
ERROR: WorkIQ authentication required. Run: workiq login
```

**Cause:** Your M365 OAuth token is missing or expired. Tokens typically
expire after 1 hour of inactivity or when your M365 session is revoked
(password change, conditional access policy, device compliance failure).

**Fix:**
```bash
workiq login
# Opens a browser window → sign in with your Microsoft work account
# Token is cached locally after successful sign-in
```

If `workiq login` opens a browser but then hangs or shows an error, try:
```bash
workiq login --tenant your-tenant-id
```
Your tenant ID is visible in the Azure Portal under
**Azure Active Directory → Overview → Tenant ID**.

---

### `WorkIQ query timed out`

```
ERROR: WorkIQ query timed out after 30 seconds.
```

**Cause:** The M365 Copilot API or Microsoft Graph is slow to respond.
Usually transient (Microsoft service latency, large mailbox indexing).

**Fix:**
1. Wait 60 seconds and retry.
2. Run a simpler query to confirm WorkIQ is responsive:
   ```bash
   workiq ask -q "What is my name?"
   ```
3. Check Microsoft 365 service health:
   `https://admin.microsoft.com` → **Health → Service health**
4. If the problem persists, re-authenticate: `workiq login`

---

### `WorkIQ returned exit code 1` (generic)

**Cause:** Could be a network issue, M365 Copilot license missing,
or the WorkIQ CLI version is outdated.

**Fix:**
```bash
# Update WorkIQ
npm update -g @microsoft/workiq

# Confirm your M365 account has Copilot licensed
workiq ask -q "What is today's date?"
# If this fails, Copilot may not be enabled on your account —
# contact your M365 admin.
```

---

### MCP server not appearing in Claude Code

**Symptom:** Claude says it cannot call WorkIQ; no MCP tool calls are made.

**Fix — project level:**
Confirm `.claude/mcp_servers.json` exists in the `chief-of-staff` directory
and contains:
```json
{
  "workiq": {
    "command": "workiq",
    "args": ["mcp"]
  }
}
```
Then restart Claude Code: `Ctrl+C` → `claude .`

**Fix — global level:**
Check `~/.claude/settings.json` contains the `mcpServers.workiq` block
(see README for the full snippet). Restart Claude Code after saving.

**Verify the MCP server is loaded:**
Type `/mcp` in Claude Code — WorkIQ should appear in the list with a
green status indicator.

---

### Claude formats the brief but data looks wrong or stale

**Symptom:** Meetings or emails shown are from yesterday, or the wrong person's
data appears.

**Cause:** WorkIQ returned a cached or incorrect result, or the query was
interpreted for the wrong user.

**Fix:**
```bash
# Run the triage script directly to see raw WorkIQ output
python scripts/workiq_triage.py --json

# Re-authenticate to refresh your identity context
workiq login

# Run a targeted query manually
workiq ask -q "What meetings does Rebecca North have today?"
```

If the wrong user's data appears, your WorkIQ session may be associated with
a different M365 account. Log out and back in:
```bash
workiq logout
workiq login
```

---

### Power Automate flows not posting to Teams

This is separate from the Claude/WorkIQ path. See the Power Automate flow
run history for errors. Common causes:

| Error in flow | Fix |
|---|---|
| `Connection expired` on Outlook or Teams connector | Re-authenticate the connection in Power Automate → Data → Connections |
| `Chat not found` on Teams post action | The 1:1 chat ID has changed — re-run the "List chats" action to find the current ID |
| RSS feed returns 0 items | Temporarily widen the `since` window to `-7` days to test; check if the feed URL is still valid |
| Flow disabled | Power Automate → My flows → enable the flow |

---

## Re-authentication Quick Reference

| Scenario | Command |
|---|---|
| First-time setup | `workiq login` |
| Token expired (daily) | `workiq login` |
| Wrong account signed in | `workiq logout` then `workiq login` |
| Behind a corporate proxy | `workiq login --tenant <tenant-id>` |
| Verify current identity | `workiq ask -q "Who am I?"` |
| Check WorkIQ version | `workiq --version` |
| Update to latest | `npm update -g @microsoft/workiq` |
