// Rotas da carteira: carregar, salvar e forçar atualização de cotações.
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadSnapshot, saveSnapshot, upsertDailySnapshot } from '../repos/portfolio.js';
import { refreshTickers } from '../services/quotes.js';

export const portfolioRouter = Router();
portfolioRouter.use(requireAuth);

// Horário de pregão (10h-18h BRT, dias úteis). Fora disso, não vale a pena
// buscar porque os preços estão congelados no fechamento anterior mesmo.
function emHorarioPregao() {
  const now = new Date();
  // BRT = UTC-3 (não considera horário de verão porque Brasil não tem mais desde 2019)
  const h = (now.getUTCHours() - 3 + 24) % 24;
  const dow = now.getUTCDay();
  return dow >= 1 && dow <= 5 && h >= 10 && h < 18;
}

const STALE_MS = 10 * 60 * 1000; // 10 minutos

// GET /api/portfolio -> snapshot completo (posições + cotações + perfil + histórico).
// Se durante pregão algum ticker tiver cotação velha (>10min), força refresh
// ANTES de responder — garante que o usuário sempre vê preços frescos no load,
// mesmo que o scheduler estivesse dormindo (plano free do Render).
portfolioRouter.get('/', async (req, res, next) => {
  try {
    let snap = await loadSnapshot(req.user.id);

    if (emHorarioPregao()) {
      const agora = Date.now();
      const velhos = snap.positions
        .filter((p) => p.ticker)
        .filter((p) => !p.quotedAt || agora - new Date(p.quotedAt).getTime() > STALE_MS)
        .map((p) => p.ticker);

      if (velhos.length > 0) {
        console.log('[portfolio] auto-refresh em', velhos.length, 'tickers velhos:', velhos.join(','));
        try {
          await refreshTickers(velhos);
          snap = await loadSnapshot(req.user.id);
        } catch (e) {
          console.warn('[portfolio] auto-refresh falhou:', e.message);
          // continua respondendo com os dados antigos — melhor do que erro
        }
      }
    }

    res.json(snap);
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
