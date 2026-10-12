. (Join-Path $PSScriptRoot 'local-tools.ps1')
& node scripts/auto-simulate.mjs stop
exit $LASTEXITCODE
