#!/usr/bin/env python3
"""
workiq_triage.py
----------------
Pulls Rebecca's daily brief from WorkIQ and outputs a markdown summary
to stdout (or a file). Uses the WorkIQ CLI (`workiq ask -q "..."`) to
query live M365 data: today's meetings, unread emails, Teams mentions,
and pending action items.

Usage:
    python scripts/workiq_triage.py
    python scripts/workiq_triage.py --output brief.md
    python scripts/workiq_triage.py --section meetings
    python scripts/workiq_triage.py --dry-run

Requirements:
    - WorkIQ CLI installed: npm install -g @microsoft/workiq
    - WorkIQ authenticated:  workiq login
    - Python 3.8+, no external dependencies (stdlib only)
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

USER = "Rebecca North"

QUERIES = {
    "meetings": (
        f"What meetings does {USER} have today? "
        "List each meeting's title, start time, end time, organizer name, "
        "and attendee count. Sort by start time ascending."
    ),
    "emails": (
        f"What unread emails has {USER} received in the last 16 hours? "
        "List sender name, subject line, received time, and whether the email "
        "is marked important or high priority. Sort by received time descending."
    ),
    "mentions": (
        f"Are there any Microsoft Teams messages or chats that mention {USER} "
        "in the last 16 hours? For each, give the sender name, the channel or "
        "chat name, and a one-sentence summary of what they said."
    ),
    "actions": (
        f"Are there any pending approvals, flagged tasks, or explicit action "
        f"items assigned to {USER} that are due today or overdue? "
        "List item, requester, and due date."
    ),
}

WORKIQ_CLI = "workiq"  # assumes `workiq` is on PATH after npm install -g


# ---------------------------------------------------------------------------
# WorkIQ runner
# ---------------------------------------------------------------------------

def run_workiq_query(query: str, dry_run: bool = False) -> str:
    """
    Run a single WorkIQ CLI query and return the response text.
    Returns an error string (not raises) so the brief can still render
    with a graceful fallback message in each section.
    """
    if dry_run:
        return f"[DRY RUN — would query: {query[:80]}...]"

    cmd = [WORKIQ_CLI, "ask", "-q", query, "--format", "text"]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return (
            "ERROR: WorkIQ CLI not found. "
            "Install with: npm install -g @microsoft/workiq"
        )
    except subprocess.TimeoutExpired:
        return "ERROR: WorkIQ query timed out after 30 seconds."
    except Exception as exc:
        return f"ERROR: Unexpected error running WorkIQ: {exc}"

    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "not logged in" in stderr.lower() or "auth" in stderr.lower():
            return "ERROR: WorkIQ authentication required. Run: workiq login"
        return f"ERROR: WorkIQ returned exit code {result.returncode}. {stderr}"

    return result.stdout.strip() or "(no results returned)"


# ---------------------------------------------------------------------------
# Section formatters
# ---------------------------------------------------------------------------

def section(title: str, icon: str, content: str, fallback: str) -> str:
    """Render a single brief section."""
    if content.startswith("ERROR:"):
        body = f"> ⚠️ {content}"
    elif not content or content == "(no results returned)":
        body = f"_{fallback}_"
    else:
        # Indent raw WorkIQ output as a blockquote so it reads as sourced data
        body = "\n".join(f"{line}" for line in content.splitlines())

    return f"### {icon} {title}\n{body}\n"


# ---------------------------------------------------------------------------
# Focus heuristic
# ---------------------------------------------------------------------------

def build_focus(meetings_raw: str, emails_raw: str) -> str:
    """
    Naive heuristic: scan meeting and email text for high-signal keywords
    and produce 3 suggested focus items. No AI — pure string matching.
    This is intentionally conservative; real prioritization comes from context.
    """
    PRIORITY_KEYWORDS = [
        "board", "exec", "ceo", "cto", "cmo",
        "decision", "approval", "approve", "sign off",
        "deadline", "due today", "overdue",
        "launch", "ship", "release",
        "urgent", "asap", "critical", "blocker",
        "review", "feedback needed",
        "revenue", "metric", "kpi",
    ]

    combined = f"{meetings_raw}\n{emails_raw}".lower()
    hits = [kw for kw in PRIORITY_KEYWORDS if kw in combined]

    if not hits:
        return (
            "- No high-signal keywords detected in meetings or email subjects.\n"
            "- Review calendar for meetings where you are presenting or deciding.\n"
            "- Check inbox for any threads with 3+ unread replies."
        )

    # Deduplicate while preserving order
    seen: set = set()
    unique_hits = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            unique_hits.append(h)

    focus_lines = []
    label_map = {
        "board": "Board-level item detected — confirm your prep is complete.",
        "exec": "Exec stakeholder in the loop — keep comms tight and BLUF.",
        "decision": "A decision is expected today — know your position before the meeting.",
        "approval": "Approval needed — identify the decision-maker and have your ask ready.",
        "deadline": "Deadline pressure today — triage time-sensitive items first.",
        "due today": "Item due today — confirm delivery or flag the delay early.",
        "overdue": "Overdue item detected — address or escalate before EOD.",
        "launch": "Launch activity — confirm status and any blockers with the team.",
        "ship": "Shipping signal — verify release criteria and comms plan.",
        "urgent": "Urgent flag in comms — respond within 2 hours.",
        "revenue": "Revenue-impacting item — prioritize accordingly.",
        "blocker": "Blocker mentioned — own the unblock or escalate today.",
    }

    for hit in unique_hits[:3]:
        msg = label_map.get(hit, f"Keyword '{hit}' flagged — review relevant items.")
        focus_lines.append(f"- {msg}")

    # Pad to 3 items if fewer keywords found
    defaults = [
        "- Clear your inbox of threads requiring a decision or reply.",
        "- Confirm tomorrow's meeting prep if any high-stakes calls are on deck.",
        "- Send any EOD status updates before 5 PM ET.",
    ]
    while len(focus_lines) < 3:
        focus_lines.append(defaults[len(focus_lines)])

    return "\n".join(focus_lines[:3])


# ---------------------------------------------------------------------------
# Main brief builder
# ---------------------------------------------------------------------------

def build_brief(sections: list[str], dry_run: bool) -> str:
    now_utc = datetime.now(timezone.utc)
    # Display date in Eastern time label (approximate — no tzdata dependency)
    display_date = now_utc.strftime("%A, %B %-d, %Y")

    run_all = not sections or sections == ["all"]

    results: dict[str, str] = {}
    query_targets = [s for s in QUERIES if run_all or s in sections]

    for key in query_targets:
        print(f"  Querying WorkIQ: {key}...", file=sys.stderr)
        results[key] = run_workiq_query(QUERIES[key], dry_run=dry_run)

    # Build each section
    brief_parts = [
        f"# Morning Brief — {display_date}",
        f"_Generated {now_utc.strftime('%H:%MZ')} · Source: WorkIQ (live M365)_",
        "",
    ]

    if run_all or "meetings" in sections:
        brief_parts.append(section(
            "Today's Meetings",
            "🗓",
            results.get("meetings", ""),
            "No meetings found on calendar today.",
        ))

    if run_all or "emails" in sections:
        brief_parts.append(section(
            "Inbox Triage  _(last 16 hours)_",
            "📧",
            results.get("emails", ""),
            "No unread emails in the last 16 hours.",
        ))

    if run_all or "mentions" in sections:
        brief_parts.append(section(
            "Teams Mentions  _(last 16 hours)_",
            "💬",
            results.get("mentions", ""),
            "No Teams mentions found in the last 16 hours.",
        ))

    if run_all or "actions" in sections:
        brief_parts.append(section(
            "Pending Actions",
            "⚑",
            results.get("actions", ""),
            "No pending action items or approvals found.",
        ))

    # Focus heuristic (only when running full brief)
    if run_all:
        focus = build_focus(
            results.get("meetings", ""),
            results.get("emails", ""),
        )
        brief_parts.append(f"### 🎯 Top 3 Focus Suggestions\n{focus}\n")

    brief_parts.append("---")
    brief_parts.append(
        "_Chief of Staff · WorkIQ read-only · "
        "Never fabricated — empty sections mean no data was found._"
    )

    return "\n".join(brief_parts)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pull Rebecca's daily brief from WorkIQ and output markdown.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/workiq_triage.py                        # full brief to stdout
  python scripts/workiq_triage.py --output brief.md      # write to file
  python scripts/workiq_triage.py --section meetings     # meetings only
  python scripts/workiq_triage.py --section emails mentions
  python scripts/workiq_triage.py --dry-run              # test without WorkIQ
        """,
    )
    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help="Write brief to this file instead of stdout.",
    )
    parser.add_argument(
        "--section", "-s",
        metavar="SECTION",
        nargs="+",
        choices=["meetings", "emails", "mentions", "actions", "all"],
        default=["all"],
        help="Which sections to include (default: all).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip WorkIQ calls; output template with placeholder text.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_out",
        help="Output raw WorkIQ responses as JSON (useful for debugging).",
    )

    args = parser.parse_args()

    print("Chief of Staff — WorkIQ Triage", file=sys.stderr)
    print(f"Sections: {args.section}", file=sys.stderr)
    if args.dry_run:
        print("DRY RUN — no WorkIQ calls will be made.", file=sys.stderr)
    print("", file=sys.stderr)

    if args.json_out:
        # Raw debug mode: dump all query responses as JSON
        raw: dict[str, str] = {}
        for key, query in QUERIES.items():
            if "all" in args.section or key in args.section:
                print(f"  Querying: {key}...", file=sys.stderr)
                raw[key] = run_workiq_query(query, dry_run=args.dry_run)
        output = json.dumps(raw, indent=2)
    else:
        output = build_brief(args.section, dry_run=args.dry_run)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"\nBrief written to: {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
