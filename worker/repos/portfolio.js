// Repositório da carteira — adaptado pra postgres.js (tagged templates).
// Mesma lógica do src/repos/portfolio.js, só muda a sintaxe das queries.

export async function loadSnapshot(sql, userId) {
  const [positions, docs, hist, ver] = await Promise.all([
    sql`
      SELECT p.id, p.kind, p.ticker, p.name, p.quantity, p.avg_price,
             p.invested_amount, p.meta,
             q.price, q.change_pct, q.dy_12m, q.last_dividend,
             q.last_ex_date, q.last_pay_date, q.pvp, q.fetched_at,
             i.name AS instrument_name, i.segment, i.logo_url
        FROM positions p
        LEFT JOIN instruments   i ON i.ticker = p.ticker
        LEFT JOIN market_quotes q ON q.ticker = p.ticker
       WHERE p.user_id = ${userId}
       ORDER BY p.created_at
    `,
    sql`SELECT key, data FROM user_documents WHERE user_id = ${userId}`,
    sql`
      SELECT to_char(day,'YYYY-MM-DD') AS d, total_value AS v
        FROM portfolio_snapshots WHERE user_id = ${userId} ORDER BY day
    `,
    sql`SELECT portfolio_version FROM users WHERE id = ${userId}`,
  ]);

  const documents = {};
  for (const row of docs) documents[row.key] = row.data;

  return {
    version: ver[0]?.portfolio_version ?? 0,
    positions: positions.map(shapePosition),
    profile: documents.profile ?? null,
    legacy: documents.legacy ?? null,
    settings: documents.settings ?? null,
    hist,
  };
}

function shapePosition(r) {
  const meta = r.meta || {};
  if (r.kind === 'fii' || r.kind === 'acao') {
    const hasQuote = r.price != null;
    return {
      id: r.id, kind: r.kind, ticker: r.ticker,
      name: r.name || r.instrument_name,
      segment: meta.segment || r.segment,
      sector:  meta.sector  || null,
      logo: r.logo_url,
      q: Number(r.quantity), c: Number(r.avg_price),
      a: hasQuote ? Number(r.price) : null,
      noQuote: !hasQuote,
      d: r.last_dividend != null ? Number(r.last_dividend) : (meta.d ?? 0),
      dy12: r.dy_12m, pvp: r.pvp, changePct: r.change_pct,
      dcom: r.last_ex_date, dpag: r.last_pay_date,
      t: meta.t || '', rec: meta.rec || 0,
      quotedAt: r.fetched_at,
    };
  }
  return { id: r.id, kind: r.kind, nome: r.name, ap: Number(r.invested_amount), ...meta };
}

// Salva a carteira inteira com controle de versão (otimista).
// Usa transação para garantir atomicidade (DELETE + INSERTs + bump).
export async function saveSnapshot(sql, userId, incoming, expectedVersion) {
  return await sql.begin(async (tx) => {
    const cur = await tx`
      SELECT portfolio_version FROM users WHERE id = ${userId} FOR UPDATE
    `;
    const version = cur[0]?.portfolio_version ?? 0;
    if (expectedVersion != null && expectedVersion !== version) {
      const err = new Error('conflito_de_versao');
      err.code = 'VERSION_CONFLICT';
      err.current = version;
      throw err;
    }

    await tx`DELETE FROM positions WHERE user_id = ${userId}`;
    for (const p of incoming.positions || []) {
      await insertPosition(tx, userId, p);
    }

    for (const key of ['profile', 'legacy', 'settings']) {
      if (incoming[key] === undefined) continue;
      if (incoming[key] === null) {
        await tx`DELETE FROM user_documents WHERE user_id = ${userId} AND key = ${key}`;
      } else {
        await tx`
          INSERT INTO user_documents (user_id, key, data)
          VALUES (${userId}, ${key}, ${sql.json(incoming[key])})
          ON CONFLICT (user_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
        `;
      }
    }

    const next = version + 1;
    await tx`UPDATE users SET portfolio_version = ${next} WHERE id = ${userId}`;
    return next;
  });
}

async function insertPosition(tx, userId, p) {
  const isMarket = p.kind === 'fii' || p.kind === 'acao';
  const meta = isMarket
    ? {
        t: p.t || '', rec: p.rec || 0,
        ...(p.d != null ? { d: p.d } : {}),
        ...(p.segment ? { segment: p.segment } : {}),
        ...(p.sector  ? { sector:  p.sector  } : {}),
      }
    : stripFixa(p);

  await tx`
    INSERT INTO positions
      (id, user_id, kind, ticker, name, quantity, avg_price, invested_amount, meta)
    VALUES (
      ${p.id},
      ${userId},
      ${p.kind},
      ${isMarket ? String(p.ticker).toUpperCase() : null},
      ${isMarket ? (p.name || null) : (p.nome || null)},
      ${isMarket ? p.q : null},
      ${isMarket ? p.c : null},
      ${isMarket ? null : p.ap},
      ${tx.json(meta)}
    )
  `;
}

function stripFixa(p) {
  const { id, kind, nome, ap, ...rest } = p;
  return rest;
}

export const upsertDailySnapshot = (sql, userId, day, total) =>
  sql`
    INSERT INTO portfolio_snapshots (user_id, day, total_value)
    VALUES (${userId}, ${day}, ${total})
    ON CONFLICT (user_id, day) DO UPDATE SET total_value = EXCLUDED.total_value
  `;

export async function allPortfolioTickers(sql) {
  const rows = await sql`SELECT DISTINCT ticker FROM positions WHERE ticker IS NOT NULL`;
  return rows.map((r) => r.ticker);
}
