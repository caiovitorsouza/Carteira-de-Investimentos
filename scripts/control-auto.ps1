param([Parameter(Mandatory=$true)][ValidateSet('pause','resume','status')][string]$Action)
. (Join-Path $PSScriptRoot 'local-tools.ps1')
& node scripts/auto-simulate.mjs $Action
exit $LASTEXITCODE
