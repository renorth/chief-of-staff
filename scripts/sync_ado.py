#!/usr/bin/env python3
"""
Sync ADO work items assigned to me → planner/data/ado-items.json
Uses az CLI auth (no PAT needed). Run from anywhere in the repo.

Usage: python scripts/sync_ado.py
"""
import subprocess, json, datetime, pathlib, sys, shutil

AZ = shutil.which('az') or r'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'

ORG     = 'https://dev.azure.com/Office'
PROJECT = 'OC'
AREA    = 'OC\\ExD Growth'

WIQL = (
    "SELECT [System.Id], [System.Title], [System.State] "
    "FROM WorkItems "
    f"WHERE [System.AreaPath] UNDER '{AREA}' "
    "AND [System.State] NOT IN ('Closed', 'Removed') "
    "AND ([System.AssignedTo] = @Me OR [Custom.PM] = @Me) "
    "ORDER BY [System.ChangedDate] DESC"
)

STATE_MAP = {
    'New':         'Active',
    'Active':      'Active',
    'In Progress': 'In Progress',
    'Committed':   'In Progress',
    'In Review':   'In Review',
    'Resolved':    'Resolved',
    'Closed':      'Closed',
    'Blocked':     'Blocked',
    'On Hold':     'At Risk',
}

def run():
    print('Querying ADO...')
    result = subprocess.run(
        [
            AZ, 'boards', 'query',
            '--wiql',         WIQL,
            '--organization', ORG,
            '--project',      PROJECT,
            '--output',       'json',
        ],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        print(f'az boards query failed:\n{result.stderr}', file=sys.stderr)
        sys.exit(1)

    raw = json.loads(result.stdout)

    items = []
    for wi in raw:
        ado_id = wi['id']
        fields = wi.get('fields', {})
        # az CLI returns field names as lowercase dotted (e.g. "system.title")
        state  = fields.get('System.State') or fields.get('system.state') or 'Active'
        title  = fields.get('System.Title') or fields.get('system.title') or f'Work Item {ado_id}'
        items.append({
            'adoId':  f'https://dev.azure.com/Office/OC/_workitems/edit/{ado_id}',
            'title':  title,
            'status': STATE_MAP.get(state, 'Active'),
        })

    output = {
        'lastSync': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'items':    items,
    }

    # Write to planner/data/ado-items.json (relative to repo root)
    repo_root = pathlib.Path(__file__).parent.parent
    out_file  = repo_root / 'planner' / 'data' / 'ado-items.json'
    out_file.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f'Wrote {len(items)} item(s) to {out_file}')

    # Commit and push
    subprocess.run(['git', '-C', str(repo_root), 'add', 'planner/data/ado-items.json'], check=True)
    diff = subprocess.run(['git', '-C', str(repo_root), 'diff', '--cached', '--quiet'])
    if diff.returncode == 0:
        print('No changes to commit.')
        return
    subprocess.run(
        ['git', '-C', str(repo_root), 'commit', '-m', 'sync: update ADO work items'],
        check=True,
    )
    subprocess.run(['git', '-C', str(repo_root), 'push'], check=True)
    print('Pushed to GitHub.')

if __name__ == '__main__':
    run()
