# Pull latest Atlas from GitHub (phone push → PC pull). Preserves .env.
$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe" }
if (Test-Path $Exe) { & $Exe update; exit $LASTEXITCODE }

$HomeAtlas = if ($env:ATLAS_HOME) { $env:ATLAS_HOME } else { Join-Path $env:USERPROFILE "Atlas" }
$Branch = if ($env:ATLAS_BRANCH) { $env:ATLAS_BRANCH } else { "main" }
Push-Location $HomeAtlas
git fetch origin $Branch
git pull --ff-only origin $Branch
Pop-Location
Write-Host "Updated $HomeAtlas"
