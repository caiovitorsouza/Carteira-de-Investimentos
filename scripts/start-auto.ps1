param([switch]$Once)
. (Join-Path $PSScriptRoot 'local-tools.ps1')
if ($Once) { & node scripts/auto-simulate.mjs once }
else { & node scripts/auto-simulate.mjs watch }
exit $LASTEXITCODE
