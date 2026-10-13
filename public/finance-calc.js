// finance-calc.js — regras puras de proventos recebidos, metas, reserva e simuladores.
// Sem DOM, sem rede e sem fuso: usado pelo navegador, pelo Worker (validação) e pelos testes.
// Convenções: dinheiro em CENTAVOS inteiros; percentuais em PONTOS-BASE inteiros
// (10,5% = 1050); datas de calendário como texto "AAAA-MM-DD", nunca como Date.

export const MAX_CENTS = 10_000_000_000_000;      // R$ 100 bilhões: teto defensivo
export const MAX_SIM_MONTHS = 600;                // 50 anos

/* ------------------------------------------------------------------ dinheiro */

// "R$ 1.234,56", "1234,56", "1234.56", "100" → centavos inteiros; inválido → null.
// Lê o texto sem passar por ponto flutuante: "0,10" nunca vira 9 ou 11 centavos.
export function parseMoneyToCents(input) {
  const t = String(input ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!t || /[^0-9.,]/.test(t) || !/\d/.test(t)) return null;
  let inteiro, frac = '';
  const sep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  const depois = sep >= 0 ? t.length - sep - 1 : 0;
  if (sep >= 0 && (depois === 1 || depois === 2)) {
    // último separador com 1–2 dígitos depois = decimal ("1.234,56", "1234.56", "1,5")
    const cabeca = t.slice(0, sep);
    if (cabeca.includes(t[sep])) return null;             // "1.2.3": ambíguo
    inteiro = cabeca.replace(/[.,]/g, '');
    frac = t.slice(sep + 1);
  } else {
    // "1.234" / "1.234.567" / "100": separadores são de milhar
    if (!/^\d{1,3}([.,]\d{3})+[.,]?$|^\d+[.,]?$/.test(t)) return null;
    inteiro = t.replace(/[.,]/g, '');
  }
  if (!/^\d+$/.test(inteiro || '0')) return null;
  const cents = Number(inteiro || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

export function formatCentsInput(cents) {
  if (!Number.isInteger(cents)) return '';
  const neg = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg + int + ',' + String(abs % 100).padStart(2, '0');
}

export const centsToReais = (cents) => cents / 100;
export const reaisToCents = (reais) => Math.round(Number(reais) * 100);

/* ---------------------------------------------------------------- percentuais */

// "10", "10,5", "7.25", "6 %" → pontos-base inteiros (1000, 1050, 725, 600); inválido → null.
export function parsePercentToBp(input) {
  const t = String(input ?? '').replace(/[%\s]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export function formatBpInput(bp) {
  if (!Number.isInteger(bp)) return '';
  const s = (bp / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '').replace('.', ',');
  return s;
}

// Taxa anual → taxa mensal EQUIVALENTE (composta), nunca anual ÷ 12.
// 10% a.a. → 0,797% a.m.  (1,10^(1/12) − 1)
export function annualToMonthly(annualRate) {
  if (!Number.isFinite(annualRate) || annualRate <= -1) return NaN;
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/* ---------------------------------------------------------------------- datas */

// Valida data real de calendário "AAAA-MM-DD" sem usar Date/fuso.
export function parseCalendarDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return null;
  return { y, m: mo, d };
}
export function formatDateBR(str) {
  const p = parseCalendarDate(str);
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : '';
}
// Diferença em meses de calendário entre duas datas (dia ignorado): usada em prazos de metas.
export function monthsBetween(fromStr, toStr) {
  const a = parseCalendarDate(fromStr), b = parseCalendarDate(toStr);
  if (!a || !b) return null;
  return (b.y - a.y) * 12 + (b.m - a.m);
}
export function pad2(n) { return String(n).padStart(2, '0'); }

/* ------------------------------------------------------ proventos recebidos */

// Resumo dos recebimentos INFORMADOS pelo usuário. Filtro por ativo e por ano.
// Nunca mistura com estimativas: recebe só a lista de registros manuais.
export function summarizeReceipts(receipts, { asset = '', year = null } = {}) {
  const lista = (receipts || []).filter(r => !asset || r.asset === asset);
  const anos = new Map();                                 // ano → centavos
  for (const r of lista) {
    const p = parseCalendarDate(r.receivedOn);
    if (!p) continue;
    anos.set(p.y, (anos.get(p.y) || 0) + r.amountCents);
  }
  const porMes = Array(12).fill(0);
  let totalAno = 0, contagemAno = 0;
  if (year != null) {
    for (const r of lista) {
      const p = parseCalendarDate(r.receivedOn);
      if (!p || p.y !== year) continue;
      porMes[p.m - 1] += r.amountCents; totalAno += r.amountCents; contagemAno++;
    }
  }
  return {
    porMes, totalAno, contagemAno,
    anos: [...anos.entries()].sort((a, b) => b[0] - a[0]).map(([y, cents]) => ({ year: y, cents })),
    total: lista.reduce((s, r) => s + r.amountCents, 0),
    contagem: lista.length,
  };
}

// Dias de um mês de calendário (sem Date/fuso).
export function daysInMonth(y, m) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
function _somaPeriodo(lista, y, m, ateDia) {
  let cents = 0, count = 0;
  for (const r of lista) {
    const p = parseCalendarDate(r.receivedOn);
    if (!p || p.y !== y || p.m !== m || p.d > ateDia) continue;
    cents += r.amountCents; count++;
  }
  return { cents, count };
}

// Estatística do mês selecionado, só com os registros do usuário, e comparação com o mês anterior
// em período COMPARÁVEL: se o mês selecionado está em andamento, os dois lados vão do dia 1 até o
// dia de hoje (limitado ao tamanho do mês anterior). Sem registros no período anterior não há
// percentual — não existe base para comparar. Mês futuro não tem estatística.
// `today` = { y, m, d } no calendário local.
export function receiptMonthStats(receipts, { year, month, asset = '', today }) {
  const lista = (receipts || []).filter(r => !asset || r.asset === asset);
  const pos = year * 12 + month, hoje = today.y * 12 + today.m;
  if (pos > hoje) return { futuro: true, emAndamento: false, year, month };
  const emAndamento = pos === hoje;
  const diasMes = daysInMonth(year, month);
  const ateDia = emAndamento ? Math.min(today.d, diasMes) : diasMes;
  const atual = _somaPeriodo(lista, year, month, ateDia);
  const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1;
  const diasAnt = daysInMonth(py, pm);
  const ateDiaAnt = emAndamento ? Math.min(ateDia, diasAnt) : diasAnt;
  const ant = _somaPeriodo(lista, py, pm, ateDiaAnt);
  return {
    futuro: false, emAndamento, year, month, ateDia, diasMes,
    atual,
    anterior: { year: py, month: pm, ateDia: ateDiaAnt, completo: ateDiaAnt === diasAnt, ...ant },
    variacaoPct: ant.cents > 0 ? (atual.cents - ant.cents) / ant.cents * 100 : null,
  };
}

// Divisão dos recebimentos registrados por ativo num ano (e, opcionalmente, num mês).
// `share` é a fração do total do período (0–1). Ordena do maior para o menor.
export function receiptsByAsset(receipts, { year, month = null }) {
  const mapa = new Map();
  let total = 0;
  for (const r of receipts || []) {
    const p = parseCalendarDate(r.receivedOn);
    if (!p || p.y !== year || (month != null && p.m !== month)) continue;
    const it = mapa.get(r.asset) || { asset: r.asset, cents: 0, count: 0 };
    it.cents += r.amountCents; it.count++; total += r.amountCents;
    mapa.set(r.asset, it);
  }
  return [...mapa.values()]
    .map(it => ({ ...it, share: total > 0 ? it.cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents || a.asset.localeCompare(b.asset, 'pt-BR'));
}

/* -------------------------------------------------- simulação de aporte (lista) */

// Simula um aporte SEM gravar nada: devolve a distribuição por classe antes e depois e a
// participação do ativo. Tudo em centavos inteiros.
//  - Ação e FII (wholeUnits): só unidades inteiras. Por valor, compra floor(valor ÷ preço) unidades
//    e o resto vira saldo não utilizado; por quantidade, exige número inteiro.
//  - Renda fixa, fundo e outros: aporte por valor, sem unidades e sem preço.
//  - Sem preço quando ele é necessário → erro, nunca um preço inventado.
//  - O ativo entra pelo custo do aporte: nenhuma valorização imediata é suposta.
// byClassCents: { rf, acao, fii, fundo, outro } com o valor atual da carteira em centavos.
export const SIM_CLASSES = ['rf', 'acao', 'fii', 'fundo', 'outro'];
export function simulateContribution({ byClassCents = {}, assetCents = 0, assetClass, priceCents = null,
  mode, amountCents = null, quantity = null, wholeUnits = false }) {
  if (!SIM_CLASSES.includes(assetClass)) return { ok: false, error: 'classe_invalida' };
  const temPreco = Number.isInteger(priceCents) && priceCents > 0;
  let units = null, costCents, leftoverCents = 0;
  if (mode === 'valor') {
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) return { ok: false, error: 'valor_invalido' };
    if (wholeUnits) {
      if (!temPreco) return { ok: false, error: 'sem_preco' };
      units = Math.floor(amountCents / priceCents);
      if (units < 1) return { ok: false, error: 'menos_de_uma_unidade', leftoverCents: amountCents };
      costCents = units * priceCents;
      leftoverCents = amountCents - costCents;
    } else {
      costCents = amountCents;
    }
  } else if (mode === 'quantidade') {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'quantidade_invalida' };
    if (wholeUnits && !Number.isInteger(quantity)) return { ok: false, error: 'quantidade_inteira' };
    if (!temPreco) return { ok: false, error: 'sem_preco' };
    units = quantity;
    costCents = Math.round(quantity * priceCents);
    if (costCents > MAX_CENTS) return { ok: false, error: 'valor_invalido' };
  } else return { ok: false, error: 'modo_invalido' };

  const antes = {}; for (const k of SIM_CLASSES) antes[k] = Math.max(0, Math.round(byClassCents[k] || 0));
  const depois = { ...antes, [assetClass]: antes[assetClass] + costCents };
  const soma = (o) => SIM_CLASSES.reduce((s, k) => s + o[k], 0);
  const totalAntes = soma(antes), totalDepois = soma(depois);
  const ativoAntes = Math.max(0, Math.round(assetCents || 0)), ativoDepois = ativoAntes + costCents;
  const share = (v, t) => (t > 0 ? v / t : null);
  return {
    ok: true, units, costCents, leftoverCents,
    before: { totalCents: totalAntes, byClass: antes, assetCents: ativoAntes, assetShare: share(ativoAntes, totalAntes),
      classShare: Object.fromEntries(SIM_CLASSES.map(k => [k, share(antes[k], totalAntes)])) },
    after: { totalCents: totalDepois, byClass: depois, assetCents: ativoDepois, assetShare: share(ativoDepois, totalDepois),
      classShare: Object.fromEntries(SIM_CLASSES.map(k => [k, share(depois[k], totalDepois)])) },
  };
}

// Total planejado na etapa "comprar": cada item conta UMA vez, por valor ou por quantidade × preço.
// Itens por quantidade sem preço disponível não entram na soma e são contados à parte.
export function plannedTotal(items) {
  let cents = 0, semPreco = 0, comPlano = 0;
  for (const it of items || []) {
    if (Number.isInteger(it.plannedAmountCents) && it.plannedAmountCents > 0) { cents += it.plannedAmountCents; comPlano++; }
    else if (typeof it.plannedQuantity === 'number' && it.plannedQuantity > 0) {
      comPlano++;
      if (Number.isInteger(it.priceCents) && it.priceCents > 0) cents += Math.round(it.plannedQuantity * it.priceCents);
      else semPreco++;
    }
  }
  return { cents, semPreco, comPlano };
}

/* ------------------------------------------------------------------- metas */

// Progresso de uma meta: atual/alvo. `restante` nunca fica negativo.
export function goalProgress({ targetCents, currentCents }) {
  if (!Number.isInteger(targetCents) || targetCents <= 0) return null;
  const atual = Math.max(0, Number.isFinite(currentCents) ? Math.round(currentCents) : 0);
  const restante = Math.max(0, targetCents - atual);
  return {
    atualCents: atual, restanteCents: restante,
    pct: Math.min(100, Math.floor((atual / targetCents) * 100)),
    atingida: atual >= targetCents,
  };
}
// Aporte linear necessário até o prazo, SEM rentabilidade (conta simples e conservadora).
export function linearMonthlyNeed({ restanteCents, monthsLeft }) {
  if (!Number.isFinite(monthsLeft) || monthsLeft <= 0 || restanteCents <= 0) return null;
  return Math.ceil(restanteCents / monthsLeft);
}

/* --------------------------------------------------------------- reserva */

export function reserveObjective({ monthlyExpenseCents, months }) {
  if (!Number.isInteger(monthlyExpenseCents) || monthlyExpenseCents <= 0) return null;
  if (!Number.isInteger(months) || months < 1 || months > 60) return null;
  const v = monthlyExpenseCents * months;
  return Number.isSafeInteger(v) && v <= MAX_CENTS ? v : null;
}
export function reserveProgress({ monthlyExpenseCents, months, linkedCents }) {
  const objetivo = reserveObjective({ monthlyExpenseCents, months });
  if (objetivo == null) return null;
  const p = goalProgress({ targetCents: objetivo, currentCents: linkedCents });
  const mesesCobertos = monthlyExpenseCents > 0 ? Math.floor((p.atualCents / monthlyExpenseCents) * 10) / 10 : 0;
  return { objetivoCents: objetivo, vinculadoCents: p.atualCents, restanteCents: p.restanteCents, pct: p.pct, atingida: p.atingida, mesesCobertos };
}

/* ------------------------------------------------- independência financeira */

export const INDEPENDENCE_DEFAULTS = Object.freeze({
  initialCents: null,                 // null = usar o patrimônio atual da carteira
  monthlyContributionCents: 50_000,   // R$ 500, valor anterior do simulador
  desiredIncomeCents: 350_000,        // R$ 3.500, valor anterior
  returnBp: 1000,                     // 10% a.a., taxa anterior
  incomeRateBp: 700,                  // 7% a.a., taxa anterior
  inflationBp: null,                  // opcional
});

export function validateIndependenceInput(p) {
  const erros = {};
  const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (p.initialCents != null && !inRange(p.initialCents, 0, MAX_CENTS)) erros.initialCents = 'Capital inicial inválido.';
  if (!inRange(p.monthlyContributionCents, 0, MAX_CENTS)) erros.monthlyContributionCents = 'Informe um aporte mensal igual ou maior que zero.';
  if (!inRange(p.desiredIncomeCents, 1, MAX_CENTS)) erros.desiredIncomeCents = 'Informe a renda mensal desejada, maior que zero.';
  if (!inRange(p.returnBp, -5000, 10000)) erros.returnBp = 'Rentabilidade anual deve ficar entre −50% e 100%.';
  if (!inRange(p.incomeRateBp, 1, 10000)) erros.incomeRateBp = 'A taxa para estimar renda deve ficar entre 0,01% e 100%.';
  if (p.inflationBp != null && !inRange(p.inflationBp, 0, 10000)) erros.inflationBp = 'Inflação anual deve ficar entre 0% e 100%.';
  return erros;
}

// Mês a mês: capital cresce pela taxa mensal EQUIVALENTE à rentabilidade anual; a renda
// estimada é capital × taxa mensal equivalente à taxa anual de renda. A renda desejada
// está em poder de compra de hoje; com inflação, a meta nominal sobe junto com ela.
// Os aportes ficam constantes em valor nominal (premissa explícita na tela).
// `patrimonioAtualCents` só é usado quando initialCents é null.
export function simulateIndependence(input, patrimonioAtualCents = 0) {
  const p = { ...INDEPENDENCE_DEFAULTS, ...input };
  const inicial = p.initialCents == null ? Math.max(0, Math.round(patrimonioAtualCents || 0)) : p.initialCents;
  const erros = validateIndependenceInput({ ...p, initialCents: inicial });
  if (Object.keys(erros).length) return { status: 'invalid', erros };

  const mr = annualToMonthly(p.returnBp / 10000);
  const mi = annualToMonthly(p.incomeRateBp / 10000);
  const mp = p.inflationBp == null ? 0 : annualToMonthly(p.inflationBp / 10000);
  const usaInflacao = p.inflationBp != null && p.inflationBp > 0;

  let capital = inicial;
  for (let n = 0; n <= MAX_SIM_MONTHS; n++) {
    const deflator = Math.pow(1 + mp, n);
    const metaNominal = p.desiredIncomeCents * deflator;
    const renda = capital * mi;
    if (renda >= metaNominal) {
      const r = (v) => Math.round(v);
      return {
        status: 'ok', reachable: true, months: n, years: Math.round((n / 12) * 10) / 10,
        usaInflacao, inicialCents: inicial,
        nominal: { capitalCents: r(capital), incomeCents: r(renda), targetIncomeCents: r(metaNominal) },
        real: usaInflacao ? { capitalCents: r(capital / deflator), incomeCents: r(renda / deflator), targetIncomeCents: p.desiredIncomeCents } : null,
        realReturnBp: usaInflacao ? Math.round(((1 + p.returnBp / 10000) / (1 + p.inflationBp / 10000) - 1) * 10000) : null,
      };
    }
    if (n === MAX_SIM_MONTHS || !Number.isFinite(capital)) break;   // o mês 600 é o último: sem aporte extra
    capital = capital * (1 + mr) + p.monthlyContributionCents;
    if (capital < 0) capital = 0;
  }
  return {
    status: 'ok', reachable: false, months: MAX_SIM_MONTHS, usaInflacao, inicialCents: inicial,
    nominal: { capitalCents: Number.isFinite(capital) ? Math.round(capital) : null },
  };
}

/* ------------------------------------------------------------------- Bazin */

export const BAZIN_DEFAULT_RATE_BP = 600;     // 6%, taxa de referência anterior

export function validateBazinInput({ priceCents, annualDividendCents, rateBp }) {
  const erros = {};
  if (priceCents != null && !(Number.isInteger(priceCents) && priceCents > 0 && priceCents <= MAX_CENTS)) erros.priceCents = 'Preço de referência deve ser maior que zero.';
  if (!(Number.isInteger(annualDividendCents) && annualDividendCents > 0 && annualDividendCents <= MAX_CENTS)) erros.annualDividendCents = 'Informe proventos anuais maiores que zero.';
  if (!(Number.isInteger(rateBp) && rateBp > 0 && rateBp <= 10000)) erros.rateBp = 'A taxa de referência deve ficar entre 0,01% e 100%.';
  return erros;
}
// teto = proventos anuais ÷ taxa de referência. É um cálculo de referência, não uma recomendação.
export function calcBazin({ priceCents = null, annualDividendCents, rateBp }) {
  const erros = validateBazinInput({ priceCents, annualDividendCents, rateBp });
  if (Object.keys(erros).length) return { status: 'invalid', erros };
  const ceilingCents = Math.round((annualDividendCents * 10000) / rateBp);
  const out = { status: 'ok', ceilingCents };
  if (priceCents != null) {
    out.diffPct = ((priceCents - ceilingCents) / ceilingCents) * 100;   // + acima do teto, − abaixo
    out.yieldPct = (annualDividendCents / priceCents) * 100;
  }
  return out;
}
