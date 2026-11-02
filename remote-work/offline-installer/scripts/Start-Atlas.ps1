# Start local Atlas stack (Docker + pnpm). No Cursor worker.
$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe" }
if (Test-Path $Exe) { & $Exe start; exit $LASTEXITCODE }

$HomeAtlas = if ($env:ATLAS_HOME) { $env:ATLAS_HOME } else { Join-Path $env:USERPROFILE "Atlas" }
Set-Location $HomeAtlas
docker compose up -d
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
}
pnpm install
Write-Host "Then: pnpm demo:smoke ; pnpm dev:api ; pnpm dev:client ; pnpm dev:admin"
