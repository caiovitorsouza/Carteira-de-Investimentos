// Acesso ao banco para a carteira do usuário: posições, documentos (perfil,
// taxas, legacy) e histórico. Monta o mesmo "snapshot" que o front usava no
// localStorage, agora vindo do Postgres.
import { query, withTx } from '../lib/db.js';

// ---- leitura: monta o snapshot completo da carteira do usuário ----
export async function loadSnapshot(userId) {
  const [positions, docs, hist, ver] = await Promise.all([
    query(
      `SELECT p.id, p.kind, p.ticker, p.name, p.quantity, p.avg_price,
              p.invested_amount, p.meta,
              q.price, q.change_pct, q.dy_12m, q.last_dividend,
              q.last_ex_date, q.last_pay_date, q.pvp, q.fetched_at,
              i.name AS instrument_name, i.segment, i.logo_url
         FROM positions p
         LEFT JOIN instruments   i ON i.ticker = p.ticker
         LEFT JOIN market_quotes q ON q.ticker = p.ticker
        WHERE p.user_id = $1
        ORDER BY p.created_at`,
      [userId]
    ),
    query('SELECT key, data FROM user_documents WHERE user_id = $1', [userId]),
    query(
      `SELECT to_char(day,'YYYY-MM-DD') AS d, total_value AS v
         FROM portfolio_snapshots WHERE user_id = $1 ORDER BY day`,
      [userId]
    ),
    query('SELECT portfolio_version FROM users WHERE id = $1', [userId]),
  ]);

  const documents = {};
  for (const row of docs.rows) documents[row.key] = row.data;

  return {
    version: ver.rows[0]?.portfolio_version ?? 0,
    positions: positions.rows.map(shapePosition),
    profile: documents.profile ?? null,
    legacy: documents.legacy ?? null,
    settings: documents.settings ?? null,
    hist: hist.rows,
  };
}

// Junta o que o usuário digitou (quantidade, preço médio) com a cotação do cache.
function shapePosition(r) {
  const meta = r.meta || {};
  if (r.kind === 'fii' || r.kind === 'acao') {
    // Preço atual: só preenche se o backend tem cotação. Nulo quando NÃO tem
    // — o frontend diferencia e mostra 'cotação indisponível' em vez de usar
    // o preço médio digitado como se fosse cotação atual.
    const hasQuote = r.price != null;
    return {
      id: r.id, kind: r.kind, ticker: r.ticker,
      name: r.name || r.instrument_name,
      segment: meta.segment || r.segment, // preferência: escolha do usuário
      logo: r.logo_url,
      q: Number(r.quantity), c: Number(r.avg_price),
      a: hasQuote ? Number(r.price) : null, // null = sem cotação (frontend trata)
      noQuote: !hasQuote, // flag explícita pro frontend
      d: r.last_dividend != null ? Number(r.last_dividend) : (meta.d ?? 0),
      dy12: r.dy_12m, pvp: r.pvp, changePct: r.change_pct,
      dcom: r.last_ex_date, dpag: r.last_pay_date,
      t: meta.t || '', rec: meta.rec || 0,
      quotedAt: r.fetched_at,
    };
  }
  // renda fixa
  return { id: r.id, kind: r.kind, nome: r.name, ap: Number(r.invested_amount), ...meta };
}

// ---- escrita: substitui a carteira inteira, com checagem de versão (otimista) ----
export async function saveSnapshot(userId, incoming, expectedVersion) {
  return withTx(async (client) => {
    const cur = await client.query(
      'SELECT portfolio_version FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const version = cur.rows[0]?.portfolio_version ?? 0;
    if (expectedVersion != null && expectedVersion !== version) {
      const err = new Error('conflito_de_versao');
      err.code = 'VERSION_CONFLICT';
      err.current = version;
      throw err;
    }

    await client.query('DELETE FROM positions WHERE user_id = $1', [userId]);
    for (const p of incoming.positions || []) {
      await insertPosition(client, userId, p);
    }

    for (const key of ['profile', 'legacy', 'settings']) {
      if (incoming[key] === undefined) continue;
      if (incoming[key] === null) {
        await client.query('DELETE FROM user_documents WHERE user_id=$1 AND key=$2', [userId, key]);
      } else {
        await client.query(
          `INSERT INTO user_documents (user_id, key, data) VALUES ($1,$2,$3)
             ON CONFLICT (user_id, key) DO UPDATE SET data=$3, updated_at=now()`,
          [userId, key, incoming[key]]
        );
      }
    }

    const next = version + 1;
    await client.query('UPDATE users SET portfolio_version=$2 WHERE id=$1', [userId, next]);
    return next;
  });
}

function insertPosition(client, userId, p) {
  const isMarket = p.kind === 'fii' || p.kind === 'acao';
  const meta = isMarket
    ? {
        t: p.t || '', rec: p.rec || 0,
        ...(p.d != null ? { d: p.d } : {}),
        ...(p.segment ? { segment: p.segment } : {}),
      }
    : stripFixa(p);
  return client.query(
    `INSERT INTO positions
       (id, user_id, kind, ticker, name, quantity, avg_price, invested_amount, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      p.id, userId, p.kind,
      isMarket ? String(p.ticker).toUpperCase() : null,
      isMarket ? (p.name || null) : (p.nome || null),
      isMarket ? p.q : null,
      isMarket ? p.c : null,
      isMarket ? null : p.ap,
      meta,
    ]
  );
}

// Renda fixa: tudo que não é coluna própria vai para `meta` (taxa, vencimento...).
function stripFixa(p) {
  const { id, kind, nome, ap, ...rest } = p;
  return rest;
}

// Grava o ponto de patrimônio do dia (gráfico de evolução).
export const upsertDailySnapshot = (userId, day, total) =>
  query(
    `INSERT INTO portfolio_snapshots (user_id, day, total_value) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, day) DO UPDATE SET total_value = EXCLUDED.total_value`,
    [userId, day, total]
  );

// Todos os tickers de mercado que aparecem em alguma carteira (para o motor atualizar).
export async function allPortfolioTickers() {
  const { rows } = await query(
    `SELECT DISTINCT ticker FROM positions WHERE ticker IS NOT NULL`
  );
  return rows.map((r) => r.ticker);
}
