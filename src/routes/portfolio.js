// Rotas da carteira: carregar, salvar e forçar atualização de cotações.
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadSnapshot, saveSnapshot, upsertDailySnapshot } from '../repos/portfolio.js';
import { refreshTickers } from '../services/quotes.js';

export const portfolioRouter = Router();
portfolioRouter.use(requireAuth);

// GET /api/portfolio -> snapshot completo (posições + cotações + perfil + histórico).
portfolioRouter.get('/', async (req, res, next) => {
  try {
    res.json(await loadSnapshot(req.user.id));
  } catch (err) { next(err); }
});

// PUT /api/portfolio -> substitui a carteira. Envie { version, positions, profile... }.
// Responde 409 se outro aparelho salvou antes (controle otimista).
portfolioRouter.put('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.positions)) return res.status(400).json({ error: 'positions_invalido' });
    const newVersion = await saveSnapshot(req.user.id, body, body.version);
    res.json({ version: newVersion });
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT')
      return res.status(409).json({ error: 'conflito', current: err.current });
    next(err);
  }
});

// POST /api/portfolio/refresh -> atualiza agora os preços dos ativos da carteira.
portfolioRouter.post('/refresh', async (req, res, next) => {
  try {
    const snap = await loadSnapshot(req.user.id);
    const tickers = snap.positions.filter((p) => p.ticker).map((p) => p.ticker);
    const result = await refreshTickers(tickers);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/portfolio/snapshot -> registra o ponto de patrimônio do dia (gráfico).
portfolioRouter.post('/snapshot', async (req, res, next) => {
  try {
    const total = Number(req.body?.total);
    if (!isFinite(total)) return res.status(400).json({ error: 'total_invalido' });
    const day = new Date().toISOString().slice(0, 10);
    await upsertDailySnapshot(req.user.id, day, total);
    res.json({ ok: true, day });
  } catch (err) { next(err); }
});
