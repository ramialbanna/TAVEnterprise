# Paste a GitHub PAT for the automation account, then push main.
# Usage (from repo root):
#   .\scripts\push-with-token.ps1
#
# Create the token while logged into GitHub as automation-TAV (automation@texasautovalue.com):
#   https://github.com/settings/tokens
# Needs write access to ramialbanna/TAVEnterprise (Contents: Read and write).

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

$remoteUrl = (git remote get-url origin 2>$null)
if (-not $remoteUrl) {
  Write-Error "No origin remote configured."
}

# GitHub username for automation@texasautovalue.com (matches local git config).
$defaultUsername = "automation-TAV"

# Drop stale github.com credentials (e.g. old nick-oxa token).
"protocol=https`nhost=github.com" | git credential reject 2>$null

Write-Host ""
Write-Host "GitHub push — automation account"
Write-Host "Repo:   $remoteUrl"
Write-Host "Branch: main"
Write-Host "User:   $defaultUsername  (override with `$env:GITHUB_USERNAME if different)"
Write-Host ""
Write-Host "Create token at https://github.com/settings/tokens while logged in as automation-TAV."
Write-Host ""

$token = (Read-Host "Paste GitHub token and press Enter").Trim()

if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error "Token was empty."
}

$username = if ($env:GITHUB_USERNAME) { $env:GITHUB_USERNAME } else { $defaultUsername }

$credential = @"
protocol=https
host=github.com
username=$username
password=$token

"@

$credential | git credential approve

Write-Host "Pushing as $username ..."
git push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host "Push succeeded."
} else {
  Write-Host "Push failed. Confirm the token was created on the automation-TAV GitHub account and has repo write access."
  exit $LASTEXITCODE
}
