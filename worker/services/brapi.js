// Cliente Brapi — recebe `cfg` em vez de ler config global.
// fetch nativo funciona igual em Workers e em Node 20.

import { brapiHasFundamentals } from '../lib/config.js';

async function getJson(url, headers) {
  const safeUrl = url.replace(/token=[^&]+/, 'token=REDACTED');
  console.log('[brapi] GET', safeUrl);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[brapi] HTTP', res.status, body.slice(0, 300));
    throw new Error(`brapi ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function mapQuote(r) {
  const div = Array.isArray(r.dividendsData?.cashDividends)
    ? [...r.dividendsData.cashDividends].sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))[0]
    : null;
  return {
    ticker: r.symbol,
    price: r.regularMarketPrice ?? null,
    prev_close: r.regularMarketPreviousClose ?? null,
    change_pct: r.regularMarketChangePercent ?? null,
    volume: r.regularMarketVolume ?? null,
    last_dividend: div?.rate ?? null,
    last_ex_date: div?.lastDatePrior ? div.lastDatePrior.slice(0, 10) : null,
    last_pay_date: div?.paymentDate ? div.paymentDate.slice(0, 10) : null,
  };
}

export async function fetchQuotes(cfg, tickers) {
  if (!tickers.length) return [];
  const { baseUrl, token, plan } = cfg.brapi;
  const canDividends = plan === 'startup' || plan === 'pro';
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const symbols = tickers.join(',');
  const params = [];
  if (canDividends) params.push('dividends=true');
  if (token) params.push(`token=${encodeURIComponent(token)}`);
  const url = `${baseUrl}/api/quote/${encodeURIComponent(symbols)}${params.length ? '?' + params.join('&') : ''}`;
  const data = await getJson(url, headers);
  const quotes = (data.results || []).filter((r) => r && r.symbol).map(mapQuote);
  console.log('[brapi] parsed', quotes.length, 'quotes');
  return quotes;
}

export async function fetchFiiIndicators(cfg, tickers) {
  if (!brapiHasFundamentals(cfg) || !tickers.length) return {};
  const { baseUrl, token } = cfg.brapi;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const symbols = tickers.join(',');
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const url = `${baseUrl}/api/v2/fii/indicators?symbols=${encodeURIComponent(symbols)}${tokenParam}`;
  try {
    const data = await getJson(url, headers);
    const out = {};
    for (const f of data.fiis || []) {
      out[f.symbol] = {
        pvp: f.priceToNav ?? null,
        nav_per_share: f.navPerShare ?? null,
        dy_12m: f.dividendYield12m != null ? f.dividendYield12m * 100 : null,
      };
    }
    return out;
  } catch (err) {
    console.warn('[brapi] indicadores de FII indisponíveis:', err.message);
    return {};
  }
}

// Classe do ativo no catálogo, pelo SUBTIPO informado pela Brapi (documentado: stock, unit, fii, etf,
// fi-infra, fi-agro, fip, fidc, bdr). O tipo "fund" sozinho junta FII, ETF e outros fundos, então não
// basta. Sem subtipo conhecido, a classe fica desconhecida ('outro'): nunca é deduzida pelo código.
// Unit (pacote de ações da mesma empresa negociado como uma unidade, B3) entra como ação.
const SUBTYPE_KIND = { stock: 'acao', unit: 'acao', fii: 'fii', etf: 'etf', bdr: 'bdr' };
export function instrumentKindOf(s) {
  const sub = String(s?.subType || '').toLowerCase();
  if (sub) return Object.hasOwn(SUBTYPE_KIND, sub) ? SUBTYPE_KIND[sub] : 'outro';
  // O tipo genérico fund é ambíguo. Stock e BDR continuam inequívocos no v1.
  return s?.type === 'stock' ? 'acao' : s?.type === 'bdr' ? 'bdr' : 'outro';
}

export async function fetchInstrumentList(cfg) {
  const { baseUrl, token } = cfg.brapi;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${baseUrl}/api/quote/list${token ? '?token=' + encodeURIComponent(token) : ''}`;
  const data = await getJson(url, headers);
  return (data.stocks || [])
    .filter((s) => s.stock)
    .map((s) => ({
      ticker: String(s.stock).toUpperCase(),
      name: s.name || s.stock,
      kind: instrumentKindOf(s),
      sector: s.sector || null,
      logo_url: s.logo || null,
      avg_volume: s.volume ?? null,
    }));
}
