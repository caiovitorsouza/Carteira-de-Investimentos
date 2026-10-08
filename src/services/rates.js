// Taxas macroeconômicas: Selic, CDI, IPCA — buscadas do Banco Central do Brasil
// via API SGS (grátis, sem token). Também guardamos projeções do Tesouro Direto
// como fallback quando o front não tiver taxa personalizada.
//
// Códigos SGS do BCB:
//   432   = Selic meta (% a.a.)
//   4389  = CDI anualizado (% a.a.)
//   13522 = IPCA acumulado 12m (% a.a.)
//
// A API retorna o último valor como { data: "DD/MM/YYYY", valor: "13.75" }.
// Chamadas falham silenciosamente - o cache no banco segura o valor anterior.

import { query } from '../lib/db.js';

const BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

// Taxas fallback (atualizar manualmente se BCB cair por muito tempo)
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

// Atualiza o cache no banco. Retorna { ok: N, failed: N }.
export async function refreshRates() {
  const map = {
    selic: 432,
    cdi:   4389,
    ipca:  13522,
  };
  let ok = 0, failed = 0;
  for (const [key, code] of Object.entries(map)) {
    const v = await fetchSerie(code);
    if (v == null) { failed++; continue; }
    await query(
      `INSERT INTO market_rates (key, value, source, updated_at)
       VALUES ($1, $2, 'bcb', now())
       ON CONFLICT (key) DO UPDATE SET value = $2, source = 'bcb', updated_at = now()`,
      [key, v]
    );
    ok++;
  }
  // Taxas de Tesouro: hoje só mantemos como fallback no banco (sem fonte oficial livre)
  for (const key of ['pre_curto', 'pre_longo', 'ipca_longo']) {
    await query(
      `INSERT INTO market_rates (key, value, source, updated_at)
       VALUES ($1, $2, 'fallback', now())
       ON CONFLICT (key) DO NOTHING`,
      [key, FALLBACK[key]]
    );
  }
  console.log(`[rates] atualizado: ${ok} ok, ${failed} falhas`);
  return { ok, failed };
}

// Lê todas as taxas do banco. Se vazio, usa fallback. Se taxas BCB estão stale
// (> 24h) e já é horário comercial, dispara refresh em background.
export async function loadRates() {
  const { rows } = await query('SELECT key, value, source, updated_at FROM market_rates');
  const out = { ...FALLBACK };
  let stale = false;
  for (const r of rows) {
    out[r.key] = Number(r.value);
    if (r.source === 'bcb' && (Date.now() - new Date(r.updated_at).getTime() > 24 * 3600_000)) {
      stale = true;
    }
  }
  // Se banco vazio, popula fallback
  if (rows.length === 0) {
    refreshRates().catch(() => {});
  } else if (stale) {
    refreshRates().catch(() => {});
  }
  return out;
}
