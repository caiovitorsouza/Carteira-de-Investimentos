import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoneyToCents, formatCentsInput, parsePercentToBp, formatBpInput, annualToMonthly,
  parseCalendarDate, formatDateBR, monthsBetween, summarizeReceipts, goalProgress,
  linearMonthlyNeed, reserveProgress, simulateIndependence, calcBazin, INDEPENDENCE_DEFAULTS,
  daysInMonth, receiptMonthStats, receiptsByAsset, simulateContribution, plannedTotal,
} from '../../public/finance-calc.js';

const CART = { rf: 400000, acao: 300000, fii: 300000, fundo: 0, outro: 0 };     // R$ 10.000,00
test('simulação por valor: só unidades inteiras, saldo não utilizado e novo total com o aporte', () => {
  const s = simulateContribution({ byClassCents: CART, assetCents: 0, assetClass: 'fii', priceCents: 3000, mode: 'valor', amountCents: 100000, wholeUnits: true });
  assert.equal(s.ok, true);
  assert.equal(s.units, 33);                  // R$ 1.000 ÷ R$ 30 = 33 cotas inteiras
  assert.equal(s.costCents, 99000);
  assert.equal(s.leftoverCents, 1000);        // R$ 10 sem comprar
  assert.equal(s.before.totalCents, 1000000);
  assert.equal(s.after.totalCents, 1099000);  // novo total inclui só o que foi aplicado
  assert.equal(s.after.byClass.fii, 399000);
  assert.equal(s.before.assetShare, 0);
  assert.equal(s.after.assetShare, 99000 / 1099000);
  assert.ok(Math.abs(Object.values(s.after.classShare).reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test('simulação: valor que não compra uma unidade inteira é recusado, sem arredondar para cima', () => {
  const s = simulateContribution({ byClassCents: CART, assetClass: 'acao', priceCents: 5000, mode: 'valor', amountCents: 4999, wholeUnits: true });
  assert.deepEqual([s.ok, s.error, s.leftoverCents], [false, 'menos_de_uma_unidade', 4999]);
});
test('simulação por quantidade: custo = quantidade × preço; ativo que já está na carteira', () => {
  const s = simulateContribution({ byClassCents: CART, assetCents: 100000, assetClass: 'acao', priceCents: 1234, mode: 'quantidade', quantity: 10, wholeUnits: true });
  assert.equal(s.costCents, 12340);
  assert.equal(s.before.assetShare, 0.1);
  assert.equal(s.after.assetCents, 112340);   // entra pelo custo: nenhuma valorização suposta
  assert.equal(simulateContribution({ byClassCents: CART, assetClass: 'acao', priceCents: 1234, mode: 'quantidade', quantity: 1.5, wholeUnits: true }).error, 'quantidade_inteira');
});
test('simulação: sem preço quando ele é necessário → erro; renda fixa por valor não precisa de preço', () => {
  assert.equal(simulateContribution({ byClassCents: CART, assetClass: 'fii', mode: 'valor', amountCents: 100000, wholeUnits: true }).error, 'sem_preco');
  assert.equal(simulateContribution({ byClassCents: CART, assetClass: 'acao', mode: 'quantidade', quantity: 3, wholeUnits: true }).error, 'sem_preco');
  const rf = simulateContribution({ byClassCents: CART, assetClass: 'rf', mode: 'valor', amountCents: 50000 });
  assert.deepEqual([rf.ok, rf.units, rf.costCents, rf.leftoverCents, rf.after.byClass.rf], [true, null, 50000, 0, 450000]);
  assert.equal(simulateContribution({ byClassCents: CART, assetClass: 'xx', mode: 'valor', amountCents: 1 }).error, 'classe_invalida');
  assert.equal(simulateContribution({ byClassCents: CART, assetClass: 'rf', mode: 'valor', amountCents: 0 }).error, 'valor_invalido');
});
test('simulação com carteira vazia: participação antes indefinida, depois 100%', () => {
  const s = simulateContribution({ byClassCents: {}, assetClass: 'outro', mode: 'valor', amountCents: 2500 });
  assert.equal(s.before.assetShare, null);
  assert.equal(s.after.assetShare, 1);
});
test('total planejado conta cada item uma vez (valor OU quantidade × preço) e separa os sem preço', () => {
  const t = plannedTotal([
    { plannedAmountCents: 100000 },
    { plannedQuantity: 10, priceCents: 2500 },
    { plannedQuantity: 5, priceCents: null },
    { plannedAmountCents: null, plannedQuantity: null },
  ]);
  assert.deepEqual(t, { cents: 125000, semPreco: 1, comPlano: 3 });
});

const R = (asset, receivedOn, amountCents) => ({ asset, receivedOn, amountCents });
test('estatística do mês: mês em andamento compara com o mesmo período do mês anterior', () => {
  const recs = [R('AAAA11', '2026-09-05', 1000), R('AAAA11', '2026-09-25', 9000), R('BBBB3', '2026-10-03', 1500), R('AAAA11', '2026-10-13', 500)];
  const s = receiptMonthStats(recs, { year: 2026, month: 10, today: { y: 2026, m: 10, d: 13 } });
  assert.equal(s.emAndamento, true);
  assert.equal(s.ateDia, 13);
  assert.deepEqual(s.atual, { cents: 2000, count: 2 });
  // setembro só até o dia 13: o pagamento do dia 25 não entra (período comparável)
  assert.equal(s.anterior.cents, 1000);
  assert.equal(s.anterior.ateDia, 13);
  assert.equal(s.anterior.completo, false);
  assert.equal(s.variacaoPct, 100);
});
test('estatística do mês: mês completo compara com o mês anterior inteiro', () => {
  const recs = [R('AAAA11', '2026-09-05', 1000), R('AAAA11', '2026-09-30', 9000), R('AAAA11', '2026-08-31', 5000)];
  const s = receiptMonthStats(recs, { year: 2026, month: 9, today: { y: 2026, m: 10, d: 13 } });
  assert.equal(s.emAndamento, false);
  assert.deepEqual(s.atual, { cents: 10000, count: 2 });
  assert.equal(s.anterior.completo, true);
  assert.equal(s.anterior.cents, 5000);
  assert.equal(s.variacaoPct, 100);
});
test('estatística do mês: sem registros no período anterior não gera percentual', () => {
  const s = receiptMonthStats([R('AAAA11', '2026-03-10', 700)], { year: 2026, month: 3, today: { y: 2026, m: 10, d: 1 } });
  assert.equal(s.anterior.cents, 0);
  assert.equal(s.anterior.count, 0);
  assert.equal(s.variacaoPct, null);
});
test('estatística do mês: janeiro compara com dezembro do ano anterior; 31 limita ao tamanho do mês anterior', () => {
  const s = receiptMonthStats([R('A', '2025-12-31', 300), R('A', '2026-01-02', 600)], { year: 2026, month: 1, today: { y: 2026, m: 3, d: 31 } });
  assert.deepEqual([s.anterior.year, s.anterior.month, s.anterior.cents], [2025, 12, 300]);
  const em = receiptMonthStats([R('A', '2026-02-28', 400)], { year: 2026, month: 3, today: { y: 2026, m: 3, d: 31 } });
  assert.equal(em.anterior.ateDia, 28);          // fevereiro de 2026 tem 28 dias
  assert.equal(em.anterior.completo, true);
  assert.equal(daysInMonth(2028, 2), 29);
});
test('estatística do mês: mês futuro não tem estatística; filtro por ativo', () => {
  assert.equal(receiptMonthStats([], { year: 2026, month: 11, today: { y: 2026, m: 10, d: 13 } }).futuro, true);
  const recs = [R('AAAA11', '2026-09-05', 1000), R('BBBB3', '2026-09-06', 2000)];
  assert.equal(receiptMonthStats(recs, { year: 2026, month: 9, asset: 'BBBB3', today: { y: 2026, m: 10, d: 13 } }).atual.cents, 2000);
});
test('divisão por ativo: ano ou mês, participação e ordem', () => {
  const recs = [R('AAAA11', '2026-09-05', 1000), R('BBBB3', '2026-09-06', 3000), R('AAAA11', '2026-10-01', 1000), R('CCCC11', '2025-09-01', 9999), R('XX', 'inválida', 50)];
  const ano = receiptsByAsset(recs, { year: 2026 });
  assert.deepEqual(ano.map(x => [x.asset, x.cents, x.count]), [['BBBB3', 3000, 1], ['AAAA11', 2000, 2]]);
  assert.equal(ano[0].share, 0.6);
  const mes = receiptsByAsset(recs, { year: 2026, month: 10 });
  assert.deepEqual(mes.map(x => [x.asset, x.share]), [['AAAA11', 1]]);
  assert.deepEqual(receiptsByAsset(recs, { year: 2024 }), []);
});

test('dinheiro vira centavos inteiros, sem erro de ponto flutuante', () => {
  assert.equal(parseMoneyToCents('R$ 1.234,56'), 123456);
  assert.equal(parseMoneyToCents('1234,56'), 123456);
  assert.equal(parseMoneyToCents('1234.56'), 123456);
  assert.equal(parseMoneyToCents('0,10'), 10);
  assert.equal(parseMoneyToCents('0,29'), 29);        // 0,29*100 em float dá 28.999…
  assert.equal(parseMoneyToCents('1.005,05'), 100505);
  assert.equal(parseMoneyToCents('100'), 10000);
  assert.equal(parseMoneyToCents('1.234'), 123400);   // milhar, não decimal
  assert.equal(parseMoneyToCents('1,5'), 150);
  assert.equal(parseMoneyToCents('1.234.567'), 123456700);
  assert.equal(parseMoneyToCents('0'), 0);
});
test('dinheiro inválido devolve null', () => {
  for (const x of ['', ' ', 'abc', '1,2,3', '1.2.3', '-5', '12.34.567', '1e5', null, undefined, 'R$']) {
    assert.equal(parseMoneyToCents(x), null, String(x));
  }
  assert.equal(parseMoneyToCents('999999999999999'), null);   // acima do teto
});
test('formatCentsInput é inverso de parse', () => {
  for (const c of [0, 5, 10, 99, 100, 123456, 100000000]) assert.equal(parseMoneyToCents(formatCentsInput(c)), c);
  assert.equal(formatCentsInput(123456), '1.234,56');
  assert.equal(formatCentsInput(1.5), '');
});
test('percentual vira pontos-base', () => {
  assert.equal(parsePercentToBp('10'), 1000);
  assert.equal(parsePercentToBp('10,5 %'), 1050);
  assert.equal(parsePercentToBp('7.25'), 725);
  assert.equal(parsePercentToBp('abc'), null);
  assert.equal(parsePercentToBp('1,234'), null);
  assert.equal(formatBpInput(1000), '10');
  assert.equal(formatBpInput(1050), '10,5');
  assert.equal(formatBpInput(725), '7,25');
});

test('taxa anual → mensal usa conversão composta, não ÷ 12', () => {
  const m = annualToMonthly(0.10);
  assert.ok(Math.abs(m - 0.00797414) < 1e-8);
  assert.ok(m < 0.10 / 12);
  assert.ok(Math.abs(Math.pow(1 + m, 12) - 1.10) < 1e-12);       // 12 meses recompõem a taxa anual
  assert.equal(annualToMonthly(0), 0);
  assert.ok(annualToMonthly(-0.2) < 0);
  assert.ok(Number.isNaN(annualToMonthly(-1)));
  assert.ok(Number.isNaN(annualToMonthly(NaN)));
});

test('datas de calendário não passam por fuso', () => {
  assert.deepEqual(parseCalendarDate('2026-10-12'), { y: 2026, m: 10, d: 12 });
  assert.equal(parseCalendarDate('2026-02-30'), null);
  assert.equal(parseCalendarDate('2024-02-29').d, 29);          // bissexto
  assert.equal(parseCalendarDate('2026-02-29'), null);
  assert.equal(parseCalendarDate('2026-13-01'), null);
  assert.equal(parseCalendarDate('12/10/2026'), null);
  assert.equal(parseCalendarDate('2026-10-12T00:00:00Z'), null);
  assert.equal(formatDateBR('2026-01-31'), '31/01/2026');
  assert.equal(monthsBetween('2026-10-12', '2027-01-01'), 3);
  assert.equal(monthsBetween('2026-10-12', 'x'), null);
});

test('resumo de recebimentos: mês, ano e filtro por ativo', () => {
  const rs = [
    { asset: 'MXRF11', receivedOn: '2026-01-15', amountCents: 1000 },
    { asset: 'MXRF11', receivedOn: '2026-01-31', amountCents: 250 },
    { asset: 'KNRI11', receivedOn: '2026-01-10', amountCents: 5000 },
    { asset: 'MXRF11', receivedOn: '2025-12-31', amountCents: 700 },
    { asset: 'KNRI11', receivedOn: '2026-12-01', amountCents: 1 },
  ];
  const all = summarizeReceipts(rs, { year: 2026 });
  assert.equal(all.porMes[0], 6250);
  assert.equal(all.porMes[11], 1);
  assert.equal(all.totalAno, 6251);
  assert.equal(all.contagemAno, 4);
  assert.deepEqual(all.anos, [{ year: 2026, cents: 6251 }, { year: 2025, cents: 700 }]);
  const mx = summarizeReceipts(rs, { year: 2026, asset: 'MXRF11' });
  assert.equal(mx.totalAno, 1250);
  assert.equal(mx.total, 1950);
  assert.equal(summarizeReceipts([], { year: 2026 }).totalAno, 0);
  // 31/12 e 01/01 não escorregam de ano
  assert.equal(summarizeReceipts([{ asset: 'A', receivedOn: '2025-12-31', amountCents: 5 }], { year: 2026 }).totalAno, 0);
});

test('progresso de meta', () => {
  assert.deepEqual(goalProgress({ targetCents: 1000, currentCents: 250 }), { atualCents: 250, restanteCents: 750, pct: 25, atingida: false });
  assert.equal(goalProgress({ targetCents: 1000, currentCents: 5000 }).restanteCents, 0);
  assert.equal(goalProgress({ targetCents: 1000, currentCents: 5000 }).pct, 100);
  assert.equal(goalProgress({ targetCents: 1000, currentCents: 5000 }).atingida, true);
  assert.equal(goalProgress({ targetCents: 0, currentCents: 5 }), null);
  assert.equal(goalProgress({ targetCents: 1000, currentCents: NaN }).atualCents, 0);
  assert.equal(linearMonthlyNeed({ restanteCents: 1000, monthsLeft: 3 }), 334);
  assert.equal(linearMonthlyNeed({ restanteCents: 1000, monthsLeft: 0 }), null);
  assert.equal(linearMonthlyNeed({ restanteCents: 0, monthsLeft: 4 }), null);
});

test('reserva: objetivo, vinculado, progresso e restante', () => {
  const r = reserveProgress({ monthlyExpenseCents: 300000, months: 6, linkedCents: 900000 });
  assert.equal(r.objetivoCents, 1800000);
  assert.equal(r.vinculadoCents, 900000);
  assert.equal(r.restanteCents, 900000);
  assert.equal(r.pct, 50);
  assert.equal(r.mesesCobertos, 3);
  assert.equal(reserveProgress({ monthlyExpenseCents: 300000, months: 6, linkedCents: 0 }).pct, 0);
  assert.equal(reserveProgress({ monthlyExpenseCents: 0, months: 6, linkedCents: 1 }), null);
  assert.equal(reserveProgress({ monthlyExpenseCents: 100, months: 0, linkedCents: 1 }), null);
  assert.equal(reserveProgress({ monthlyExpenseCents: 100, months: 61, linkedCents: 1 }), null);
  assert.equal(reserveProgress({ monthlyExpenseCents: 100, months: 2, linkedCents: 999 }).atingida, true);
});

const base = { ...INDEPENDENCE_DEFAULTS, initialCents: 0, monthlyContributionCents: 100000, desiredIncomeCents: 100000, returnBp: 1000, incomeRateBp: 700, inflationBp: null };

test('independência: valores padrão preservam as taxas anteriores (10% e 7%)', () => {
  assert.equal(INDEPENDENCE_DEFAULTS.returnBp, 1000);
  assert.equal(INDEPENDENCE_DEFAULTS.incomeRateBp, 700);
  assert.equal(INDEPENDENCE_DEFAULTS.desiredIncomeCents, 350000);
  assert.equal(INDEPENDENCE_DEFAULTS.monthlyContributionCents, 50000);
  assert.equal(INDEPENDENCE_DEFAULTS.initialCents, null);
});
test('independência: simulação confere com cálculo manual mês a mês', () => {
  const r = simulateIndependence(base);
  assert.equal(r.reachable, true);
  // reconstrói a trajetória por fora
  const mr = Math.pow(1.10, 1 / 12) - 1, mi = Math.pow(1.07, 1 / 12) - 1;
  let k = 0, n = 0;
  while (k * mi < 100000) { k = k * (1 + mr) + 100000; n++; }
  assert.equal(r.months, n);
  assert.equal(r.nominal.capitalCents, Math.round(k));
  assert.equal(r.real, null);                                  // sem inflação: só nominal
  assert.ok(r.nominal.incomeCents >= 100000);
});
test('independência: capital já suficiente → 0 meses', () => {
  const r = simulateIndependence({ ...base, initialCents: 100_000_000 });
  assert.equal(r.months, 0);
  assert.equal(r.reachable, true);
});
test('independência: usa patrimônio atual quando o capital inicial é null', () => {
  const a = simulateIndependence({ ...base, initialCents: null }, 5_000_000);
  const b = simulateIndependence({ ...base, initialCents: 5_000_000 });
  assert.equal(a.months, b.months);
  assert.equal(a.inicialCents, 5_000_000);
});
test('independência: inflação eleva a meta nominal e separa poder de compra', () => {
  const sem = simulateIndependence(base);
  const com = simulateIndependence({ ...base, inflationBp: 450 });
  assert.ok(com.months > sem.months);
  assert.ok(com.usaInflacao);
  assert.ok(com.nominal.capitalCents > com.real.capitalCents);          // nominal > poder de compra
  assert.equal(com.real.targetIncomeCents, 100000);                     // meta em valores de hoje
  assert.ok(com.nominal.targetIncomeCents > 100000);
  const deflator = Math.pow(1.045, com.months / 12);
  assert.ok(Math.abs(com.nominal.capitalCents / deflator - com.real.capitalCents) <= 1);
  assert.ok(com.realReturnBp < 1000 && com.realReturnBp > 0);
  // inflação 0% informada = sem efeito sobre o prazo
  assert.equal(simulateIndependence({ ...base, inflationBp: 0 }).months, sem.months);
});
test('independência: cenário inalcançável não trava nem promete', () => {
  const r = simulateIndependence({ ...base, initialCents: 0, monthlyContributionCents: 0 });
  assert.equal(r.status, 'ok');
  assert.equal(r.reachable, false);
  const t = simulateIndependence({ ...base, monthlyContributionCents: 100, desiredIncomeCents: 10_000_000_000 });
  assert.equal(t.reachable, false);
  assert.equal(t.months, 600);
  // rentabilidade negativa com capital pequeno
  assert.equal(simulateIndependence({ ...base, returnBp: -3000, monthlyContributionCents: 0, initialCents: 1000 }).reachable, false);
});
test('independência: entradas inválidas são recusadas sem exceção', () => {
  for (const patch of [
    { desiredIncomeCents: 0 }, { desiredIncomeCents: NaN }, { incomeRateBp: 0 }, { incomeRateBp: 20000 },
    { returnBp: -9000 }, { returnBp: 99999 }, { monthlyContributionCents: -1 }, { inflationBp: -5 },
    { initialCents: -1 }, { monthlyContributionCents: 1.5 }, { desiredIncomeCents: 'x' },
  ]) {
    const r = simulateIndependence({ ...base, ...patch });
    assert.equal(r.status, 'invalid', JSON.stringify(patch));
    assert.ok(Object.keys(r.erros).length >= 1);
  }
});

test('Bazin: teto = proventos anuais ÷ taxa; entradas inválidas não quebram', () => {
  const r = calcBazin({ annualDividendCents: 480, rateBp: 600, priceCents: 5620 });
  assert.equal(r.ceilingCents, 8000);
  assert.ok(r.diffPct < 0);                                    // preço abaixo do teto
  assert.ok(Math.abs(r.yieldPct - (480 / 5620) * 100) < 1e-9);
  assert.equal(calcBazin({ annualDividendCents: 480, rateBp: 600 }).diffPct, undefined);
  assert.equal(calcBazin({ annualDividendCents: 100, rateBp: 650 }).ceilingCents, 1538);   // 100/0,065
  for (const bad of [{ annualDividendCents: 0, rateBp: 600 }, { annualDividendCents: 100, rateBp: 0 },
    { annualDividendCents: 100, rateBp: 10001 }, { annualDividendCents: -1, rateBp: 600 },
    { annualDividendCents: 100, rateBp: 600, priceCents: 0 }, { annualDividendCents: NaN, rateBp: 600 }]) {
    assert.equal(calcBazin(bad).status, 'invalid', JSON.stringify(bad));
  }
});

test('independência: no limite de 600 meses há exatamente 600 aportes (sem aporte extra)', () => {
  // capital 0, R$ 500/mês, rentabilidade 0%: após 600 meses são 600 × 500 = R$ 300.000,00
  const r = simulateIndependence({ initialCents: 0, monthlyContributionCents: 50000, returnBp: 0, desiredIncomeCents: 100_000_000, incomeRateBp: 700, inflationBp: null });
  assert.equal(r.reachable, false);
  assert.equal(r.months, 600);
  assert.equal(r.nominal.capitalCents, 30_000_000);
  // com capital inicial: inicial + 600 aportes
  const c = simulateIndependence({ initialCents: 1_000_000, monthlyContributionCents: 10000, returnBp: 0, desiredIncomeCents: 100_000_000, incomeRateBp: 700, inflationBp: null });
  assert.equal(c.nominal.capitalCents, 1_000_000 + 600 * 10000);
});
test('independência: mês de chegada e capital conhecidos (rentabilidade 0%)', () => {
  // capital = n × R$ 1.000; renda = capital × taxa mensal equivalente a 7% a.a.; meta R$ 1.000/mês
  const mi = Math.pow(1.07, 1 / 12) - 1;
  const nEsperado = Math.ceil(1 / mi - 1e-12);          // primeiro n com n × 1000 × mi ≥ 1000
  const r = simulateIndependence({ initialCents: 0, monthlyContributionCents: 100000, returnBp: 0, desiredIncomeCents: 100000, incomeRateBp: 700, inflationBp: null });
  assert.equal(r.months, nEsperado);
  assert.equal(nEsperado, 177);
  assert.equal(r.nominal.capitalCents, 177 * 100000);   // exatamente 177 aportes, nem 176 nem 178
  assert.ok(r.nominal.incomeCents >= 100000);
  assert.ok(Math.round((176 * 100000) * mi) < 100000);  // 176 meses não bastariam
});
