# Run ADO sync — called by Windows Task Scheduler daily at 8am
# Logs output to sync_ado.log in the same folder

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$logFile   = Join-Path $scriptDir 'sync_ado.log'
$python    = 'python'

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content $logFile "`n=== $timestamp ==="

& $python (Join-Path $scriptDir 'sync_ado.py') 2>&1 | Tee-Object -FilePath $logFile -Append
