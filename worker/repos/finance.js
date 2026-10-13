// Repositório de proventos recebidos, metas, reserva e premissas de simuladores.
// Toda consulta é restrita por user_id; um id de outro usuário nunca é lido, alterado
// nem apagado. Dinheiro em centavos (bigint → ::float8, seguro até 1e13).

export const MAX_GOALS = 30;
export const MAX_RECEIPTS = 5000;

const RECEIPT_COLS = (sql) => sql`
  id, asset,
  to_char(received_on, 'YYYY-MM-DD') AS "receivedOn",
  amount_cents::float8 AS "amountCents", note`;
const GOAL_COLS = (sql) => sql`
  id, kind, name, target_cents::float8 AS "targetCents",
  to_char(deadline, 'YYYY-MM-DD') AS deadline`;

// Verificação do limite + inserção precisam ser atômicas POR USUÁRIO: sem isso, dois pedidos
// simultâneos leem a mesma contagem e ambos inserem (o limite é ultrapassado). O bloqueio consultivo
// de transação (pg_advisory_xact_lock) serializa só o mesmo usuário e a mesma lista; outros usuários
// não esperam. Funciona com o pooler de transações do Supabase (o bloqueio some no COMMIT/ROLLBACK).
function withUserLock(sql, kind, userId, fn) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'finance:' + kind + ':' + userId}, 0))`;
    return fn(tx);
  });
}

export async function loadFinance(sql, userId) {
  const [receipts, goals, reserve, sims] = await Promise.all([
    sql`SELECT ${RECEIPT_COLS(sql)} FROM dividend_receipts
         WHERE user_id = ${userId}
         ORDER BY received_on DESC, created_at DESC
         LIMIT ${MAX_RECEIPTS}`,
    sql`SELECT ${GOAL_COLS(sql)} FROM financial_goals
         WHERE user_id = ${userId} ORDER BY created_at, id`,
    sql`SELECT monthly_expense_cents::float8 AS "monthlyExpenseCents", months,
               linked_position_ids AS "linkedPositionIds"
          FROM emergency_reserve WHERE user_id = ${userId}`,
    sql`SELECT key, data FROM user_simulators WHERE user_id = ${userId}`,
  ]);
  const simulators = {};
  for (const r of sims) simulators[r.key] = r.data;
  return {
    receipts: [...receipts], goals: [...goals],
    reserve: reserve[0] ? { ...reserve[0] } : null,
    simulators,
  };
}

/* ---------------------------------------------------------------- recebimentos */

// Criação idempotente: repetir o mesmo id (reenvio após falha de rede) devolve o registro
// já salvo sem duplicar. Um id que já pertence a OUTRO usuário retorna null (conflito).
export function createReceipt(sql, userId, id, v) {
  return withUserLock(sql, 'receipts', userId, async (tx) => {
    const existing = await tx`
      SELECT ${RECEIPT_COLS(tx)} FROM dividend_receipts WHERE id = ${id} AND user_id = ${userId}`;
    if (existing.length) return { row: { ...existing[0] }, created: false };
    const count = await tx`SELECT count(*)::int AS n FROM dividend_receipts WHERE user_id = ${userId}`;
    if (count[0].n >= MAX_RECEIPTS) return { limit: true };
    const created = await tx`
      INSERT INTO dividend_receipts (id, user_id, asset, received_on, amount_cents, note)
      VALUES (${id}, ${userId}, ${v.asset}, ${v.receivedOn}, ${v.amountCents}, ${v.note})
      ON CONFLICT (id) DO NOTHING
      RETURNING ${RECEIPT_COLS(tx)}`;
    // sem retorno = o id pertence a outro usuário
    return created.length ? { row: { ...created[0] }, created: true } : null;
  });
}

export async function updateReceipt(sql, userId, id, v) {
  const rows = await sql`
    UPDATE dividend_receipts
       SET asset = ${v.asset}, received_on = ${v.receivedOn},
           amount_cents = ${v.amountCents}, note = ${v.note}, updated_at = now()
     WHERE id = ${id} AND user_id = ${userId}
    RETURNING ${RECEIPT_COLS(sql)}`;
  return rows[0] ? { ...rows[0] } : null;
}

export async function deleteReceipt(sql, userId, id) {
  const rows = await sql`DELETE FROM dividend_receipts WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

/* ----------------------------------------------------------------------- metas */

export function createGoal(sql, userId, id, v) {
  return withUserLock(sql, 'goals', userId, async (tx) => {
    const existing = await tx`
      SELECT ${GOAL_COLS(tx)} FROM financial_goals WHERE id = ${id} AND user_id = ${userId}`;
    if (existing.length) return { row: { ...existing[0] }, created: false };
    const count = await tx`SELECT count(*)::int AS n FROM financial_goals WHERE user_id = ${userId}`;
    if (count[0].n >= MAX_GOALS) return { limit: true };
    const created = await tx`
      INSERT INTO financial_goals (id, user_id, kind, name, target_cents, deadline)
      VALUES (${id}, ${userId}, ${v.kind}, ${v.name}, ${v.targetCents}, ${v.deadline})
      ON CONFLICT (id) DO NOTHING
      RETURNING ${GOAL_COLS(tx)}`;
    return created.length ? { row: { ...created[0] }, created: true } : null;
  });
}

export async function updateGoal(sql, userId, id, v) {
  const rows = await sql`
    UPDATE financial_goals
       SET kind = ${v.kind}, name = ${v.name}, target_cents = ${v.targetCents},
           deadline = ${v.deadline}, updated_at = now()
     WHERE id = ${id} AND user_id = ${userId}
    RETURNING ${GOAL_COLS(sql)}`;
  return rows[0] ? { ...rows[0] } : null;
}

export async function deleteGoal(sql, userId, id) {
  const rows = await sql`DELETE FROM financial_goals WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

/* --------------------------------------------------------------------- reserva */

export async function saveReserve(sql, userId, v) {
  const rows = await sql`
    INSERT INTO emergency_reserve (user_id, monthly_expense_cents, months, linked_position_ids)
    VALUES (${userId}, ${v.monthlyExpenseCents}, ${v.months}, ${sql.json(v.linkedPositionIds)})
    ON CONFLICT (user_id) DO UPDATE
      SET monthly_expense_cents = EXCLUDED.monthly_expense_cents, months = EXCLUDED.months,
          linked_position_ids = EXCLUDED.linked_position_ids, updated_at = now()
    RETURNING monthly_expense_cents::float8 AS "monthlyExpenseCents", months,
              linked_position_ids AS "linkedPositionIds"`;
  return { ...rows[0] };
}

export async function deleteReserve(sql, userId) {
  const rows = await sql`DELETE FROM emergency_reserve WHERE user_id = ${userId} RETURNING user_id`;
  return rows.length > 0;
}

/* ----------------------------------------------------------------- simuladores */

export async function saveSimulator(sql, userId, key, data) {
  const rows = await sql`
    INSERT INTO user_simulators (user_id, key, data) VALUES (${userId}, ${key}, ${sql.json(data)})
    ON CONFLICT (user_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    RETURNING data`;
  return rows[0].data;
}

export async function deleteSimulator(sql, userId, key) {
  const rows = await sql`DELETE FROM user_simulators WHERE user_id = ${userId} AND key = ${key} RETURNING key`;
  return rows.length > 0;
}
