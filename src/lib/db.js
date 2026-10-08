// Pool de conexões PostgreSQL e helpers de query/transação.
import pg from 'pg';
import { config } from './config.js';

// Numéricos do Postgres chegam como string por padrão (para não perder precisão).
// Aqui convertemos para Number, já que os valores da carteira cabem com folga.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool:', err.message);
});

export const query = (text, params) => pool.query(text, params);

// Executa uma função dentro de uma transação, com COMMIT/ROLLBACK automático.
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
