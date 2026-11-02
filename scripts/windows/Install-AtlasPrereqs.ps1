#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot Windows prerequisite installer for Gabawaru/Atlas.

.DESCRIPTION
  Installs / verifies:
    - Node.js 20.x
    - pnpm 9.15.0 (via Corepack)
    - Docker Engine (Docker Desktop) + repo docker compose (Postgres 16 + Redis 7)
  Then: copy .env if missing, pnpm install, post-install checklist (pass/fail),
  and optionally launch Atlas UI (`pnpm dev`).

  Does NOT start any Cursor / agent worker.

.PARAMETER RepoRoot
  Atlas repo root. Default: two levels above this script (…/scripts/windows → repo).

.PARAMETER SkipInstall
  Only run checklist (+ optional launch). Do not attempt installs.

.PARAMETER SkipLaunch
  After a successful checklist, do not start the Atlas UI.

.PARAMETER LaunchScript
  pnpm script to start after success. Default: "dev" (api + admin + client).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-AtlasPrereqs.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [switch]$SkipInstall,
  [switch]$SkipLaunch,
  [string]$LaunchScript = "dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$NodeMajorRequired = 20
$PnpmExact = "9.15.0"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) { Write-Host "  [PASS] $Message" -ForegroundColor Green }
function Write-Fail([string]$Message) { Write-Host "  [FAIL] $Message" -ForegroundColor Red }
function Write-Info([string]$Message) { Write-Host "  $Message" -ForegroundColor Gray }

function Refresh-PathFromMachine {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($machine -or $user) {
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ";"
  }
  # Common Node / Docker locations if PATH not refreshed yet
  $extra = @(
    "${env:ProgramFiles}\nodejs",
    "${env:ProgramFiles}\Docker\Docker\resources\bin",
    "${env:LOCALAPPDATA}\Programs\nodejs",
    "${env:APPDATA}\npm"
  )
  foreach ($p in $extra) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
      $env:Path = "$p;$env:Path"
    }
  }
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-Winget {
  if (Test-Command "winget") { return (Get-Command winget).Source }
  return $null
}

function Invoke-WingetInstall([string]$Id, [string]$DisplayName) {
  $winget = Get-Winget
  if (-not $winget) {
    Write-Info "winget not found — cannot auto-install $DisplayName."
    return $false
  }
  Write-Info "Installing $DisplayName via winget ($Id)…"
  # --accept-* keeps this non-interactive when elevation already allows it.
  & $winget install --id $Id -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  $code = $LASTEXITCODE
  Refresh-PathFromMachine
  # 0 = installed, -1978335189 / other success-ish codes vary; treat 0 as success.
  if ($code -eq 0) { return $true }
  # Already installed
  if ($code -eq -1978335189) { return $true }
  Write-Info "winget exit code $code for $DisplayName (may already be present)."
  return (Test-Command ($DisplayName -replace " .*",""))
}

function Ensure-Node20 {
  Write-Step "Node.js $NodeMajorRequired"
  Refresh-PathFromMachine
  if (Test-Command "node") {
    $ver = (& node -v 2>$null)
    if ($ver -match '^v(\d+)\.') {
      $major = [int]$Matches[1]
      if ($major -ge $NodeMajorRequired) {
        Write-Info "Found $ver"
        return $true
      }
      Write-Info "Found $ver (need >= $NodeMajorRequired) — upgrading…"
    }
  }
  if ($SkipInstall) { return $false }
  $ok = Invoke-WingetInstall -Id "OpenJS.NodeJS.20" -DisplayName "Node.js 20"
  Refresh-PathFromMachine
  return (Test-Command "node")
}

function Ensure-Pnpm {
  Write-Step "pnpm $PnpmExact"
  Refresh-PathFromMachine
  if (-not (Test-Command "node")) {
    Write-Info "Node missing — skip pnpm."
    return $false
  }
  if ($SkipInstall) {
    return (Test-Command "pnpm")
  }
  try {
    Write-Info "corepack enable + prepare pnpm@$PnpmExact"
    & corepack enable 2>$null | Out-Null
    & corepack prepare "pnpm@$PnpmExact" --activate
  } catch {
    Write-Info "corepack failed: $($_.Exception.Message)"
  }
  Refresh-PathFromMachine
  if (-not (Test-Command "pnpm")) {
    Write-Info "Falling back to npm i -g pnpm@$PnpmExact"
    & npm install -g "pnpm@$PnpmExact" 2>$null | Out-Null
    Refresh-PathFromMachine
  }
  return (Test-Command "pnpm")
}

function Ensure-Docker {
  Write-Step "Docker (Desktop / Engine)"
  Refresh-PathFromMachine
  if (Test-Command "docker") {
    Write-Info "Found docker: $((& docker --version 2>$null))"
    return $true
  }
  if ($SkipInstall) { return $false }
  $ok = Invoke-WingetInstall -Id "Docker.DockerDesktop" -DisplayName "Docker Desktop"
  Refresh-PathFromMachine
  if (-not (Test-Command "docker")) {
    Write-Info "Docker Desktop may need a reboot or manual start from the Start menu."
    Write-Info "After Docker is running, re-run this script."
    return $false
  }
  return $true
}

function Ensure-ComposeStack {
  Write-Step "docker compose (Postgres 16 + Redis 7)"
  $compose = Join-Path $RepoRoot "docker-compose.yml"
  if (-not (Test-Path $compose)) {
    Write-Info "Missing docker-compose.yml at $RepoRoot"
    return $false
  }
  if (-not (Test-Command "docker")) { return $false }

  # Probe daemon
  & docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Info "Docker daemon not reachable. Start Docker Desktop, wait until it is healthy, re-run."
    return $false
  }

  if ($SkipInstall) {
    & docker compose -f $compose ps 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  }

  Push-Location $RepoRoot
  try {
    Write-Info "docker compose up -d"
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) { return $false }

    # Wait for health (best-effort, ~60s)
    $deadline = (Get-Date).AddSeconds(60)
    do {
      $pgOut = (& docker compose exec -T postgres pg_isready -U atlas -d atlas 2>$null | Out-String).Trim()
      $pgOk = ($pgOut -match "accepting")
      $rdOut = (& docker compose exec -T redis redis-cli ping 2>$null | Out-String).Trim()
      $rdOk = ($rdOut -eq "PONG")
      if ($pgOk -and $rdOk) { return $true }
      Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    Write-Info "Compose started; health wait timed out (services may still be warming up)."
    return $true
  } finally {
    Pop-Location
  }
}

function Ensure-EnvAndDeps {
  Write-Step ".env + pnpm install"
  $envExample = Join-Path $RepoRoot ".env.example"
  $envFile = Join-Path $RepoRoot ".env"
  if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
      Copy-Item $envExample $envFile
      Write-Info "Created .env from .env.example"
    } else {
      Write-Info "No .env.example found"
    }
  } else {
    Write-Info ".env already present (left unchanged)"
  }

  if ($SkipInstall) { return (Test-Path (Join-Path $RepoRoot "node_modules")) }
  if (-not (Test-Command "pnpm")) { return $false }

  Push-Location $RepoRoot
  try {
    & pnpm install
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
  }
}

# --- Checklist ---
$results = [ordered]@{}

function Set-Check([string]$Key, [bool]$Ok, [string]$Detail) {
  $results[$Key] = @{ Ok = $Ok; Detail = $Detail }
  if ($Ok) { Write-Ok "$Key — $Detail" } else { Write-Fail "$Key — $Detail" }
}

Write-Host ""
Write-Host "Atlas Windows prerequisite installer" -ForegroundColor White
Write-Host "Repo: $RepoRoot"
Write-Host "SkipInstall=$SkipInstall  SkipLaunch=$SkipLaunch  LaunchScript=$LaunchScript"
Write-Host "NOTE: Does not start Cursor/agent workers."

if (-not $SkipInstall) {
  [void](Ensure-Node20)
  [void](Ensure-Pnpm)
  [void](Ensure-Docker)
  [void](Ensure-ComposeStack)
  [void](Ensure-EnvAndDeps)
} else {
  Write-Step "SkipInstall set — checklist only"
}

Write-Step "Post-install checklist"
Refresh-PathFromMachine

# Node
$nodeDetail = "not found"
$nodeOk = $false
if (Test-Command "node") {
  $nodeDetail = (& node -v 2>$null)
  if ($nodeDetail -match '^v(\d+)\.') {
    $nodeOk = ([int]$Matches[1] -ge $NodeMajorRequired)
  }
}
Set-Check "Node.js >= $NodeMajorRequired" $nodeOk $nodeDetail

# pnpm
$pnpmDetail = "not found"
$pnpmOk = $false
if (Test-Command "pnpm") {
  $pnpmDetail = (& pnpm -v 2>$null).Trim()
  $pnpmOk = ($pnpmDetail -eq $PnpmExact) -or ($pnpmDetail -like "9.*")
  if ($pnpmDetail -ne $PnpmExact) {
    $pnpmDetail = "$pnpmDetail (wanted exact $PnpmExact)"
  }
}
Set-Check "pnpm $PnpmExact" $pnpmOk $pnpmDetail

# Docker CLI + daemon
$dockerOk = $false
$dockerDetail = "not found"
if (Test-Command "docker") {
  $dockerDetail = (& docker --version 2>$null)
  & docker info 2>$null | Out-Null
  $dockerOk = ($LASTEXITCODE -eq 0)
  if (-not $dockerOk) { $dockerDetail = "$dockerDetail (daemon not running)" }
}
Set-Check "Docker daemon" $dockerOk "$dockerDetail"

# Postgres 16
$pgOk = $false
$pgDetail = "unreachable"
if ($dockerOk) {
  Push-Location $RepoRoot
  try {
    $img = (& docker compose ps --format json 2>$null | Out-String)
    $ready = (& docker compose exec -T postgres pg_isready -U atlas -d atlas 2>$null | Out-String).Trim()
    $ver = (& docker compose exec -T postgres psql -U atlas -d atlas -tAc "SHOW server_version;" 2>$null | Out-String).Trim()
    if ($ready -match "accepting") {
      $pgOk = $ver -match '^16\.'
      $pgDetail = if ($ver) { "pg_isready ok; version $ver" } else { "pg_isready ok; version unknown" }
      if (-not $pgOk -and $ver) { $pgDetail = "unexpected major: $ver (want 16.x)" }
      if (-not $ver) { $pgOk = $true; $pgDetail = "pg_isready ok (version probe skipped)" }
    } else {
      $pgDetail = "not ready ($ready)"
    }
  } finally { Pop-Location }
}
Set-Check "Postgres 16 (compose)" $pgOk $pgDetail

# Redis 7
$redisOk = $false
$redisDetail = "unreachable"
if ($dockerOk) {
  Push-Location $RepoRoot
  try {
    $pong = (& docker compose exec -T redis redis-cli ping 2>$null | Out-String).Trim()
    $rver = (& docker compose exec -T redis redis-cli INFO server 2>$null | Select-String -Pattern 'redis_version:(\S+)' | ForEach-Object { $_.Matches[0].Groups[1].Value })
    if ($pong -eq "PONG") {
      $redisOk = (-not $rver) -or ($rver -like "7.*")
      $redisDetail = if ($rver) { "PONG; version $rver" } else { "PONG" }
      if ($rver -and $rver -notlike "7.*") {
        $redisOk = $false
        $redisDetail = "unexpected major: $rver (want 7.x)"
      }
    } else {
      $redisDetail = "no PONG ($pong)"
    }
  } finally { Pop-Location }
}
Set-Check "Redis 7 (compose)" $redisOk $redisDetail

# .env + node_modules
$envOk = Test-Path (Join-Path $RepoRoot ".env")
Set-Check ".env present" $envOk $(if ($envOk) { ".env" } else { "missing — copy .env.example" })

$modsOk = Test-Path (Join-Path $RepoRoot "node_modules")
Set-Check "pnpm install (node_modules)" $modsOk $(if ($modsOk) { "node_modules present" } else { "missing" })

$allOk = $true
foreach ($k in $results.Keys) {
  if (-not $results[$k].Ok) { $allOk = $false }
}

Write-Host ""
if ($allOk) {
  Write-Host "Checklist: ALL PASS" -ForegroundColor Green
} else {
  Write-Host "Checklist: SOME FAILURES — fix items above and re-run." -ForegroundColor Yellow
  Write-Host "Common Windows blocker: Docker Desktop must be installed AND running on a real Windows host (WSL2 backend)." -ForegroundColor Yellow
}

if ($allOk -and -not $SkipLaunch) {
  Write-Step "Launch Atlas UI (pnpm $LaunchScript) — not an agent worker"
  Write-Info "API http://localhost:3001/v1/health | admin :3000 | client :3002"
  Write-Info "Press Ctrl+C in this window to stop the dev servers."
  Push-Location $RepoRoot
  try {
    & pnpm $LaunchScript
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
} elseif ($allOk -and $SkipLaunch) {
  Write-Info "SkipLaunch set — start UIs later with: pnpm dev"
}

if (-not $allOk) { exit 1 }
exit 0
