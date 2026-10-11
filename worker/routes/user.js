// Rotas de conta: preferências de e-mail + unsubscribe público.
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { unsubscribePage } from '../services/email-templates.js';
import { sendTestEmail } from '../services/email-jobs.js';

export const userRouter = new Hono();

userRouter.get('/email-prefs', requireAuth, async (c) => {
  const sql = c.get('sql');
  const user = c.get('user');
  const rows = await sql`SELECT email_prefs, first_name FROM users WHERE id = ${user.id}`;
  const r = rows[0] || {};
  return c.json({
    weekly: !!(r.email_prefs?.weekly),
    monthly: !!(r.email_prefs?.monthly),
    first_name: r.first_name || null,
  });
});

userRouter.put('/email-prefs', requireAuth, async (c) => {
  const sql = c.get('sql');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { weekly, monthly, first_name } = body || {};
  const prefs = { weekly: !!weekly, monthly: !!monthly };
  const name = (first_name && String(first_name).trim().slice(0, 60)) || null;
  await sql`
    UPDATE users
       SET email_prefs = ${sql.json(prefs)},
           first_name  = COALESCE(${name}, first_name)
     WHERE id = ${user.id}
  `;
  return c.json({ ok: true, ...prefs, first_name: name });
});

userRouter.post('/email-test', requireAuth, async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const kind = String(body?.kind || 'weekly');
  if (!['weekly', 'monthly'].includes(kind)) return c.json({ error: 'kind_invalido' }, 400);
  const r = await sendTestEmail(sql, cfg, user.id, kind);
  return c.json({ ok: !r.error, ...r });
});

// GET /api/user/unsubscribe/:token?kind=weekly|monthly|all  (PÚBLICO, retorna HTML)
userRouter.get('/unsubscribe/:token', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');
  const token = String(c.req.param('token') || '').trim();
  const kind = String(c.req.query('kind') || 'all');

  if (!token || !/^[0-9a-f-]{30,40}$/i.test(token)) {
    return c.html(unsubscribePage(cfg, { ok: false }), 400);
  }
  try {
    const rows = await sql`
      SELECT id, email, email_prefs FROM users WHERE unsub_token = ${token}
    `;
    const u = rows[0];
    if (!u) return c.html(unsubscribePage(cfg, { ok: false }), 404);
    const prefs = u.email_prefs || {};
    if (kind === 'weekly') prefs.weekly = false;
    else if (kind === 'monthly') prefs.monthly = false;
    else { prefs.weekly = false; prefs.monthly = false; }
    await sql`UPDATE users SET email_prefs = ${sql.json(prefs)} WHERE id = ${u.id}`;
    return c.html(unsubscribePage(cfg, { ok: true, kind, email: u.email }));
  } catch (err) {
    console.warn('[unsub] erro:', err.message);
    return c.html(unsubscribePage(cfg, { ok: false }), 500);
  }
});
