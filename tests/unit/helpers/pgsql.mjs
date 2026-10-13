// Banco de TESTE em memória (PGlite = Postgres real em WASM), com o db/schema.sql completo.
// `makeSql` expõe o subconjunto do postgres.js que o código do Worker usa:
// sql`...` com parâmetros, fragmentos aninhados e sql.json(). Nada de rede nem de banco real.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const SCHEMA = fs.readFileSync(fileURLToPath(new URL('../../../db/schema.sql', import.meta.url)), 'utf8');

class Fragment { constructor(strings, values) { this.strings = strings; this.values = values; } }
class JsonParam { constructor(v) { this.v = v; } }

function compile(frag, params) {
  let text = '';
  frag.strings.forEach((s, i) => {
    text += s;
    if (i >= frag.values.length) return;
    const v = frag.values[i];
    if (v instanceof Fragment) text += compile(v, params);
    else {
      params.push(v instanceof JsonParam ? JSON.stringify(v.v) : (v === undefined ? null : v));
      text += '$' + params.length;
    }
  });
  return text;
}

// Adaptador do subconjunto do postgres.js usado pelo Worker. `exec` é o PGlite ou uma transação dele;
// sql.begin usa a transação exclusiva do PGlite (uma conexão só: serializa, não prova concorrência real —
// isso é feito em concurrency.pg.test.mjs com um Postgres de verdade).
function adapter(db, exec) {
  const sql = (strings, ...values) => {
    const frag = new Fragment(strings, values);
    Object.defineProperty(frag, 'then', {
      value: (res, rej) => { const params = []; const text = compile(frag, params); return exec.query(text, params).then((r) => r.rows).then(res, rej); },
      enumerable: false,
    });
    return frag;
  };
  sql.json = (v) => new JsonParam(v);
  sql.begin = (fn) => (exec === db ? db.transaction((tx) => fn(adapter(db, tx))) : fn(sql));
  return sql;
}

export async function makeDb() {
  const db = new PGlite({ extensions: { citext, pg_trgm, pgcrypto } });
  await db.exec(SCHEMA);
  return { db, sql: adapter(db, db) };
}

// Banco vazio (sem schema) com o mesmo adaptador de `sql`: usado nos testes de migração.
export async function makeRawDb() {
  const db = new PGlite({ extensions: { citext, pg_trgm, pgcrypto } });
  return { db, sql: adapter(db, db) };
}
const rel = (p) => fileURLToPath(new URL(p, import.meta.url));
export const FINANCE_BLOCK = SCHEMA.slice(SCHEMA.indexOf('-- >>> FINANCE'), SCHEMA.indexOf('-- <<< FINANCE') + '-- <<< FINANCE'.length);
export const OLD_SCHEMA = fs.readFileSync(rel('../fixtures/schema-before-finance.sql'), 'utf8');
export const ROLLBACK = fs.readFileSync(rel('../../../db/finance-rollback.sql'), 'utf8');
export const WATCHLIST_BLOCK = SCHEMA.slice(SCHEMA.indexOf('-- >>> WATCHLIST'), SCHEMA.indexOf('-- <<< WATCHLIST') + '-- <<< WATCHLIST'.length);
export const WATCHLIST_ROLLBACK = fs.readFileSync(rel('../../../db/watchlist-rollback.sql'), 'utf8');

export async function makeUser(sql, email) {
  const rows = await sql`INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id`;
  return rows[0].id;
}
