# Optional: schedule update+start every 15 minutes (replaces Cursor agent worker for pull path).
# Run elevated if Task Scheduler denies: powershell -ExecutionPolicy Bypass -File Register-AtlasWatchTask.ps1

$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe" }
if (-not (Test-Path $Exe)) { throw "AtlasLocal.exe not found next to scripts/bin" }

$TaskName = "AtlasLocal-Update"
$Action = New-ScheduledTaskAction -Execute $Exe -Argument "update"
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Write-Host "Scheduled task '$TaskName' registered — pulls origin every 15 min."
Write-Host "To also refresh stack after pull, run AtlasLocal.exe watch in a user session, or add a second action."
