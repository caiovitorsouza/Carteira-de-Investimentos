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
