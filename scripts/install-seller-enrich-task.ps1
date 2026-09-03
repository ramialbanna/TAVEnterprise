# Register a logon task so seller enrich keeps running after reboot.
# Run from the repo:  powershell -File scripts/install-seller-enrich-task.ps1
$ErrorActionPreference = "Stop"
$cmd = Join-Path $PSScriptRoot "run-seller-enrich-daemon.cmd"
if (-not (Test-Path $cmd)) {
  throw "Missing $cmd"
}
$taskName = "TAV-seller-enrich"
schtasks /Create /TN $taskName /TR "`"$cmd`"" /SC ONLOGON /F
if ($LASTEXITCODE -ne 0) {
  throw "schtasks failed ($LASTEXITCODE). Run this script from an elevated PowerShell if access is denied."
}
Write-Host "Registered $taskName at logon -> $cmd"
Write-Host "Start now with: npm run gologin:enrich:daemon"
