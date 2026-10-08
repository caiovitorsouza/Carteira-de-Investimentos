// Motor de cotações: busca preços/indicadores na Brapi e grava no cache
// (market_quotes). Chamado pelo agendador e pela rota "atualizar agora".
import { query } from '../lib/db.js';
import { fetchQuotes, fetchFiiIndicators } from './brapi.js';
import { allPortfolioTickers } from '../repos/portfolio.js';

async function ensureInstrument(ticker, kindHint) {
  await query(
    `INSERT INTO instruments (ticker, name, kind) VALUES ($1,$1,$2)
       ON CONFLICT (ticker) DO NOTHING`,
    [ticker, kindHint || 'outro']
  );
}

async function saveQuote(q, extra = {}) {
  await ensureInstrument(q.ticker, extra.kind);
  await query(
    `INSERT INTO market_quotes
       (ticker, price, prev_close, change_pct, volume, last_dividend,
        last_ex_date, last_pay_date, dy_12m, pvp, nav_per_share,
        fetched_at, fundamentals_at, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(),
             CASE WHEN $10 IS NULL AND $11 IS NULL THEN NULL ELSE now() END, NULL)
     ON CONFLICT (ticker) DO UPDATE SET
        price=EXCLUDED.price, prev_close=EXCLUDED.prev_close,
        change_pct=EXCLUDED.change_pct, volume=EXCLUDED.volume,
        last_dividend=COALESCE(EXCLUDED.last_dividend, market_quotes.last_dividend),
        last_ex_date=COALESCE(EXCLUDED.last_ex_date, market_quotes.last_ex_date),
        last_pay_date=COALESCE(EXCLUDED.last_pay_date, market_quotes.last_pay_date),
        dy_12m=COALESCE(EXCLUDED.dy_12m, market_quotes.dy_12m),
        pvp=COALESCE(EXCLUDED.pvp, market_quotes.pvp),
        nav_per_share=COALESCE(EXCLUDED.nav_per_share, market_quotes.nav_per_share),
        fetched_at=now(),
        fundamentals_at=COALESCE(EXCLUDED.fundamentals_at, market_quotes.fundamentals_at),
        last_error=NULL`,
    [
      q.ticker, q.price, q.prev_close, q.change_pct, q.volume, q.last_dividend,
      q.last_ex_date, q.last_pay_date, extra.dy_12m ?? null, extra.pvp ?? null,
      extra.nav_per_share ?? null,
    ]
  );
}

export async function refreshTickers(tickers) {
  const list = [...new Set(tickers.map((t) => String(t).toUpperCase()))];
  const run = await query(
    `INSERT INTO refresh_runs (kind, tickers) VALUES ('prices', $1) RETURNING id`,
    [list.length]
  );
  const runId = run.rows[0].id;
  let ok = 0, failed = 0;

  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    try {
      const quotes = await fetchQuotes(batch);
      const fiiTickers = batch.filter((t) => /11$/.test(t));
      const indicators = await fetchFiiIndicators(fiiTickers);
      for (const q of quotes) {
        try {
          await saveQuote(q, { ...(indicators[q.ticker] || {}), kind: /11$/.test(q.ticker) ? 'fii' : 'acao' });
          ok++;
          console.log('[quotes] SAVED', q.ticker, 'price=', q.price);
        } catch (e) {
          failed++;
          console.error('[quotes] FAILED to save', q.ticker, ':', e.message, '| stack:', e.stack?.slice(0, 300));
          await query('UPDATE market_quotes SET last_error=$2 WHERE ticker=$1', [q.ticker, e.message]).catch(() => {});
        }
      }
    } catch (e) {
      failed += batch.length;
      console.error('[quotes] lote falhou:', e.message);
    }
  }

  await query(
    `UPDATE refresh_runs SET finished_at=now(), ok=$2, failed=$3 WHERE id=$1`,
    [runId, ok, failed]
  );
  console.log('[quotes] run finished — ok:', ok, 'failed:', failed);
  return { tickers: list.length, ok, failed };
}

export const refreshAllPortfolios = async () => refreshTickers(await allPortfolioTickers());
