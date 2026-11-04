# Stop Docker Compose services for Atlas.
$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe" }
if (Test-Path $Exe) { & $Exe stop; exit $LASTEXITCODE }

$HomeAtlas = if ($env:ATLAS_HOME) { $env:ATLAS_HOME } else { Join-Path $env:USERPROFILE "Atlas" }
Set-Location $HomeAtlas
docker compose stop
