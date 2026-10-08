// Middleware de autenticação: exige sessão válida e injeta req.user.
import { userForToken } from '../lib/auth.js';
import { config } from '../lib/config.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.session.cookieName];
    const user = await userForToken(token);
    if (!user) return res.status(401).json({ error: 'nao_autenticado' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
