# Schedule AtlasLocal auto-update watch (replaces Cursor agent worker for pull path).
# Run elevated if Task Scheduler denies:
#   powershell -ExecutionPolicy Bypass -File Register-AtlasWatchTask.ps1
#
# Interval: ATLAS_WATCH_SECONDS (default 300). Branch: ATLAS_BRANCH (default main).

$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe" }
if (-not (Test-Path $Exe)) { throw "AtlasLocal.exe not found next to scripts/bin" }

$Seconds = 300
if ($env:ATLAS_WATCH_SECONDS -match '^\d+$' -and [int]$env:ATLAS_WATCH_SECONDS -ge 30) {
  $Seconds = [int]$env:ATLAS_WATCH_SECONDS
}

$TaskName = "AtlasLocal-Watch"
$Action = New-ScheduledTaskAction -Execute $Exe -Argument "watch $Seconds"
# Task kicks once; the watch process itself loops. Restart if the process exits.
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Write-Host "Scheduled task '$TaskName' registered — runs 'watch $Seconds' at logon."
Write-Host "Tracks origin/`$(ATLAS_BRANCH or main): fetch/compare/pull/restart api+client."
Write-Host "Unset/override: ATLAS_WATCH_SECONDS, ATLAS_BRANCH, ATLAS_HOME, ATLAS_SERVICES"
