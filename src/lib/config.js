// Lê variáveis de ambiente (.env) e entrega a configuração do app.
import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
  trustProxy: num(process.env.TRUST_PROXY, 0),

  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: bool(process.env.PG_SSL, false) ? { rejectUnauthorized: false } : false,
  },

  brapi: {
    baseUrl: process.env.BRAPI_BASE_URL || 'https://brapi.dev',
    token: process.env.BRAPI_TOKEN || '',
    plan: (process.env.BRAPI_PLAN || 'free').toLowerCase(), // free | startup | pro
  },

  quotes: {
    cron: process.env.QUOTE_REFRESH_CRON || '*/5 10-18 * * 1-5',
    staleSeconds: num(process.env.STALE_SECONDS, 120),
  },

  session: {
    ttlDays: num(process.env.SESSION_TTL_DAYS, 30),
    cookieName: 'carteira_session',
    cookieSecure: bool(process.env.COOKIE_SECURE, false),
  },
};

// A API de FIIs (P/VP) só existe no plano Pro da Brapi.
export const brapiHasFundamentals = config.brapi.plan === 'pro';
