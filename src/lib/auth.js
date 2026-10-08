// Autenticação: hash de senha (argon2id), tokens de sessão e cookie.
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

export const hashPassword = (plain) =>
  argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const verifyPassword = (hash, plain) => argon2.verify(hash, plain).catch(() => false);

// O token vai no cookie; no banco guardamos só o SHA-256 dele.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

export async function createSession(userId, { userAgent, ip } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.session.ttlDays * 86400000);
  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sha256(token), userAgent || null, ip || null, expires]
  );
  return { token, expires };
}

export async function userForToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.email, u.portfolio_version
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  return rows[0] || null;
}

export const destroySession = (token) =>
  token ? query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]) : null;

export function setSessionCookie(res, token, expires) {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export const clearSessionCookie = (res) =>
  res.clearCookie(config.session.cookieName, { path: '/' });
