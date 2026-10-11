// Taxas macroeconômicas — mesma lógica, mas sem acesso a config global.

const BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

const FALLBACK = {
  selic:      13.75,
  cdi:        13.65,
  ipca:        4.22,
  pre_curto:  12.55,
  pre_longo:  13.42,
  ipca_longo:  6.97,
};

async function fetchSerie(codigo) {
  try {
    const url = `${BCB}.${codigo}/dados/ultimos/1?formato=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    const v = Number(String(arr?.[0]?.valor || '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) throw new Error('valor_invalido');
    return v;
  } catch (e) {
    console.warn(`[rates] falha ao buscar SGS/${codigo}:`, e.message);
    return null;
  }
}

export async function refreshRates(sql) {
  const map = { selic: 432, cdi: 4389, ipca: 13522 };
  let ok = 0, failed = 0;
  for (const [key, code] of Object.entries(map)) {
    const v = await fetchSerie(code);
    if (v == null) { failed++; continue; }
    await sql`
      INSERT INTO market_rates (key, value, source, updated_at)
      VALUES (${key}, ${v}, 'bcb', now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, source = 'bcb', updated_at = now()
    `;
    ok++;
  }
  for (const key of ['pre_curto', 'pre_longo', 'ipca_longo']) {
    await sql`
      INSERT INTO market_rates (key, value, source, updated_at)
      VALUES (${key}, ${FALLBACK[key]}, 'fallback', now())
      ON CONFLICT (key) DO NOTHING
    `;
  }
  console.log(`[rates] atualizado: ${ok} ok, ${failed} falhas`);
  return { ok, failed };
}

// Lê todas as taxas. Se stale (BCB > 24h) agenda refresh via ctx.waitUntil
// no caller. Aqui só devolve o estado atual.
export async function loadRates(sql) {
  const rows = await sql`SELECT key, value, source, updated_at FROM market_rates`;
  const out = { ...FALLBACK };
  let stale = rows.length === 0;
  for (const r of rows) {
    out[r.key] = Number(r.value);
    if (r.source === 'bcb' && (Date.now() - new Date(r.updated_at).getTime() > 24 * 3600_000)) {
      stale = true;
    }
  }
  return { rates: out, stale };
}
