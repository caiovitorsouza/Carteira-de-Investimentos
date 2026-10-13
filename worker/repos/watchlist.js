// Repositório da lista de interesse. Toda consulta é restrita por user_id: um id de outro
// usuário nunca é lido, alterado nem apagado. Criação idempotente (o mesmo id não duplica) e
// limite por usuário verificado e inserido na mesma transação, sob bloqueio consultivo por usuário
// (mesmo padrão de worker/repos/finance.js).

export const MAX_WATCH = 200;

const COLS = (sql) => sql`
  id, stage, asset, kind, name, reason, notes, priority,
  target_price_cents::float8 AS "targetPriceCents",
  planned_amount_cents::float8 AS "plannedAmountCents",
  planned_quantity::float8 AS "plannedQuantity",
  manual_price_cents::float8 AS "manualPriceCents",
  to_char(manual_price_on, 'YYYY-MM-DD') AS "manualPriceOn"`;

function withUserLock(sql, userId, fn) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'watchlist:' + userId}, 0))`;
    return fn(tx);
  });
}

export async function listWatch(sql, userId) {
  const rows = await sql`SELECT ${COLS(sql)} FROM watchlist_items WHERE user_id = ${userId}
                         ORDER BY created_at, id LIMIT ${MAX_WATCH}`;
  return rows.map((r) => ({ ...r }));
}

export function createWatch(sql, userId, id, v) {
  return withUserLock(sql, userId, async (tx) => {
    const existing = await tx`SELECT ${COLS(tx)} FROM watchlist_items WHERE id = ${id} AND user_id = ${userId}`;
    if (existing.length) return { row: { ...existing[0] }, created: false };
    const count = await tx`SELECT count(*)::int AS n FROM watchlist_items WHERE user_id = ${userId}`;
    if (count[0].n >= MAX_WATCH) return { limit: true };
    const created = await tx`
      INSERT INTO watchlist_items (id, user_id, stage, asset, kind, name, reason, notes, priority,
        target_price_cents, planned_amount_cents, planned_quantity, manual_price_cents, manual_price_on)
      VALUES (${id}, ${userId}, ${v.stage}, ${v.asset}, ${v.kind}, ${v.name}, ${v.reason}, ${v.notes}, ${v.priority},
        ${v.targetPriceCents}, ${v.plannedAmountCents}, ${v.plannedQuantity}, ${v.manualPriceCents}, ${v.manualPriceOn})
      ON CONFLICT (id) DO NOTHING
      RETURNING ${COLS(tx)}`;
    return created.length ? { row: { ...created[0] }, created: true } : null;   // sem retorno: id de outro usuário
  });
}

export async function updateWatch(sql, userId, id, v) {
  const rows = await sql`
    UPDATE watchlist_items
       SET stage = ${v.stage}, asset = ${v.asset}, kind = ${v.kind}, name = ${v.name}, reason = ${v.reason},
           notes = ${v.notes}, priority = ${v.priority}, target_price_cents = ${v.targetPriceCents},
           planned_amount_cents = ${v.plannedAmountCents}, planned_quantity = ${v.plannedQuantity},
           manual_price_cents = ${v.manualPriceCents}, manual_price_on = ${v.manualPriceOn}, updated_at = now()
     WHERE id = ${id} AND user_id = ${userId}
    RETURNING ${COLS(sql)}`;
  return rows[0] ? { ...rows[0] } : null;
}

export async function deleteWatch(sql, userId, id) {
  const rows = await sql`DELETE FROM watchlist_items WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}
