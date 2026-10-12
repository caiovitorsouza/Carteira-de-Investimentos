#!/bin/bash
# Roda cada arquivo contra um servidor de teste novo (estado limpo) na porta 8787.
# Requer Node 18+ e Playwright com Chromium (npm i -D playwright && npx playwright install chromium).
cd "$(dirname "$0")"
total=0; falhas=0
for f in t1 t2 t3 t4 t5 t6; do
  if [ "$f" != t6 ]; then node server.mjs >/dev/null 2>&1 & SP=$!; sleep 0.8; fi
  out=$(node $f.mjs 2>&1); code=$?
  if [ "$f" != t6 ]; then kill $SP 2>/dev/null; wait $SP 2>/dev/null; fi
  p=$(echo "$out" | grep -c '^PASS'); x=$(echo "$out" | grep -c '^FAIL')
  if [ $code -ne 0 ] && [ $x -eq 0 ]; then x=1; echo "$out" | tail -5; fi
  total=$((total+p+x)); falhas=$((falhas+x))
  echo "$f: $p ok, $x falha(s)"; echo "$out" | grep '^FAIL'
done
echo "TOTAL: $total verificações, $falhas falha(s)"
[ $falhas -eq 0 ]
