// Rotas de conta do usuário: preferências de e-mail (autenticada) e
// unsubscribe público (via token, sem login).
import { Router } from 'express';
import { query } from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { unsubscribePage } from '../services/email-templates.js';
import { sendTestEmail } from '../services/email-jobs.js';

export const userRouter = Router();

// GET /api/user/email-prefs - lê preferências do usuário logado
userRouter.get('/email-prefs', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT email_prefs, first_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    const r = rows[0] || {};
    res.json({
      weekly: !!(r.email_prefs?.weekly),
      monthly: !!(r.email_prefs?.monthly),
      first_name: r.first_name || null,
    });
  } catch (err) { next(err); }
});

// PUT /api/user/email-prefs - atualiza
userRouter.put('/email-prefs', requireAuth, async (req, res, next) => {
  try {
    const { weekly, monthly, first_name } = req.body || {};
    const prefs = { weekly: !!weekly, monthly: !!monthly };
    const name = (first_name && String(first_name).trim().slice(0, 60)) || null;
    await query(
      `UPDATE users SET email_prefs = $2, first_name = COALESCE($3, first_name) WHERE id = $1`,
      [req.user.id, prefs, name]
    );
    res.json({ ok: true, ...prefs, first_name: name });
  } catch (err) { next(err); }
});

// POST /api/user/email-test - manda um e-mail de teste pra si mesmo
userRouter.post('/email-test', requireAuth, async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || 'weekly');
    if (!['weekly', 'monthly'].includes(kind)) return res.status(400).json({ error: 'kind_invalido' });
    const r = await sendTestEmail(req.user.id, kind);
    res.json({ ok: !r.error, ...r });
  } catch (err) { next(err); }
});

// GET /api/user/unsubscribe/:token?kind=weekly|monthly|all - PÚBLICO
// Entrega uma página HTML (não JSON) porque é link clicado no e-mail.
userRouter.get('/unsubscribe/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const kind = String(req.query.kind || 'all');
  if (!token || !/^[0-9a-f-]{30,40}$/i.test(token)) {
    return res.status(400).type('html').send(unsubscribePage({ ok: false }));
  }
  try {
    const { rows } = await query(
      `SELECT id, email, email_prefs FROM users WHERE unsub_token = $1`,
      [token]
    );
    const u = rows[0];
    if (!u) return res.status(404).type('html').send(unsubscribePage({ ok: false }));
    const prefs = u.email_prefs || {};
    if (kind === 'weekly') prefs.weekly = false;
    else if (kind === 'monthly') prefs.monthly = false;
    else { prefs.weekly = false; prefs.monthly = false; }
    await query(`UPDATE users SET email_prefs = $2 WHERE id = $1`, [u.id, prefs]);
    res.type('html').send(unsubscribePage({ ok: true, kind, email: u.email }));
  } catch (err) {
    console.warn('[unsub] erro:', err.message);
    res.status(500).type('html').send(unsubscribePage({ ok: false }));
  }
});
