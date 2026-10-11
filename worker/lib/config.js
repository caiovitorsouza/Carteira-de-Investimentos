// Config pro Workers: tudo vem de `env` (bindings do wrangler.toml e secrets).
// Não existe process.env em Workers — a env é passada em cada request/scheduled.
// Essa função é um helper pra converter o `env` cru em uma config normalizada.

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(String(v)));
const num  = (v, d) => (v === undefined || v === '' ? d : Number(v));

export function makeConfig(env) {
  return {
    env: env.ENVIRONMENT || 'production',
    publicOrigin: env.PUBLIC_ORIGIN || 'https://carteira-de-investimentos.pages.dev',

    db: {
      // String de conexão do Supabase (Transaction Pooler). Formato:
      //   postgresql://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
      connectionString: env.DATABASE_URL,
    },

    brapi: {
      baseUrl: env.BRAPI_BASE_URL || 'https://brapi.dev',
      token: env.BRAPI_TOKEN || '',
      plan: (env.BRAPI_PLAN || 'free').toLowerCase(), // free | startup | pro
    },

    quotes: {
      staleSeconds: num(env.STALE_SECONDS, 120),
    },

    session: {
      ttlDays: num(env.SESSION_TTL_DAYS, 30),
      cookieName: 'carteira_session',
      // Cloudflare Workers sempre roda em HTTPS → cookie seguro por padrão.
      cookieSecure: bool(env.COOKIE_SECURE, true),
    },

    email: {
      enabled: bool(env.EMAIL_ENABLED, false),
      apiKey:  env.RESEND_API_KEY || '',
      from:    env.EMAIL_FROM || 'Carteira <onboarding@resend.dev>',
    },
  };
}

// A API de FIIs (P/VP) só existe no plano Pro da Brapi.
export const brapiHasFundamentals = (cfg) => cfg.brapi.plan === 'pro';
