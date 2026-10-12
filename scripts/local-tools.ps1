$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$portableRoot = Join-Path (Split-Path $repo -Parent) '.rendum-tools'
$portable = Get-ChildItem -LiteralPath $portableRoot -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($portable) { $env:PATH = $portable.FullName + ';' + $env:PATH }
if (Test-Path -LiteralPath 'C:/Program Files/Git/cmd/git.exe') { $env:PATH = 'C:/Program Files/Git/cmd;' + $env:PATH }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ não encontrado. Instale pelo site oficial ou restaure a cópia portátil ao lado do clone.' }
if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git não encontrado. Reabra o terminal após instalar Git for Windows.' }
Set-Location -LiteralPath $repo
