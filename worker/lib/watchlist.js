// Validação dos itens da lista de interesse (puro: sem banco, sem rede).
// Nunca confia no cliente: dinheiro em centavos inteiros, quantidade com no máximo 8 casas,
// datas de calendário reais. Prioridade é escolha do usuário (1 alta, 2 média, 3 baixa).
import { MAX_CENTS, parseCalendarDate } from '../../public/finance-calc.js';
import { todayUtcString } from './finance.js';

export const WATCH_STAGES = ['acompanhar', 'comprar'];
export const WATCH_KINDS = ['acao', 'fii', 'rf', 'fundo', 'outro'];
// classes negociadas em unidades inteiras (ação/cota de FII): quantidade pretendida inteira
export const WATCH_UNIT_KINDS = ['acao', 'fii'];
export const MAX_QUANTITY = 1_000_000_000;

const ok = (value) => ({ ok: true, value });
const bad = (error, field) => ({ ok: false, error, field });
function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? null : t;
}
// texto opcional: null/'' → null; inválido → undefined
function optText(v, max) {
  if (v == null || v === '') return null;
  const t = cleanText(v, max);
  if (t === null) return undefined;
  return t === '' ? null : t;
}
const isCents = (v) => Number.isInteger(v) && v >= 1 && v <= MAX_CENTS;
const optCents = (v) => (v == null ? null : isCents(v) ? v : undefined);
function addOneDay(str) {
  const p = parseCalendarDate(str);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return dt.toISOString().slice(0, 10);
}
export function isValidQuantity(q) {
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0 || q > MAX_QUANTITY) return false;
  return Math.abs(Math.round(q * 1e8) - q * 1e8) < 1e-6;      // no máximo 8 casas decimais
}

export function validateWatchItem(body, now = new Date()) {
  if (!body || typeof body !== 'object') return bad('dados_invalidos');
  let asset = cleanText(body.asset, 40);
  if (!asset) return bad('ativo_invalido', 'asset');
  if (/^[A-Za-z]{4}\d{1,2}$/.test(asset)) asset = asset.toUpperCase();          // ticker B3
  if (!WATCH_KINDS.includes(body.kind)) return bad('classe_invalida', 'kind');
  if (!WATCH_STAGES.includes(body.stage)) return bad('etapa_invalida', 'stage');
  const name = optText(body.name, 80);     if (name === undefined) return bad('nome_invalido', 'name');
  const reason = optText(body.reason, 200); if (reason === undefined) return bad('motivo_invalido', 'reason');
  const notes = optText(body.notes, 1000);  if (notes === undefined) return bad('observacoes_invalidas', 'notes');
  const priority = body.priority == null ? null : body.priority;
  if (priority !== null && ![1, 2, 3].includes(priority)) return bad('prioridade_invalida', 'priority');
  const targetPriceCents = optCents(body.targetPriceCents);
  if (targetPriceCents === undefined) return bad('preco_interesse_invalido', 'targetPriceCents');
  const plannedAmountCents = optCents(body.plannedAmountCents);
  if (plannedAmountCents === undefined) return bad('aporte_invalido', 'plannedAmountCents');
  const plannedQuantity = body.plannedQuantity == null ? null : body.plannedQuantity;
  if (plannedQuantity !== null){
    if (!isValidQuantity(plannedQuantity)) return bad('quantidade_invalida', 'plannedQuantity');
    if (body.kind === 'rf' || body.kind === 'fundo') return bad('quantidade_nao_se_aplica', 'plannedQuantity');
    if (WATCH_UNIT_KINDS.includes(body.kind) && !Number.isInteger(plannedQuantity)) return bad('quantidade_inteira', 'plannedQuantity');
  }
  if (plannedAmountCents !== null && plannedQuantity !== null) return bad('aporte_valor_ou_quantidade', 'plannedQuantity');
  const manualPriceCents = optCents(body.manualPriceCents);
  if (manualPriceCents === undefined) return bad('cotacao_manual_invalida', 'manualPriceCents');
  let manualPriceOn = body.manualPriceOn == null || body.manualPriceOn === '' ? null : body.manualPriceOn;
  if (manualPriceOn !== null){
    if (!parseCalendarDate(manualPriceOn)) return bad('data_cotacao_invalida', 'manualPriceOn');
    if (manualPriceOn > addOneDay(todayUtcString(now))) return bad('data_cotacao_futura', 'manualPriceOn');
  }
  if ((manualPriceCents === null) !== (manualPriceOn === null)) return bad('cotacao_manual_sem_data', manualPriceCents === null ? 'manualPriceCents' : 'manualPriceOn');
  return ok({ stage: body.stage, asset, kind: body.kind, name, reason, notes, priority, targetPriceCents,
    plannedAmountCents, plannedQuantity, manualPriceCents, manualPriceOn });
}
