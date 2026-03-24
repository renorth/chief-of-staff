#!/usr/bin/env python3
"""
package_flows.py
----------------
Assembles the two Power Automate flow definitions into importable .zip packages.

Usage:
    python flows/package_flows.py

    # Replace placeholder email before packaging:
    python flows/package_flows.py --email rebecca@contoso.com

    # Also replace Teams team/channel IDs (Morning Briefing only):
    python flows/package_flows.py \\
        --email rebecca@contoso.com \\
        --team-id  "your-team-guid" \\
        --channel-id "your-channel-guid"

Output:
    flows/dist/ChiefOfStaff_NewsBriefing.zip
    flows/dist/ChiefOfStaff_MorningBriefing.zip

Import into Power Automate:
    1. Go to https://make.powerautomate.com
    2. My flows → Import → Import Package (Legacy)
    3. Upload the .zip
    4. Map the two connections (RSS, Teams / Outlook, Teams)
    5. Import → turn the flow ON
"""

import argparse
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path


FLOWS_DIR = Path(__file__).resolve().parent
DIST_DIR  = FLOWS_DIR / "dist"

FLOWS = [
    {
        "name":        "ChiefOfStaff_NewsBriefing",
        "description": "Weekday 10 AM ET — RSS news briefing posted to Teams",
        "definition":  FLOWS_DIR / "NewsBriefing_definition.json",
        "flow_id":     "cos-news-briefing-v1",
    },
    {
        "name":        "ChiefOfStaff_MorningBriefing",
        "description": "Weekday 9 AM ET — Calendar, email, and Teams triage posted to Teams",
        "definition":  FLOWS_DIR / "MorningBriefing_definition.json",
        "flow_id":     "cos-morning-briefing-v1",
    },
]


def make_manifest(flow: dict) -> dict:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema": "1.0",
        "details": {
            "displayName":      flow["name"],
            "description":      flow["description"],
            "createdTime":      now,
            "lastModifiedTime": now,
            "flowTriggerUri":   ""
        },
        "skuName":    "Free",
        "resourceId": flow["flow_id"],
        "flowName":   flow["name"]
    }


def patch_definition(raw: str, email: str, team_id: str, channel_id: str) -> str:
    """Replace placeholder strings in the definition JSON."""
    raw = raw.replace("REPLACE_WITH_YOUR_EMAIL@yourdomain.com", email)
    raw = raw.replace("REPLACE_WITH_YOUR_TEAM_ID",    team_id)
    raw = raw.replace("REPLACE_WITH_YOUR_CHANNEL_ID", channel_id)
    return raw


def build_zip(flow: dict, email: str, team_id: str, channel_id: str) -> Path:
    DIST_DIR.mkdir(exist_ok=True)
    out_path = DIST_DIR / f"{flow['name']}.zip"

    definition_raw = flow["definition"].read_text(encoding="utf-8")
    definition_raw = patch_definition(definition_raw, email, team_id, channel_id)

    # Validate JSON before packaging
    try:
        json.loads(definition_raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Definition JSON is invalid for {flow['name']}: {e}")

    manifest = make_manifest(flow)
    base     = f"Microsoft.Flow/flows/{flow['flow_id']}"

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}/definition.json", definition_raw)
        zf.writestr(f"{base}/manifest.json",   json.dumps(manifest, indent=2))

    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Package Power Automate flows for import.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "--email", "-e",
        default="REPLACE_WITH_YOUR_EMAIL@yourdomain.com",
        help="Your M365 email address (used as Teams message recipient)"
    )
    parser.add_argument(
        "--team-id",
        default="REPLACE_WITH_YOUR_TEAM_ID",
        help="Microsoft Teams team GUID (for mention scanning in Morning Briefing)"
    )
    parser.add_argument(
        "--channel-id",
        default="REPLACE_WITH_YOUR_CHANNEL_ID",
        help="Microsoft Teams channel GUID (for mention scanning in Morning Briefing)"
    )
    args = parser.parse_args()

    if "REPLACE" in args.email:
        print("⚠️  No --email provided. Placeholders will remain in the definition.")
        print("   You can update them in Power Automate after import.\n")

    for flow in FLOWS:
        path = build_zip(flow, args.email, args.team_id, args.channel_id)
        print(f"✓  {path.name}  →  {path}")

    print(f"\nOutput folder: {DIST_DIR}")
    print("\nNext steps:")
    print("  1. Go to https://make.powerautomate.com")
    print("  2. My flows → Import → Import Package (Legacy)")
    print("  3. Upload each .zip, map connections, click Import")
    print("  4. Open each flow → turn it ON → run Test once to verify")


if __name__ == "__main__":
    main()
