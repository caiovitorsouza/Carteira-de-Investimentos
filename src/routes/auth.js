// Rotas de autenticação: cadastro, login, logout e "quem sou eu".
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../lib/db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie,
} from '../lib/auth.js';
import { config } from '../lib/config.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

// Protege contra força bruta: 20 tentativas por IP a cada 15 min.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });

const emailOk = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const meta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

authRouter.post('/register', limiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!emailOk(email)) return res.status(400).json({ error: 'email_invalido' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'senha_curta', message: 'Use ao menos 8 caracteres.' });

    const hash = await hashPassword(password);
    let user;
    try {
      const { rows } = await query(
        'INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id, email',
        [email, hash]
      );
      user = rows[0];
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'email_em_uso' });
      throw e;
    }

    const { token, expires } = await createSession(user.id, meta(req));
    setSessionCookie(res, token, expires);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (err) { next(err); }
});

authRouter.post('/login', limiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await query(
      'SELECT id, email, password_hash FROM users WHERE email = $1', [email || '']
    );
    const user = rows[0];
    // Sempre verifica um hash (mesmo sem usuário) para não vazar tempo de resposta.
    const ref = user?.password_hash || '$argon2id$v=19$m=19456,t=2,p=1$Zm9v$Zm9v';
    const ok = await verifyPassword(ref, password || '');
    if (!user || !ok) return res.status(401).json({ error: 'credenciais_invalidas' });

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const { token, expires } = await createSession(user.id, meta(req));
    setSessionCookie(res, token, expires);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) { next(err); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req.cookies?.[config.session.cookieName]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});
