// Driver Postgres pra Cloudflare Workers.
// Usa postgres.js (porsager/postgres) — mesma API elegante de tagged templates,
// funciona em Workers com nodejs_compat. Para Supabase, usamos o Transaction
// Pooler (porta 6543) e desligamos prepared statements (não suportado em
// transaction pooler).
//
// Cada invocação do Worker (fetch ou scheduled) cria sua própria conexão com
// o Pooler, roda as queries, e encerra via ctx.waitUntil(sql.end()).
// Isso é o padrão recomendado em ambientes serverless.

import postgres from 'postgres';

export function makeSql(env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente — configure como secret no Worker.');
  }
  return postgres(env.DATABASE_URL, {
    // Transaction pooler do Supabase NÃO suporta prepared statements.
    prepare: false,
    // Conexões curtas (fica aberto só durante a request).
    idle_timeout: 20,
    max: 5,
    // Converte NUMERIC/BIGINT pra Number (precisão sobra pra carteira).
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: String,
        parse: (v) => (v === null ? null : parseFloat(v)),
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: String,
        parse: (v) => (v === null ? null : parseInt(v, 10)),
      },
    },
    // Transforma camelCase pra snake_case? Não — queremos as colunas puras.
    transform: { undefined: null },
  });
}

// Fecha a conexão (chame via ctx.waitUntil pra não bloquear a response).
export const closeSql = (sql) => sql?.end({ timeout: 5 }).catch(() => {});
