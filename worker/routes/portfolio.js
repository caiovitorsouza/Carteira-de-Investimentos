// Rotas da carteira (Hono).
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadSnapshot, saveSnapshot, upsertDailySnapshot } from '../repos/portfolio.js';
import { refreshTickers } from '../services/quotes.js';

export const portfolioRouter = new Hono();
portfolioRouter.use('*', requireAuth);

function emHorarioPregao() {
  const now = new Date();
  const h = (now.getUTCHours() - 3 + 24) % 24;
  const dow = now.getUTCDay();
  return dow >= 1 && dow <= 5 && h >= 10 && h < 18;
}

const STALE_MS = 10 * 60 * 1000;

// GET /api/portfolio — snapshot + auto-refresh de cotações velhas em pregão.
portfolioRouter.get('/', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');
  const user = c.get('user');

  let snap = await loadSnapshot(sql, user.id);

  if (emHorarioPregao()) {
    const agora = Date.now();
    const velhos = snap.positions
      .filter((p) => p.ticker)
      .filter((p) => !p.quotedAt || agora - new Date(p.quotedAt).getTime() > STALE_MS)
      .map((p) => p.ticker);

    if (velhos.length > 0) {
      console.log('[portfolio] auto-refresh em', velhos.length, 'tickers velhos:', velhos.join(','));
      try {
        await refreshTickers(sql, cfg, velhos);
        snap = await loadSnapshot(sql, user.id);
      } catch (e) {
        console.warn('[portfolio] auto-refresh falhou:', e.message);
      }
    }
  }
  return c.json(snap);
});

// PUT /api/portfolio — substitui carteira com controle otimista de versão.
portfolioRouter.put('/', async (c) => {
  const sql = c.get('sql');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.positions)) return c.json({ error: 'positions_invalido' }, 400);

  try {
    const newVersion = await saveSnapshot(sql, user.id, body, body.version);
    return c.json({ version: newVersion });
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') return c.json({ error: 'conflito', current: err.current }, 409);
    throw err;
  }
});

// POST /api/portfolio/refresh
portfolioRouter.post('/refresh', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');
  const user = c.get('user');
  const snap = await loadSnapshot(sql, user.id);
  const tickers = snap.positions.filter((p) => p.ticker).map((p) => p.ticker);
  const result = await refreshTickers(sql, cfg, tickers);
  return c.json(result);
});

// POST /api/portfolio/snapshot
portfolioRouter.post('/snapshot', async (c) => {
  const sql = c.get('sql');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const total = Number(body?.total);
  if (!isFinite(total)) return c.json({ error: 'total_invalido' }, 400);
  const day = new Date().toISOString().slice(0, 10);
  await upsertDailySnapshot(sql, user.id, day, total);
  return c.json({ ok: true, day });
});
