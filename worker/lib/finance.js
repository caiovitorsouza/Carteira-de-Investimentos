// Validação de entrada dos registros financeiros (puro: sem banco, sem rede).
// Nunca confia no cliente: valores monetários chegam em centavos inteiros e as datas
// são conferidas como datas reais de calendário, sem conversão de fuso.
import {
  MAX_CENTS, parseCalendarDate, pad2, validateIndependenceInput, INDEPENDENCE_DEFAULTS,
  validateBazinInput,
} from '../../public/finance-calc.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ok = (value) => ({ ok: true, value });
const bad = (error, field) => ({ ok: false, error, field });

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  // remove caracteres de controle e normaliza espaços
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? null : t;
}
const isCents = (v, min = 1) => Number.isInteger(v) && v >= min && v <= MAX_CENTS;

// "Hoje" em UTC como AAAA-MM-DD; datas de recebimento até 1 dia à frente são aceitas para
// absorver fusos a leste de UTC. Recebimento futuro distante não faz sentido.
export function todayUtcString(now = new Date()) {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}
function addOneDay(str) {
  const p = parseCalendarDate(str);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function validateReceipt(body, now = new Date()) {
  if (!body || typeof body !== 'object') return bad('dados_invalidos');
  let asset = cleanText(body.asset, 40);
  if (!asset) return bad('ativo_invalido', 'asset');
  if (/^[A-Za-z]{4}\d{1,2}$/.test(asset)) asset = asset.toUpperCase();   // ticker B3
  if (!isCents(body.amountCents)) return bad('valor_invalido', 'amountCents');
  if (!parseCalendarDate(body.receivedOn)) return bad('data_invalida', 'receivedOn');
  if (body.receivedOn > addOneDay(todayUtcString(now))) return bad('data_futura', 'receivedOn');
  let note = null;
  if (body.note != null && body.note !== '') {
    note = cleanText(body.note, 200);
    if (note === null) return bad('observacao_invalida', 'note');
    if (note === '') note = null;
  }
  return ok({ asset, amountCents: body.amountCents, receivedOn: body.receivedOn, note });
}

export function validateGoal(body) {
  if (!body || typeof body !== 'object') return bad('dados_invalidos');
  if (body.kind !== 'patrimonio' && body.kind !== 'renda_mensal') return bad('tipo_invalido', 'kind');
  const name = cleanText(body.name, 60);
  if (!name) return bad('nome_invalido', 'name');
  if (!isCents(body.targetCents)) return bad('valor_invalido', 'targetCents');
  let deadline = null;
  if (body.deadline != null && body.deadline !== '') {
    if (!parseCalendarDate(body.deadline)) return bad('prazo_invalido', 'deadline');
    deadline = body.deadline;
  }
  return ok({ kind: body.kind, name, targetCents: body.targetCents, deadline });
}

export function validateReserve(body) {
  if (!body || typeof body !== 'object') return bad('dados_invalidos');
  if (!isCents(body.monthlyExpenseCents)) return bad('gasto_invalido', 'monthlyExpenseCents');
  if (!Number.isInteger(body.months) || body.months < 1 || body.months > 60) return bad('meses_invalido', 'months');
  if (body.monthlyExpenseCents * body.months > MAX_CENTS) return bad('valor_invalido', 'monthlyExpenseCents');
  const ids = body.linkedPositionIds ?? [];
  if (!Array.isArray(ids) || ids.length > 100) return bad('vinculos_invalidos', 'linkedPositionIds');
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== 'string' || !REF_RE.test(id)) return bad('vinculos_invalidos', 'linkedPositionIds');
    seen.add(id);
  }
  return ok({ monthlyExpenseCents: body.monthlyExpenseCents, months: body.months, linkedPositionIds: [...seen] });
}

const ORIGINS = new Set(['ilustrativo', 'manual']);

export function validateSimulator(key, data) {
  if (!data || typeof data !== 'object') return bad('dados_invalidos');
  if (key === 'independence') {
    const v = {
      initialCents: data.initialCents ?? null,
      monthlyContributionCents: data.monthlyContributionCents,
      desiredIncomeCents: data.desiredIncomeCents,
      returnBp: data.returnBp,
      incomeRateBp: data.incomeRateBp,
      inflationBp: data.inflationBp ?? null,
    };
    const erros = validateIndependenceInput(v);
    const field = Object.keys(erros)[0];
    if (field) return bad('premissa_invalida', field);
    return ok({ ...INDEPENDENCE_DEFAULTS, ...v });
  }
  if (key === 'bazin') {
    const v = {
      priceCents: data.priceCents ?? null,
      annualDividendCents: data.annualDividendCents,
      rateBp: data.rateBp,
    };
    const erros = validateBazinInput(v);
    const field = Object.keys(erros)[0];
    if (field) return bad('premissa_invalida', field);
    let ticker = null;
    if (data.ticker != null && data.ticker !== '') {
      ticker = cleanText(data.ticker, 20);
      if (!ticker) return bad('premissa_invalida', 'ticker');
      ticker = ticker.toUpperCase();
    }
    const priceOrigin = ORIGINS.has(data.priceOrigin) ? data.priceOrigin : 'manual';
    const dividendOrigin = ORIGINS.has(data.dividendOrigin) ? data.dividendOrigin : 'manual';
    return ok({ ...v, ticker, priceOrigin, dividendOrigin });
  }
  return bad('simulador_invalido');
}
