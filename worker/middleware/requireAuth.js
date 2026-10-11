// Middleware Hono que exige sessão válida.
// Lê o cookie, valida no banco, injeta `c.set('user', ...)`.
import { getCookie } from 'hono/cookie';
import { userForToken } from '../lib/auth.js';

export async function requireAuth(c, next) {
  const cfg = c.get('cfg');
  const sql = c.get('sql');
  try {
    const token = getCookie(c, cfg.session.cookieName);
    const user = await userForToken(sql, token);
    if (!user) return c.json({ error: 'nao_autenticado' }, 401);
    c.set('user', user);
    await next();
  } catch (err) {
    console.error('[requireAuth]', err.message);
    return c.json({ error: 'erro_interno' }, 500);
  }
}
