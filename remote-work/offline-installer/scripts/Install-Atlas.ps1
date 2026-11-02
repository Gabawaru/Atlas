# Atlas local install — no Cursor, no "agent worker start"
# Run: powershell -ExecutionPolicy Bypass -File Install-Atlas.ps1

$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "..\bin\AtlasLocal.exe"
if (-not (Test-Path $Exe)) {
  $Exe = Join-Path $PSScriptRoot "..\AtlasLocal.exe"
}
if (Test-Path $Exe) {
  & $Exe install
  exit $LASTEXITCODE
}

Write-Host "AtlasLocal.exe missing — git-only fallback"
$HomeAtlas = if ($env:ATLAS_HOME) { $env:ATLAS_HOME } else { Join-Path $env:USERPROFILE "Atlas" }
$Repo = if ($env:ATLAS_REPO_URL) { $env:ATLAS_REPO_URL } else { "https://github.com/Gabawaru/Atlas.git" }
$Branch = if ($env:ATLAS_BRANCH) { $env:ATLAS_BRANCH } else { "main" }

if (Test-Path (Join-Path $HomeAtlas ".git")) {
  Push-Location $HomeAtlas
  git fetch origin $Branch
  git pull --ff-only origin $Branch
  Pop-Location
} else {
  git clone --branch $Branch --single-branch $Repo $HomeAtlas
}

$EnvFile = Join-Path $HomeAtlas ".env"
if (-not (Test-Path $EnvFile)) {
  $Example = Join-Path $HomeAtlas ".env.example"
  if (Test-Path $Example) { Copy-Item $Example $EnvFile }
  Write-Host "Created $EnvFile — paste PRAGMA_SIGN_API_KEY / RESEND_API_KEY locally only."
}
Write-Host "OK: $HomeAtlas"
