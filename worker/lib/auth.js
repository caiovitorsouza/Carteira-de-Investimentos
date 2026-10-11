// Autenticação em Workers: hash de senha com PBKDF2 (Web Crypto API) +
// tokens de sessão aleatórios. Substituição do `argon2` (código nativo que
// não roda em Workers) por PBKDF2-SHA256 com 210k iterações — padrão OWASP
// 2024 pra PBKDF2.
//
// Formato do hash armazenado no banco:
//   pbkdf2$sha256$<iter>$<salt_b64>$<hash_b64>
// (compatível com Werkzeug, Django etc. — mas aqui parseamos manualmente)

const PBKDF2_ITER = 210000;
const PBKDF2_KEYLEN = 32; // bytes = 256 bits
const SALT_LEN = 16;      // bytes

const te = new TextEncoder();

// ---- base64 helpers ----
function b64encode(bytes) {
  let s = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function b64decode(str) {
  const bin = atob(str);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function b64urlEncode(bytes) {
  return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pbkdf2(password, salt, iterations, keylen) {
  const key = await crypto.subtle.importKey(
    'raw',
    te.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    keylen * 8
  );
  return new Uint8Array(bits);
}

// Hash novo (sempre PBKDF2 — argon2 fica como legacy, só reconhecido na
// verificação pra migração).
export async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await pbkdf2(plain, salt, PBKDF2_ITER, PBKDF2_KEYLEN);
  return `pbkdf2$sha256$${PBKDF2_ITER}$${b64encode(salt)}$${b64encode(hash)}`;
}

// Comparação em tempo constante (evita timing attack).
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Verifica senha. Reconhece:
//  - pbkdf2$sha256$<iter>$<salt_b64>$<hash_b64>   (formato Workers)
//  - $argon2id$...                                 (legacy; rejeita, retorna false)
// Como o usuário disse "começar do zero" na migração, não precisamos manter
// argon2. Mas deixamos a detecção pra não quebrar se vier algo estranho.
export async function verifyPassword(stored, plain) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('pbkdf2$sha256$')) {
    const [, , iterStr, saltB64, hashB64] = stored.split('$');
    const iter = parseInt(iterStr, 10);
    const salt = b64decode(saltB64);
    const expected = b64decode(hashB64);
    const got = await pbkdf2(plain, salt, iter, expected.length);
    return timingSafeEqual(got, expected);
  }
  // Hash argon2 legacy (não deveria aparecer no banco novo do Supabase):
  if (stored.startsWith('$argon2')) {
    console.warn('[auth] hash argon2 legacy — pedir reset de senha ao usuário.');
    return false;
  }
  return false;
}

// ---- Tokens de sessão ----
// O token em texto puro vai pro cookie; no banco guardamos só o SHA-256 dele.
export function newSessionToken() {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Bytes(s) {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(s));
  return new Uint8Array(buf);
}

// postgres.js aceita Buffer ou Uint8Array para colunas bytea.
// No Workers só temos Uint8Array (sem Buffer), e postgres.js lida.
export async function tokenHash(token) {
  return await sha256Bytes(token);
}

// ---- Operações de sessão no banco ----
export async function createSession(sql, userId, token, ttlDays, { userAgent, ip } = {}) {
  const expires = new Date(Date.now() + ttlDays * 86400000);
  const hash = await tokenHash(token);
  await sql`
    INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (${userId}, ${hash}, ${userAgent || null}, ${ip || null}, ${expires})
  `;
  return expires;
}

export async function userForToken(sql, token) {
  if (!token) return null;
  const hash = await tokenHash(token);
  const rows = await sql`
    SELECT u.id, u.email, u.portfolio_version
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ${hash} AND s.expires_at > now()
  `;
  return rows[0] || null;
}

export async function destroySession(sql, token) {
  if (!token) return;
  const hash = await tokenHash(token);
  await sql`DELETE FROM sessions WHERE token_hash = ${hash}`;
}

// ---- Helpers de cookie (usados nas rotas via Hono) ----
export function sessionCookieOptions(cfg, expires) {
  return {
    httpOnly: true,
    secure: cfg.session.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    expires,
  };
}
