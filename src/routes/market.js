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

// GET /api/market/explore?filter=volume|alta|dy|pvp|diversificar&kind=fii|acao
// Lista pra descobrir ativos. NÃO é recomendação — só ordena por critérios
// objetivos (volume, variação, DY, P/VP). "diversificar" filtra pelos segmentos
// que o usuário ainda não tem na carteira.
marketRouter.get('/explore', async (req, res, next) => {
  try {
    const filter = String(req.query.filter || 'volume');
    const kind = ['fii', 'acao'].includes(req.query.kind) ? req.query.kind : 'fii';
    const minVolume = 100000; // filtra micro caps / FIIs esquecidos

    const baseCols = `
      i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
      q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
    `;

    let sql, params = [kind];

    if (filter === 'volume') {
      sql = `
        SELECT ${baseCols}
          FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
         WHERE i.active AND i.kind = $1
         ORDER BY i.avg_volume DESC NULLS LAST
         LIMIT 8`;
    } else if (filter === 'alta') {
      sql = `
        SELECT ${baseCols}
          FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
         WHERE i.active AND i.kind = $1
           AND q.change_pct IS NOT NULL
           AND COALESCE(i.avg_volume, 0) > ${minVolume}
         ORDER BY q.change_pct DESC
         LIMIT 15`;
    } else if (filter === 'dy') {
      sql = `
        SELECT ${baseCols}
          FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
         WHERE i.active AND i.kind = $1
           AND q.dy_12m IS NOT NULL AND q.dy_12m > 0
           AND COALESCE(i.avg_volume, 0) > ${minVolume}
         ORDER BY q.dy_12m DESC
         LIMIT 15`;
    } else if (filter === 'pvp') {
      // Só faz sentido pra FII
      if (kind !== 'fii') return res.json({ filter, kind, results: [] });
      sql = `
        SELECT ${baseCols}
          FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
         WHERE i.active AND i.kind = 'fii'
           AND q.pvp IS NOT NULL AND q.pvp > 0
           AND COALESCE(i.avg_volume, 0) > ${minVolume}
         ORDER BY q.pvp ASC
         LIMIT 15`;
      params = []; // sem kind, forçado 'fii' no WHERE
    } else if (filter === 'diversificar') {
      // Busca os segmentos/setores que o usuário JÁ tem
      const column = kind === 'fii' ? 'segment' : 'sector';
      const { rows: has } = await query(
        `SELECT DISTINCT i.${column} AS cat
           FROM positions p JOIN instruments i ON i.ticker = p.ticker
          WHERE p.user_id = $1 AND p.kind = $2 AND i.${column} IS NOT NULL`,
        [req.user.id, kind]
      );
      const jaTem = has.map(r => r.cat).filter(Boolean);
      const excludeArr = jaTem.length > 0 ? jaTem : ['__none__'];
      sql = `
        SELECT ${baseCols}
          FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
         WHERE i.active AND i.kind = $1
           AND i.${column} IS NOT NULL
           AND i.${column} <> ALL($2::text[])
           AND COALESCE(i.avg_volume, 0) > ${minVolume}
         ORDER BY i.avg_volume DESC NULLS LAST
         LIMIT 15`;
      params = [kind, excludeArr];
    } else {
      return res.status(400).json({ error: 'filter_invalido' });
    }

    const { rows } = await query(sql, params);
    res.json({ filter, kind, results: rows });
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
