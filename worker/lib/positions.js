// Validação dos dados que o usuário informa para o Sleep Score nas aplicações de renda fixa e fundos
// (gravados em positions.meta): emissor, liq, liqData, resgate e venc. Pura, sem banco.
// Dados inválidos são recusados ANTES de gravar. Um valor idêntico ao já gravado na mesma posição é
// aceito (compatibilidade com registros antigos); os demais metadados legítimos não são tocados.

export const META_LIQ = ['ate1', 'data', 'ate30', 'mais30'];
export const META_RESGATE = ['estavel', 'mercado'];
export const EMISSOR_MAX = 60;
export const SLEEP_META_KEYS = ['emissor', 'liq', 'liqData', 'resgate', 'venc'];
const MARKET_KINDS = ['fii', 'acao'];

// Data de calendário real (AAAA-MM-DD), sem fuso; anos de 1900 a 2200.
export function isRealDate(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const ausente = (v) => v === undefined || v === null;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function campoValido(key, v) {
  if (ausente(v)) return true;
  switch (key) {
    case 'emissor':
      return typeof v === 'string' && v.length > 0 && v.length <= EMISSOR_MAX && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
    case 'liq': return typeof v === 'string' && META_LIQ.includes(v);
    case 'resgate': return typeof v === 'string' && META_RESGATE.includes(v);
    case 'liqData': case 'venc': return isRealDate(v);
    default: return true;
  }
}

/**
 * p: posição recebida do cliente; prev: meta já gravada para o mesmo id (ou null).
 * Retorna null se válida, ou { field, error }.
 */
export function validatePositionMeta(p, prev = null) {
  if (!p || typeof p !== 'object' || MARKET_KINDS.includes(p.kind)) return null;   // bolsa: esses campos não são gravados
  const antigo = (k) => prev && Object.hasOwn(prev, k) && igual(prev[k], p[k]);
  for (const k of SLEEP_META_KEYS) {
    if (!campoValido(k, p[k]) && !antigo(k)) return { field: k, error: k + '_invalido' };
  }
  // liqData só com liq = "data", e obrigatória nesse caso (salvo combinação idêntica à já gravada)
  const combinacaoAntiga = antigo('liq') && (antigo('liqData') || (ausente(p.liqData) && !(prev && Object.hasOwn(prev, 'liqData'))));
  if (!combinacaoAntiga) {
    if (p.liq === 'data' && ausente(p.liqData)) return { field: 'liqData', error: 'liqData_obrigatoria' };
    if (p.liq !== 'data' && !ausente(p.liqData)) return { field: 'liqData', error: 'liqData_sem_liq_data' };
  }
  return null;
}

// Remove as chaves do Sleep Score com valor nulo (o cliente apaga a chave quando o dado é apagado).
export function stripEmptySleepMeta(meta) {
  const out = { ...meta };
  for (const k of SLEEP_META_KEYS) if (out[k] === null) delete out[k];
  return out;
}
