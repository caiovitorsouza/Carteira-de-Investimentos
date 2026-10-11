// Rotas de mercado (Hono). Igual à versão Express, só muda a sintaxe.
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { refreshTickers } from '../services/quotes.js';
import { loadRates, refreshRates } from '../services/rates.js';

export const marketRouter = new Hono();
marketRouter.use('*', requireAuth);

// GET /api/market/rates
marketRouter.get('/rates', async (c) => {
  const sql = c.get('sql');
  const { rates, stale } = await loadRates(sql);
  // Dispara refresh em background se stale (sem bloquear a resposta)
  if (stale) {
    const ctx = c.executionCtx;
    ctx.waitUntil(refreshRates(sql).catch((e) => console.warn('[rates] bg:', e.message)));
  }
  return c.json(rates);
});

// POST /api/market/rates/refresh
marketRouter.post('/rates/refresh', async (c) => {
  const sql = c.get('sql');
  const r = await refreshRates(sql);
  const { rates } = await loadRates(sql);
  return c.json({ ...r, rates });
});

// GET /api/market/explore?filter=volume|alta|dy|pvp|diversificar&kind=fii|acao
marketRouter.get('/explore', async (c) => {
  const sql = c.get('sql');
  const user = c.get('user');
  const filter = String(c.req.query('filter') || 'volume');
  const kindQ = c.req.query('kind');
  const kind = ['fii', 'acao'].includes(kindQ) ? kindQ : 'fii';
  const minVolume = 100000;

  let rows;
  if (filter === 'volume') {
    rows = await sql`
      SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
             q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
        FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
       WHERE i.active AND i.kind = ${kind}
       ORDER BY i.avg_volume DESC NULLS LAST
       LIMIT 5
    `;
  } else if (filter === 'alta') {
    rows = await sql`
      SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
             q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
        FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
       WHERE i.active AND i.kind = ${kind}
         AND q.change_pct IS NOT NULL
         AND COALESCE(i.avg_volume, 0) > ${minVolume}
       ORDER BY q.change_pct DESC
       LIMIT 15
    `;
  } else if (filter === 'dy') {
    rows = await sql`
      SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
             q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
        FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
       WHERE i.active AND i.kind = ${kind}
         AND q.dy_12m IS NOT NULL AND q.dy_12m > 0
         AND COALESCE(i.avg_volume, 0) > ${minVolume}
       ORDER BY q.dy_12m DESC
       LIMIT 15
    `;
  } else if (filter === 'pvp') {
    if (kind !== 'fii') return c.json({ filter, kind, results: [] });
    rows = await sql`
      SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
             q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
        FROM instruments i JOIN market_quotes q ON q.ticker = i.ticker
       WHERE i.active AND i.kind = 'fii'
         AND q.pvp IS NOT NULL AND q.pvp > 0
         AND COALESCE(i.avg_volume, 0) > ${minVolume}
       ORDER BY q.pvp ASC
       LIMIT 15
    `;
  } else if (filter === 'diversificar') {
    // dinâmico: coluna segment pra FII, sector pra ação
    const column = kind === 'fii' ? 'segment' : 'sector';
    const has = kind === 'fii'
      ? await sql`
          SELECT DISTINCT i.segment AS cat
            FROM positions p JOIN instruments i ON i.ticker = p.ticker
           WHERE p.user_id = ${user.id} AND p.kind = ${kind} AND i.segment IS NOT NULL`
      : await sql`
          SELECT DISTINCT i.sector AS cat
            FROM positions p JOIN instruments i ON i.ticker = p.ticker
           WHERE p.user_id = ${user.id} AND p.kind = ${kind} AND i.sector IS NOT NULL`;
    const jaTem = has.map(r => r.cat).filter(Boolean);
    const excludeArr = jaTem.length > 0 ? jaTem : ['__none__'];
    rows = kind === 'fii'
      ? await sql`
          SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
                 q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
            FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
           WHERE i.active AND i.kind = ${kind}
             AND i.segment IS NOT NULL
             AND i.segment <> ALL(${excludeArr}::text[])
             AND COALESCE(i.avg_volume, 0) > ${minVolume}
           ORDER BY i.avg_volume DESC NULLS LAST
           LIMIT 15`
      : await sql`
          SELECT i.ticker, i.name, i.kind, i.segment, i.sector, i.logo_url, i.avg_volume,
                 q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend
            FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
           WHERE i.active AND i.kind = ${kind}
             AND i.sector IS NOT NULL
             AND i.sector <> ALL(${excludeArr}::text[])
             AND COALESCE(i.avg_volume, 0) > ${minVolume}
           ORDER BY i.avg_volume DESC NULLS LAST
           LIMIT 15`;
  } else {
    return c.json({ error: 'filter_invalido' }, 400);
  }

  return c.json({ filter, kind, results: rows });
});

// GET /api/market/search?q=mxrf
marketRouter.get('/search', async (c) => {
  const sql = c.get('sql');
  const q = String(c.req.query('q') || '').trim().toUpperCase();
  if (q.length < 1) return c.json({ results: [] });
  const prefix = q + '%';
  const contains = '%' + q + '%';
  const rows = await sql`
    SELECT ticker, name, kind, sector, logo_url
      FROM instruments
     WHERE active
       AND (ticker LIKE ${prefix} OR name ILIKE ${contains})
       AND kind IN ('fii','acao','etf')
     ORDER BY (ticker = ${q}) DESC,
              (ticker LIKE ${prefix}) DESC,
              avg_volume DESC NULLS LAST
     LIMIT 12
  `;
  return c.json({ results: rows });
});

// GET /api/market/quote/:ticker
marketRouter.get('/quote/:ticker', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');
  const ticker = String(c.req.param('ticker') || '').toUpperCase();

  let rows = await sql`
    SELECT i.ticker, i.name, i.kind, i.sector,
           q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend,
           q.last_ex_date, q.last_pay_date, q.fetched_at
      FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
     WHERE i.ticker = ${ticker}
  `;

  if (!rows[0] || rows[0].price == null) {
    await refreshTickers(sql, cfg, [ticker]).catch(() => {});
    rows = await sql`
      SELECT i.ticker, i.name, i.kind, i.sector,
             q.price, q.change_pct, q.dy_12m, q.pvp, q.last_dividend,
             q.last_ex_date, q.last_pay_date, q.fetched_at
        FROM instruments i LEFT JOIN market_quotes q ON q.ticker = i.ticker
       WHERE i.ticker = ${ticker}
    `;
  }
  if (!rows[0]) return c.json({ error: 'ticker_nao_encontrado' }, 404);
  return c.json(rows[0]);
});
