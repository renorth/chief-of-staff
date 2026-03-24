#!/usr/bin/env python3
"""
sync_tasks.py
-------------
Pulls today's M365 data from WorkIQ, maps results to the three planner
categories (Must Do Today / Should Do Today / This Week), merges with any
manually-added tasks in tasks.json, then commits and pushes to GitHub so
the live planner URL reflects the latest data.

Usage:
    python scripts/sync_tasks.py
    python scripts/sync_tasks.py --dry-run        # no git push
    python scripts/sync_tasks.py --no-push        # write file, skip git
    python scripts/sync_tasks.py --clear-workiq   # remove old WorkIQ tasks first

Flow:
    WorkIQ CLI → raw M365 data → categorize → merge with manual tasks
    → write planner/data/tasks.json → git commit + push → GitHub Pages
    refreshes on next browser open
"""

import argparse
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone, date
from pathlib import Path


# ── Paths ──────────────────────────────────────────────────────────────────
REPO_ROOT  = Path(__file__).resolve().parent.parent
TASKS_FILE = REPO_ROOT / "planner" / "data" / "tasks.json"
WORKIQ_CLI = "workiq"

# ── WorkIQ query templates ─────────────────────────────────────────────────
QUERIES = {
    "meetings_today": (
        "What meetings does Rebecca North have today? "
        "For each, give: title, start time, end time, organizer name. "
        "Return as a numbered list."
    ),
    "meetings_week": (
        "What meetings does Rebecca North have in the next 4 days (excluding today)? "
        "For each, give: title, date, start time. Return as a numbered list."
    ),
    "emails_urgent": (
        "What unread emails marked important or high priority has Rebecca North "
        "received in the last 18 hours? "
        "For each, give: sender name, subject. Return as a numbered list."
    ),
    "emails_unread": (
        "What unread emails has Rebecca North received in the last 18 hours "
        "that are NOT marked high priority? "
        "For each, give: sender name, subject. Return as a numbered list, max 5."
    ),
    "actions": (
        "Are there explicit action items, approval requests, or tasks assigned to "
        "Rebecca North that are due today or overdue? "
        "For each, give: description, requester, due date. Return as a numbered list."
    ),
}


# ── WorkIQ runner ──────────────────────────────────────────────────────────

def run_query(query: str, dry_run: bool = False) -> str:
    if dry_run:
        return f"[DRY RUN] {query[:60]}…"

    try:
        result = subprocess.run(
            [WORKIQ_CLI, "ask", "-q", query, "--format", "text"],
            capture_output=True, text=True, timeout=30,
        )
    except FileNotFoundError:
        print("ERROR: workiq not found. Run: npm install -g @microsoft/workiq", file=sys.stderr)
        return ""
    except subprocess.TimeoutExpired:
        print(f"WARNING: WorkIQ query timed out: {query[:60]}", file=sys.stderr)
        return ""

    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "auth" in stderr.lower() or "login" in stderr.lower():
            print("ERROR: Not authenticated. Run: workiq login", file=sys.stderr)
            sys.exit(1)
        print(f"WARNING: WorkIQ error ({result.returncode}): {stderr[:120]}", file=sys.stderr)
        return ""

    return result.stdout.strip()


# ── Categorisation ─────────────────────────────────────────────────────────

def parse_lines(raw: str) -> list[str]:
    """Extract non-empty lines, stripping leading list markers (1. 2. - •)."""
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading "1." / "- " / "• "
        for prefix in ("•", "-", "*"):
            if line.startswith(prefix):
                line = line[len(prefix):].strip()
                break
        # Strip leading number: "1. " or "1) "
        if len(line) > 2 and line[0].isdigit() and line[1] in ".)" :
            line = line[2:].strip()
        elif len(line) > 3 and line[:2].isdigit() and line[2] in ".)" :
            line = line[3:].strip()
        if line:
            lines.append(line)
    return lines


def make_task(title: str, category: str, source: str = "workiq",
              due_date: str | None = None, tag: str | None = None) -> dict:
    return {
        "id":        str(uuid.uuid5(uuid.NAMESPACE_DNS, f"workiq:{title}")),
        "title":     title,
        "category":  category,
        "tag":       tag,
        "source":    source,
        "dueDate":   due_date,
        "completed": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


# Keyword → tag mapping. Add patterns here as your M365 data becomes familiar.
TAG_RULES: list[tuple[list[str], str]] = [
    (["trial", "trials", "clinical", "study", "patient"], "trials"),
    (["office client", "client portal", "onboarding"],    "office_client"),
    (["checkout", "billing", "payment", "cart"],          "office_checkout"),
    (["personal", "pto", "vacation", "dentist", "dr."],   "personal"),
]

def infer_tag(title: str) -> str | None:
    lower = title.lower()
    for keywords, tag in TAG_RULES:
        if any(kw in lower for kw in keywords):
            return tag
    return None


def build_tasks(raw: dict, dry_run: bool) -> list[dict]:
    tasks: list[dict] = []
    today_str = date.today().isoformat()

    # Must Do Today: urgent emails + overdue/today action items
    for line in parse_lines(raw.get("emails_urgent", "")):
        title = f"Reply: {line}"
        tasks.append(make_task(title, "must_do_today", due_date=today_str, tag=infer_tag(title)))

    for line in parse_lines(raw.get("actions", "")):
        tasks.append(make_task(line, "must_do_today", due_date=today_str, tag=infer_tag(line)))

    # Should Do Today: today's meetings + standard unread emails
    for line in parse_lines(raw.get("meetings_today", "")):
        title = f"Meeting: {line}"
        tasks.append(make_task(title, "should_do_today", tag=infer_tag(title)))

    for line in parse_lines(raw.get("emails_unread", "")):
        title = f"Review: {line}"
        tasks.append(make_task(title, "should_do_today", tag=infer_tag(title)))

    # This Week: upcoming meetings
    for line in parse_lines(raw.get("meetings_week", "")):
        title = f"Meeting: {line}"
        tasks.append(make_task(title, "this_week", tag=infer_tag(title)))

    return tasks


# ── tasks.json read / write ────────────────────────────────────────────────

def load_tasks_file() -> dict:
    if TASKS_FILE.exists():
        try:
            return json.loads(TASKS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("WARNING: tasks.json was malformed — starting fresh.", file=sys.stderr)
    return {"tasks": [], "lastSync": None}


def merge(existing: list[dict], incoming: list[dict],
          clear_workiq: bool) -> list[dict]:
    """
    Keep all manual tasks.
    Replace WorkIQ tasks with the fresh batch.
    Preserve completed=True for WorkIQ tasks that were already ticked.
    """
    manual = [t for t in existing if t.get("source") != "workiq"]

    if clear_workiq:
        return manual + incoming

    # Match on deterministic ID (uuid5 of title) — preserve ticked state
    old_by_id = {t["id"]: t for t in existing if t.get("source") == "workiq"}
    merged_incoming = []
    for task in incoming:
        old = old_by_id.get(task["id"])
        if old:
            task = {**task, "completed": old["completed"]}
        merged_incoming.append(task)

    return manual + merged_incoming


def save_tasks_file(tasks: list[dict], sync_ts: str) -> None:
    TASKS_FILE.write_text(
        json.dumps({"tasks": tasks, "lastSync": sync_ts}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ── Git helpers ────────────────────────────────────────────────────────────

def git(args: list[str], cwd: Path = REPO_ROOT) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True
    )


def commit_and_push(sync_ts: str) -> None:
    rel_path = TASKS_FILE.relative_to(REPO_ROOT).as_posix()

    r = git(["add", rel_path])
    if r.returncode != 0:
        print(f"git add failed: {r.stderr.strip()}", file=sys.stderr)
        return

    # Check if there's actually a diff to commit
    diff = git(["diff", "--cached", "--stat"])
    if not diff.stdout.strip():
        print("No changes to tasks.json — skipping commit.", file=sys.stderr)
        return

    msg = f"chore: sync tasks from WorkIQ [{sync_ts[:16]}Z]"
    r = git(["commit", "-m", msg])
    if r.returncode != 0:
        print(f"git commit failed: {r.stderr.strip()}", file=sys.stderr)
        return

    r = git(["push"])
    if r.returncode != 0:
        print(f"git push failed: {r.stderr.strip()}", file=sys.stderr)
        return

    print(f"Pushed: {msg}")


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync WorkIQ M365 data → planner/data/tasks.json → GitHub."
    )
    parser.add_argument("--dry-run",      action="store_true",
                        help="Skip WorkIQ calls and git push; print what would happen.")
    parser.add_argument("--no-push",      action="store_true",
                        help="Write tasks.json but do not commit/push to GitHub.")
    parser.add_argument("--clear-workiq", action="store_true",
                        help="Remove all existing WorkIQ-sourced tasks before merging.")
    args = parser.parse_args()

    print("── Chief of Staff: task sync ──────────────────────────")

    # 1. Query WorkIQ
    raw: dict[str, str] = {}
    for key, query in QUERIES.items():
        print(f"  workiq: {key}…", end=" ", flush=True)
        raw[key] = run_query(query, dry_run=args.dry_run)
        print("✓" if raw[key] and not raw[key].startswith("[DRY") else "–")

    # 2. Build categorised task list
    incoming = build_tasks(raw, dry_run=args.dry_run)
    print(f"\n  Tasks from WorkIQ: {len(incoming)}")

    # 3. Merge with manual tasks
    stored   = load_tasks_file()
    merged   = merge(stored["tasks"], incoming, clear_workiq=args.clear_workiq)
    print(f"  Manual tasks kept: {len([t for t in merged if t.get('source') == 'manual'])}")
    print(f"  Total after merge: {len(merged)}")

    # 4. Write tasks.json
    sync_ts = datetime.now(timezone.utc).isoformat()
    if not args.dry_run:
        save_tasks_file(merged, sync_ts)
        print(f"\n  Written: {TASKS_FILE.relative_to(REPO_ROOT)}")
    else:
        print("\n  [DRY RUN] tasks.json not written.")

    # 5. Commit + push
    if args.dry_run or args.no_push:
        print("  Skipping git push.")
    else:
        commit_and_push(sync_ts[:19])

    print("\n  Done. Open https://renorth.github.io/chief-of-staff/ to view.")


if __name__ == "__main__":
    main()
