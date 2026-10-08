// Cliente da Brapi (brapi.dev): cotações, busca de tickers e indicadores de FII.
// Doc: https://brapi.dev/docs
import { config, brapiHasFundamentals } from '../lib/config.js';

const { baseUrl, token, plan } = config.brapi;
const canDividends = plan === 'startup' || plan === 'pro';
const headers = token ? { Authorization: `Bearer ${token}` } : {};

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
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

export async function fetchQuotes(tickers) {
  if (!tickers.length) return [];
  const symbols = tickers.join(',');
  // No plano gratuito, não pedir dividendos (403). Só preço, variação, volume.
  const divParam = canDividends ? '?dividends=true' : '';
  const url = `${baseUrl}/api/quote/${encodeURIComponent(symbols)}${divParam}`;
  const data = await getJson(url);
  return (data.results || []).filter((r) => r && r.symbol).map(mapQuote);
}

export async function fetchFiiIndicators(tickers) {
  if (!brapiHasFundamentals || !tickers.length) return {};
  const symbols = tickers.join(',');
  const url = `${baseUrl}/api/v2/fii/indicators?symbols=${encodeURIComponent(symbols)}`;
  try {
    const data = await getJson(url);
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

export async function fetchInstrumentList() {
  const url = `${baseUrl}/api/quote/list`;
  const data = await getJson(url);
  const kindOf = (t) => {
    const s = (t || '').toLowerCase();
    if (s === 'fund' || s === 'fii') return 'fii';
    if (s === 'stock') return 'acao';
    if (s === 'etf') return 'etf';
    if (s === 'bdr') return 'bdr';
    return 'outro';
  };
  return (data.stocks || [])
    .filter((s) => s.stock)
    .map((s) => ({
      ticker: String(s.stock).toUpperCase(),
      name: s.name || s.stock,
      kind: kindOf(s.type),
      sector: s.sector || null,
      logo_url: s.logo || null,
      avg_volume: s.volume ?? null,
    }));
}
