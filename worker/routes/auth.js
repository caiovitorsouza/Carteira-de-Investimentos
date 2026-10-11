// Rotas de autenticação (Hono). Cadastro, login, logout, "quem sou eu".
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  hashPassword, verifyPassword, newSessionToken,
  createSession, destroySession, sessionCookieOptions,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = new Hono();

const emailOk = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Rate limit simples em memória (por isolado — bom o bastante pra brute force simples).
// Em produção pesada, trocar por KV ou Durable Object. Por enquanto, suficiente.
const attempts = new Map(); // ip -> { count, resetAt }
function rateLimit(ip, max = 20, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const cur = attempts.get(ip);
  if (!cur || now > cur.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count++;
  return true;
}

function clientIp(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0] || null;
}

authRouter.post('/register', async (c) => {
  const cfg = c.get('cfg');
  const sql = c.get('sql');
  const ip = clientIp(c);
  if (!rateLimit(ip || 'anon')) return c.json({ error: 'muitas_tentativas' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body || {};
  if (!emailOk(email)) return c.json({ error: 'email_invalido' }, 400);
  if (typeof password !== 'string' || password.length < 8) {
    return c.json({ error: 'senha_curta', message: 'Use ao menos 8 caracteres.' }, 400);
  }

  const hash = await hashPassword(password);
  let user;
  try {
    const rows = await sql`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})
      RETURNING id, email
    `;
    user = rows[0];
  } catch (e) {
    if (e.code === '23505') return c.json({ error: 'email_em_uso' }, 409);
    throw e;
  }

  const token = newSessionToken();
  const expires = await createSession(sql, user.id, token, cfg.session.ttlDays, {
    userAgent: c.req.header('user-agent'), ip,
  });
  setCookie(c, cfg.session.cookieName, token, sessionCookieOptions(cfg, expires));
  return c.json({ user: { id: user.id, email: user.email } }, 201);
});

authRouter.post('/login', async (c) => {
  const cfg = c.get('cfg');
  const sql = c.get('sql');
  const ip = clientIp(c);
  if (!rateLimit(ip || 'anon')) return c.json({ error: 'muitas_tentativas' }, 429);

  const { email, password } = await c.req.json().catch(() => ({}));
  const rows = await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${email || ''}
  `;
  const user = rows[0];

  // Hash dummy pra manter tempo constante quando o email não existe.
  // IMPORTANTE: o iter aqui tem que bater com PBKDF2_ITER (100000) — se for
  // acima disso, Workers rejeita (NotSupportedError no verifyPassword).
  const ref = user?.password_hash
    || 'pbkdf2$sha256$100000$ZmZmZmZmZmZmZmZmZmZmZg==$ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmY=';
  const ok = await verifyPassword(ref, password || '');
  if (!user || !ok) return c.json({ error: 'credenciais_invalidas' }, 401);

  await sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`;
  const token = newSessionToken();
  const expires = await createSession(sql, user.id, token, cfg.session.ttlDays, {
    userAgent: c.req.header('user-agent'), ip,
  });
  setCookie(c, cfg.session.cookieName, token, sessionCookieOptions(cfg, expires));
  return c.json({ user: { id: user.id, email: user.email } });
});

authRouter.post('/logout', async (c) => {
  const cfg = c.get('cfg');
  const sql = c.get('sql');
  const token = getCookie(c, cfg.session.cookieName);
  await destroySession(sql, token);
  deleteCookie(c, cfg.session.cookieName, { path: '/' });
  return c.json({ ok: true });
});

authRouter.get('/me', requireAuth, (c) => {
  const u = c.get('user');
  return c.json({ user: { id: u.id, email: u.email } });
});
