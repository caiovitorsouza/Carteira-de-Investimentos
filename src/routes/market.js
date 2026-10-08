// Rotas de mercado: busca de tickers (autocompletar) e detalhe de um ativo.
import { Router } from 'express';
import { query } from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { refreshTickers } from '../services/quotes.js';
import { loadRates, refreshRates } from '../services/rates.js';

export const marketRouter = Router();
marketRouter.use(requireAuth);

// GET /api/market/rates -> taxas macroeconômicas (Selic, CDI, IPCA + ref. Tesouro)
marketRouter.get('/rates', async (_req, res, next) => {
  try {
    const rates = await loadRates();
    res.json(rates);
  } catch (err) { next(err); }
});

// POST /api/market/rates/refresh -> força atualização a partir do Banco Central
marketRouter.post('/rates/refresh', async (_req, res, next) => {
  try {
    const r = await refreshRates();
    const rates = await loadRates();
    res.json({ ...r, rates });
  } catch (err) { next(err); }
});

// GET /api/market/search?q=mxrf  -> autocompletar por ticker ou nome.
marketRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toUpperCase();
    if (q.length < 1) return res.json({ results: [] });
    const { rows } = await query(
      `SELECT ticker, name, kind, sector, logo_url
         FROM instruments
        WHERE active
          AND (ticker LIKE $1 OR name ILIKE $2)
          AND kind IN ('fii','acao','etf')
        ORDER BY (ticker = $3) DESC,          -- match exato primeiro
                 (ticker LIKE $1) DESC,        -- prefixo depois
                 avg_volume DESC NULLS LAST    -- mais negociados no topo
        LIMIT 12`,
      [q + '%', '%' + q + '%', q]
    );
    res.json({ results: rows });
  } catch (err) { next(err); }
});

// GET /api/market/quote/:ticker -> cotação do cache; se faltar, busca na hora.
marketRouter.get('/quote/:ticker', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker || '').toUpperCase();
    let { rows } = await query(
      `SELECT i.ticker, i.name, i.kind, i.sector,
              q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend,
              q.last_ex_date, q.last_pay_date, q.fetched_at
         FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
        WHERE i.ticker = $1`,
      [ticker]
    );
    if (!rows[0] || rows[0].price == null) {
      await refreshTickers([ticker]).catch(() => {});
      ({ rows } = await query(
        `SELECT i.ticker, i.name, i.kind, i.sector,
                q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend,
                q.last_ex_date, q.last_pay_date, q.fetched_at
           FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
          WHERE i.ticker = $1`,
        [ticker]
      ));
    }
    if (!rows[0]) return res.status(404).json({ error: 'ticker_nao_encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
