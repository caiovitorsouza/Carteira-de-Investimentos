// Sleep Score v2.1 — indicador EXPLICATIVO da carteira (não é previsão, garantia nem recomendação).
// Puro: sem DOM, sem rede. Valores em centavos. Metodologia completa em docs/sleep-score.md.
//
// Dimensões pontuadas (0–100, quanto maior, menos pontos de atenção no fator medido):
//   concentracao — distribuição do valor entre EMISSORES (índice HHI → número efetivo de emissores);
//   acesso       — prazo até ter o dinheiro (só o prazo: não diz nada sobre o valor recebido);
//   reserva      — cobertura da reserva de emergência que VOCÊ definiu, só com posições que o modelo considera.
// Informativos (não pontuados): setor/segmento, vencimentos informados, posições sem cotação.
//
// Regra central (monotonicidade): com as mesmas posições e valores, PERDER informação nunca aumenta
// a nota nem cria diversificação aparente. Para isso, cada dado ausente entra no PIOR caso possível:
//   - posição sem emissor → somada ao maior emissor identificado (a maior concentração possível);
//   - posição sem prazo conhecido → nota de acesso 0 (como "mais de 30 dias");
//   - posição vinculada à reserva sem os dados necessários → não cobre a reserva.
// Assim a nota é um PISO: completar dados só pode mantê-la ou aumentá-la. Abaixo da cobertura mínima,
// a dimensão fica sem nota. A nota geral só existe quando as três dimensões têm nota: não há
// renormalização de pesos (tirar uma dimensão fraca não pode elevar a nota).

export const SLEEP_VERSION = '2.1';
export const SLEEP_VERSION_DATE = 'outubro de 2026';
export const SLEEP_WEIGHTS = Object.freeze({ concentracao: 0.5, acesso: 0.3, reserva: 0.2 });
export const MIN_COVERAGE = 0.6;          // 60% do valor da carteira com o dado necessário
export const N_EFETIVO_ALVO = 10;         // a partir de 10 emissores efetivos, nota máxima de concentração
// Notas por prazo de acesso (escolhas do modelo, documentadas): quanto mais rápido, maior.
export const ACCESS_LEVELS = Object.freeze({
  ate1:   { nota: 1.00, nome: 'Até 1 dia útil' },
  d2:     { nota: 0.75, nome: 'Venda em bolsa, liquidação em 2 dias úteis' },
  ate30:  { nota: 0.40, nome: 'Até 30 dias' },
  mais30: { nota: 0.00, nome: 'Mais de 30 dias' },
});
export const TESOURO_KINDS = ['selic', 'pre', 'ipca'];
// Classes negociadas na B3 com liquidação D+2 conferida em fonte primária (páginas da B3 de ações/ETF e de FII).
// A classe vem do catálogo de ativos (subtipo informado pela fonte de dados), nunca do formato do código.
export const B3_D2_CLASSES = Object.freeze({ acao: 'Ação', fii: 'FII' });
export const RESERVE_STATES = ['definida', 'nao_definida', 'falha', 'carregando'];
const KIND_NOME = { selic: 'Tesouro Selic', pre: 'Tesouro Prefixado', ipca: 'Tesouro IPCA+', cdb: 'CDB', cdi: 'Renda fixa (CDI)',
  lci: 'LCI', lca: 'LCA', fundo: 'Fundo', acao: 'Ação', fii: 'FII' };

const DIA = 86400000;
function diasAte(dataStr, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataStr || ''));
  if (!m) return null;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = Date.UTC(today.y, today.m - 1, today.d);
  const dt = new Date(a);
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return Math.round((a - t) / DIA);
}
const normEmissor = (s) => String(typeof s === 'string' ? s : '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(s\.?\s?a\.?|ltda|banco|bco)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const nomeDe = (i) => i.label || i.ticker || KIND_NOME[i.kind] || i.kind;

// Emissor de uma posição. Tesouro → Tesouro Nacional. Código da B3 → raiz de 4 caracteres (a B3 explica que
// as quatro letras, em geral, refletem o nome da empresa): juntar códigos da mesma raiz só pode REDUZIR a
// diversificação calculada. Renda fixa/fundo → emissor informado por você; sem ele, o emissor é desconhecido.
export function issuerOf(it) {
  if (TESOURO_KINDS.includes(it.kind)) return { key: 'tesouro', name: 'Tesouro Nacional', identified: true, source: 'regra' };
  if (it.ticker && /^[A-Z0-9]{4}\d{1,2}$/.test(String(it.ticker).toUpperCase())) {
    const raiz = String(it.ticker).toUpperCase().slice(0, 4);
    return { key: 'b3:' + raiz, name: raiz, identified: true, source: 'b3' };
  }
  const n = normEmissor(it.emissor);
  if (n) return { key: 'inf:' + n, name: String(it.emissor).trim(), identified: true, source: 'informado' };
  return { key: null, name: null, identified: false, source: null };
}

// Classe verificada de um ativo negociado em bolsa (do catálogo). Sem ela: null (desconhecida).
export function exchangeClassOf(it) {
  return it.ticker && ['acao', 'fii', 'etf'].includes(it.classe) ? it.classe : null;
}

// Prazo de acesso ao dinheiro (só o PRAZO; o valor recebido é tratado à parte).
// Tesouro Direto: recompra diária pelo Tesouro Nacional; resgate pedido até 13h é pago no mesmo dia,
// depois disso no dia útil seguinte (Regras e Regulamento). Ação/FII com classe do catálogo: venda
// em pregão com liquidação D+2 (B3) — o volume negociado não é conhecido aqui. Classe desconhecida ou
// renda fixa/fundo sem prazo informado → null (desconhecido).
export function accessOf(it, today) {
  if (TESOURO_KINDS.includes(it.kind)) return { level: 'ate1', source: 'regra', marketPriced: true };
  if (it.ticker) {
    const c = exchangeClassOf(it);
    // A fonte identifica ETF, mas não o distingue em renda fixa (D+1) e
    // variável (D+2). Sem essa informação, não se inventa um prazo.
    if (c === 'etf') return { level: null, source: null, marketPriced: true, motivo: 'prazo_etf' };
    return c ? { level: 'd2', source: 'regra', marketPriced: true } : { level: null, source: null, marketPriced: true, motivo: 'classe' };
  }
  if (it.liq === 'ate1' || it.liq === 'ate30' || it.liq === 'mais30') return { level: it.liq, source: 'informado', marketPriced: it.resgate === 'mercado' };
  if (it.liq === 'data') {
    const d = diasAte(it.liqData, today);
    if (d == null) return { level: null, source: null, marketPriced: it.resgate === 'mercado', motivo: 'prazo' };
    return { level: d <= 0 ? 'ate1' : d <= 30 ? 'ate30' : 'mais30', source: 'informado', marketPriced: it.resgate === 'mercado', dias: d };
  }
  return { level: null, source: null, marketPriced: it.resgate === 'mercado', motivo: 'prazo' };
}

// A posição conta na cobertura da reserva? Exige as DUAS coisas: acesso em até 1 dia útil E um valor de
// resgate que não dependa de preço de mercado (ou, no Tesouro Selic, o título que o próprio Tesouro Direto
// apresenta como indicado para reserva). Prazo de liquidação sozinho não basta.
export function reserveEligibility(it, today) {
  if (it.kind === 'selic') return { conta: true, motivo: 'Tesouro Selic: resgate em até 1 dia útil; indicado pelo Tesouro Direto para reserva (o resgate antes do vencimento é a preço de mercado)' };
  if (it.kind === 'pre' || it.kind === 'ipca') return { conta: false, motivo: 'antes do vencimento, o resgate é a preço de mercado e pode ficar abaixo do aplicado' };
  if (it.ticker) return { conta: false, motivo: exchangeClassOf(it) === 'etf' ? 'ETF: venda a preço de mercado; prazo de liquidação não confirmado' : exchangeClassOf(it) ? 'venda em bolsa a preço de mercado, liquidação em 2 dias úteis' : 'classe do ativo não confirmada; venda em bolsa a preço de mercado' };
  const a = accessOf(it, today);
  if (!a.level) return { conta: false, motivo: 'prazo de acesso não informado', faltaDado: true };
  if (a.level !== 'ate1') return { conta: false, motivo: 'acesso em mais de 1 dia útil' };
  if (it.resgate === 'mercado') return { conta: false, motivo: 'valor de resgate pode variar com o mercado' };
  if (it.resgate !== 'estavel') return { conta: false, motivo: 'não informado se o valor de resgate varia', faltaDado: true };
  return { conta: true, motivo: 'acesso em até 1 dia útil e valor de resgate sem variação de mercado (informados por você)' };
}

/**
 * Situação da reserva para o modelo. reserva: { state: 'definida', monthlyExpenseCents, months, linkedPositionIds }
 * | { state: 'nao_definida' } | { state: 'falha' } | { state: 'carregando' }.
 * Separa o VALOR VINCULADO (o que você marcou) da COBERTURA CONSIDERADA pelo modelo.
 */
export function reserveSummary({ items = [], reserva, today }) {
  const state = reserva && RESERVE_STATES.includes(reserva.state) ? reserva.state : 'falha';
  if (state !== 'definida') return { state };
  if (!(reserva.monthlyExpenseCents > 0) || !(reserva.months > 0)) return { state: 'nao_definida' };
  const objetivo = reserva.monthlyExpenseCents * reserva.months;
  const ids = new Set(reserva.linkedPositionIds || []);
  let vinculado = 0, considerado = 0, faltaDadoCents = 0; let encontrados = 0;
  const posicoes = [];
  for (const i of items) {
    if (!ids.has(i.id)) continue;
    encontrados++;
    const v = Number.isFinite(i.valueCents) && i.valueCents > 0 ? i.valueCents : 0;
    const e = reserveEligibility(i, today);
    vinculado += v;
    if (e.conta) considerado += v; else if (e.faltaDado) faltaDadoCents += v;
    posicoes.push({ id: i.id, label: nomeDe(i), valueCents: v, conta: e.conta, motivo: e.motivo, faltaDado: !!e.faltaDado });
  }
  return { state, objetivoCents: objetivo, meses: reserva.months, gastoMensalCents: reserva.monthlyExpenseCents,
    vinculadoCents: vinculado, consideradoCents: considerado, faltaDadoCents, posicoes, ausentes: ids.size - encontrados,
    mesesCobertos: considerado / reserva.monthlyExpenseCents };
}

const pctTxt = (x) => (Math.round(x * 1000) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const FULL = 0.9995;

/**
 * items: [{ id, kind, ticker, classe, label, valueCents, hasQuote, sector, emissor, liq, liqData, resgate, venc }]
 * reserva: ver reserveSummary
 * today: { y, m, d }
 */
export function computeSleepScore({ items = [], reserva, today }) {
  const its = items.filter(i => Number.isFinite(i.valueCents) && i.valueCents > 0);
  const total = its.reduce((s, i) => s + i.valueCents, 0);
  const base = { version: SLEEP_VERSION, weights: SLEEP_WEIGHTS, minCoverage: MIN_COVERAGE };
  if (!(total > 0)) return { ...base, status: 'vazio', score: null, band: null, motivos: [], dimensions: null, coverage: null, contribuicoes: {}, explanations: [], limitations: [] };
  const w = (v) => v / total;

  /* ---------------- concentração por emissor (pior caso para o que falta) ---------------- */
  const grupos = new Map();
  let semEmissor = 0; const semEmissorPos = [];
  for (const i of its) {
    const e = issuerOf(i);
    if (!e.identified) { semEmissor += i.valueCents; semEmissorPos.push(nomeDe(i)); continue; }
    const g = grupos.get(e.key) || { ...e, value: 0, positions: [] };
    g.value += i.valueCents; g.positions.push(i.ticker || nomeDe(i));
    grupos.set(e.key, g);
  }
  // nome exibido: para códigos da B3, os próprios códigos do grupo (a raiz sozinha é pouco clara)
  const lista = [...grupos.values()].map(g => ({ ...g, share: w(g.value),
    name: g.source === 'b3' ? (g.positions.length === 1 ? g.positions[0] : `${g.positions.join(' e ')} (raiz ${g.name})`) : g.name }))
    .sort((a, b) => b.share - a.share);
  const identificado = 1 - w(semEmissor);
  // Pior caso: todo o valor sem emissor pertence ao maior emissor identificado (ou a um só, se nenhum).
  const sharesPior = lista.map(g => g.share);
  if (semEmissor > 0) { if (sharesPior.length) sharesPior[0] += w(semEmissor); else sharesPior.push(w(semEmissor)); }
  const hhi = sharesPior.reduce((s, x) => s + x * x, 0);
  const nEff = 1 / hhi;
  const concScore = identificado >= MIN_COVERAGE - 1e-9 ? Math.round(clamp01(Math.log(nEff) / Math.log(N_EFETIVO_ALVO)) * 100) : null;
  const maiorPos = [...its].sort((a, b) => b.valueCents - a.valueCents)[0];
  const rv = its.filter(i => i.ticker);
  const rvTotal = rv.reduce((s, i) => s + i.valueCents, 0);
  const setores = new Map(); let rvComSetor = 0;
  for (const i of rv) if (i.sector) { setores.set(i.sector, (setores.get(i.sector) || 0) + i.valueCents); rvComSetor += i.valueCents; }
  const topSetor = [...setores.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const concentracao = {
    score: concScore, status: concScore == null ? 'insuficiente' : identificado >= FULL ? 'ok' : 'parcial', coverage: identificado,
    factors: {
      hhi, nEff, emissores: lista.length, semEmissor: w(semEmissor), semEmissorPos,
      maiorEmissor: lista[0] ? { name: lista[0].name, share: lista[0].share, positions: lista[0].positions } : null,
      maiorPosicao: { name: maiorPos.ticker || maiorPos.label, share: w(maiorPos.valueCents) },
      mesmoEmissor: lista.filter(g => g.positions.length > 1).map(g => ({ name: g.name, positions: g.positions, share: g.share })),
      setor: topSetor ? { name: topSetor[0], shareOfRv: topSetor[1] / rvTotal, coverageRv: rvTotal ? rvComSetor / rvTotal : 0 } : null,
    },
  };

  /* ---------------- acesso ao dinheiro (prazo desconhecido = pior prazo) ---------------- */
  const porNivel = { ate1: 0, d2: 0, ate30: 0, mais30: 0 };
  let conhecido = 0, mercado = 0, pontos = 0;
  const semPrazo = [], semClasse = [], etfsSemPrazo = [];
  for (const i of its) {
    const a = accessOf(i, today);
    if (a.marketPriced) mercado += i.valueCents;
    if (a.level) { porNivel[a.level] += i.valueCents; conhecido += i.valueCents; pontos += i.valueCents * ACCESS_LEVELS[a.level].nota; }
    else if (a.motivo === 'prazo_etf') etfsSemPrazo.push(nomeDe(i));
    else if (a.motivo === 'classe') semClasse.push(nomeDe(i));
    else semPrazo.push(nomeDe(i));
  }
  const cobAcesso = w(conhecido);
  const acessoScore = cobAcesso >= MIN_COVERAGE - 1e-9 ? Math.round(pontos / total * 100) : null;
  const acesso = {
    score: acessoScore, status: acessoScore == null ? 'insuficiente' : cobAcesso >= FULL ? 'ok' : 'parcial', coverage: cobAcesso,
    factors: { porNivel: Object.fromEntries(Object.entries(porNivel).map(([k, v]) => [k, w(v)])), semPrazo, semClasse, etfsSemPrazo, desconhecido: 1 - cobAcesso, aPrecoDeMercado: w(mercado) },
  };

  /* ---------------- reserva de emergência (definida por você) ---------------- */
  const rs = reserveSummary({ items: its, reserva, today });
  let reservaDim;
  if (rs.state !== 'definida') reservaDim = { score: null, status: rs.state, coverage: null, factors: null };
  else {
    const ratio = clamp01(rs.consideradoCents / rs.objetivoCents);
    reservaDim = { score: Math.round(ratio * 100), status: rs.faltaDadoCents > 0 ? 'parcial' : 'ok', coverage: null, factors: rs };
  }

  /* ---------------- informativos ---------------- */
  // vencimento: só onde você pode informá-lo (renda fixa privada e fundos; Tesouro e bolsa ficam fora)
  const rf = its.filter(i => !i.ticker && !TESOURO_KINDS.includes(i.kind));
  const rfTotal = rf.reduce((s, i) => s + i.valueCents, 0);
  let vencInf = 0, venc12 = 0;
  for (const i of rf) { const d = diasAte(i.venc, today); if (d != null) { vencInf += i.valueCents; if (d >= 0 && d <= 365) venc12 += i.valueCents; } }
  const semCotacao = rv.filter(i => !i.hasQuote);
  const cobCotacao = rvTotal ? (rvTotal - semCotacao.reduce((s, i) => s + i.valueCents, 0)) / rvTotal : null;
  const vencimentos = { status: 'informativo', coverage: rfTotal ? vencInf / rfTotal : null, factors: { venc12: w(venc12), rfShare: w(rfTotal) } };

  /* ---------------- nota geral: só com as três dimensões, pesos fixos ---------------- */
  const motivos = [];
  if (concentracao.score == null) motivos.push('emissor_insuficiente');
  if (acesso.score == null) motivos.push('acesso_insuficiente');
  if (reservaDim.score == null) motivos.push('reserva_' + reservaDim.status);
  let score = null, status = 'indisponivel';
  const contribuicoes = {};
  if (!motivos.length) {
    let acc = 0;
    for (const k of ['concentracao', 'acesso', 'reserva']) {
      const s = { concentracao, acesso, reserva: reservaDim }[k].score;
      contribuicoes[k] = { peso: SLEEP_WEIGHTS[k], pontos: SLEEP_WEIGHTS[k] * s }; acc += SLEEP_WEIGHTS[k] * s;
    }
    score = Math.round(acc);
    status = concentracao.status === 'ok' && acesso.status === 'ok' && reservaDim.status === 'ok' ? 'completa' : 'parcial';
  }
  const band = score == null ? null : score >= 70 ? 'poucos' : score >= 40 ? 'alguns' : 'relevantes';

  /* ---------------- explicações (fatores observados, sem recomendar) ---------------- */
  const ex = [];
  const me = concentracao.factors.maiorEmissor;
  if (me) ex.push(`Maior emissor identificado: ${me.name}, ${pctTxt(me.share)} do valor (${lista.length} ${lista.length === 1 ? 'emissor identificado' : 'emissores identificados'}).`);
  if (semEmissor > 0) ex.push(`${pctTxt(w(semEmissor))} do valor sem emissor informado conta como se fosse do ${me ? 'maior emissor' : 'mesmo emissor'} (pior caso). Número efetivo de emissores nesse caso: ${nEff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}.`);
  else ex.push(`Número efetivo de emissores: ${nEff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}.`);
  for (const g of concentracao.factors.mesmoEmissor) ex.push(`${g.positions.join(' e ')} contam como um só emissor${g.name.includes('(raiz') ? '' : ` (${g.name})`}.`);
  if (concentracao.factors.setor && concentracao.factors.setor.coverageRv > 0) ex.push(`Na renda variável, o maior setor/segmento informado (${concentracao.factors.setor.name}) é ${pctTxt(concentracao.factors.setor.shareOfRv)}.`);
  ex.push(`Prazo de acesso: ${pctTxt(porNivel.ate1 / total)} em até 1 dia útil; ${pctTxt(porNivel.d2 / total)} em ações/FIIs (2 dias úteis)${cobAcesso < FULL ? `; ${pctTxt(1 - cobAcesso)} com prazo desconhecido, contado como o mais longo` : ''}.`);
  if (acesso.factors.aPrecoDeMercado > 0) ex.push(`${pctTxt(acesso.factors.aPrecoDeMercado)} do valor é resgatado ou vendido a preço de mercado: o valor recebido pode ser diferente do aplicado. O prazo de acesso não mede isso.`);
  if (rs.state === 'definida') ex.push(`Reserva: ${rs.mesesCobertos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de ${rs.meses} meses cobertos pelo valor considerado (de ${pctTxt(rs.vinculadoCents ? rs.consideradoCents / rs.vinculadoCents : 0)} do valor vinculado).`);

  /* ---------------- limitações (separadas da nota) ---------------- */
  const lim = [];
  if (semEmissor > 0) lim.push(`Sem emissor informado: ${semEmissorPos.slice(0, 4).join(', ')}${semEmissorPos.length > 4 ? '…' : ''} (${pctTxt(w(semEmissor))} do valor).`);
  if (concentracao.score == null) lim.push(`Com menos de ${pctTxt(MIN_COVERAGE)} do valor com emissor identificado, a concentração fica sem nota.`);
  if (semClasse.length) lim.push(`Classe não confirmada no catálogo de ativos para ${semClasse.slice(0, 4).join(', ')}${semClasse.length > 4 ? '…' : ''}: prazo de acesso desconhecido.`);
  if (etfsSemPrazo.length) lim.push(`ETF sem categoria de liquidação confirmada: ${etfsSemPrazo.join(', ')}. ETF de renda fixa liquida em D+1; de renda variável, em D+2. A classe genérica ETF não basta para escolher o prazo.`);
  if (semPrazo.length) lim.push(`Prazo de acesso desconhecido para ${semPrazo.slice(0, 4).join(', ')}${semPrazo.length > 4 ? '…' : ''}.`);
  if (acesso.score == null) lim.push(`Com menos de ${pctTxt(MIN_COVERAGE)} do valor com prazo de acesso conhecido, o acesso fica sem nota.`);
  if (reservaDim.status === 'nao_definida') lim.push('Reserva de emergência não definida: sem ela, não há nota geral (as outras dimensões aparecem separadas).');
  if (reservaDim.status === 'falha') lim.push('Não foi possível carregar a reserva de emergência: sem ela, não há nota geral. Nenhum dado antigo é usado no lugar.');
  if (reservaDim.status === 'carregando') lim.push('Reserva de emergência ainda carregando: a nota geral aparece quando ela chegar.');
  if (rs.state === 'definida' && rs.faltaDadoCents > 0) lim.push(`Posições vinculadas à reserva sem os dados necessários não contam na cobertura: ${rs.posicoes.filter(p => p.faltaDado).map(p => p.label).join(', ')}.`);
  if (semCotacao.length) lim.push(`${semCotacao.length} ${semCotacao.length === 1 ? 'posição sem cotação atual' : 'posições sem cotação atual'} (valor pelo preço médio).`);
  lim.push('Não mede volatilidade, correlação, risco de crédito, garantias (como FGC), volume negociado nem fundamentos: esses dados não estão disponíveis aqui.');
  lim.push('Fundos e ETFs contam como um único emissor; a diversificação dentro deles não é vista.');

  return {
    ...base, status, score, band, motivos, contribuicoes,
    dimensions: { concentracao, acesso, reserva: reservaDim, vencimentos },
    coverage: { emissor: identificado, acesso: cobAcesso, cotacao: cobCotacao, vencimento: vencimentos.coverage, setorRv: concentracao.factors.setor ? concentracao.factors.setor.coverageRv : (rvTotal ? 0 : null) },
    explanations: ex, limitations: lim,
  };
}
