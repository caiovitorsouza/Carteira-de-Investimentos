// Sleep Score v2.1: cenários da especificação e regressões da revisão, com carteiras fictícias.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSleepScore, issuerOf, accessOf, reserveEligibility, reserveSummary, SLEEP_WEIGHTS, MIN_COVERAGE } from '../../public/sleep-score.js';

const today = { y: 2026, m: 10, d: 13 };
// ativo de bolsa com classe verificada no catálogo (classe = kind, salvo indicação)
const A = (ticker, kind, v, extra = {}) => ({ id: ticker, kind, ticker, classe: kind, label: ticker, valueCents: v, hasQuote: true, ...extra });
const RF = (id, kind, v, extra = {}) => ({ id, kind, ticker: null, label: id, valueCents: v, ...extra });
const DEF = (ids, gasto = 100000, meses = 6) => ({ state: 'definida', monthlyExpenseCents: gasto, months: meses, linkedPositionIds: ids });
const NAO = { state: 'nao_definida' };

test('carteira vazia: sem nota e sem dimensões', () => {
  const r = computeSleepScore({ items: [], reserva: NAO, today });
  assert.equal(r.status, 'vazio');
  assert.equal(r.score, null);
});

test('carteira concentrada em um ativo: concentração zero e explicação do maior emissor', () => {
  const r = computeSleepScore({ items: [A('PETR4', 'acao', 1000000)], reserva: NAO, today });
  assert.equal(r.dimensions.concentracao.score, 0);
  assert.equal(r.dimensions.concentracao.factors.nEff, 1);
  assert.equal(r.dimensions.concentracao.factors.maiorEmissor.share, 1);
  assert.match(r.explanations[0], /Maior emissor identificado: PETR4, 100% do valor/);
});

test('vários ativos do mesmo emissor não contam como independentes; cadastros equivalentes dão o mesmo resultado', () => {
  const R = DEF([]);
  const separado = computeSleepScore({ items: [A('PETR3', 'acao', 500000), A('PETR4', 'acao', 500000), A('VALE3', 'acao', 1000000)], reserva: R, today });
  const junto = computeSleepScore({ items: [A('PETR4', 'acao', 1000000), A('VALE3', 'acao', 1000000)], reserva: R, today });
  assert.equal(separado.dimensions.concentracao.factors.emissores, 2);
  assert.equal(separado.dimensions.concentracao.score, junto.dimensions.concentracao.score);
  assert.equal(separado.score, junto.score);
  assert.ok(separado.explanations.some(e => /PETR3 e PETR4 contam como um só emissor/.test(e)));
  const t2 = computeSleepScore({ items: [RF('s1', 'selic', 300000), RF('s2', 'selic', 700000), A('VALE3', 'acao', 1000000)], reserva: R, today });
  const t1 = computeSleepScore({ items: [RF('s', 'selic', 1000000), A('VALE3', 'acao', 1000000)], reserva: R, today });
  assert.equal(t2.score, t1.score);
  const e = computeSleepScore({ items: [RF('c1', 'cdb', 500000, { emissor: 'Banco Fictício S.A.', liq: 'ate1' }), RF('c2', 'lci', 500000, { emissor: 'fictício', liq: 'ate1' })], reserva: R, today });
  assert.equal(e.dimensions.concentracao.factors.emissores, 1);
});

test('diversificação: número efetivo de emissores e escala logarítmica até 10', () => {
  const dez = Array.from({ length: 10 }, (_, i) => A(`AB${String.fromCharCode(65 + i)}C3`, 'acao', 100000));
  assert.equal(computeSleepScore({ items: dez, reserva: NAO, today }).dimensions.concentracao.score, 100);
  const dois = computeSleepScore({ items: [A('AAAA3', 'acao', 100000), A('BBBB3', 'acao', 100000)], reserva: NAO, today });
  assert.equal(dois.dimensions.concentracao.score, Math.round(Math.log(2) / Math.log(10) * 100));   // 30
});

test('emissor desconhecido entra no pior caso (junto do maior emissor), nunca como emissor novo', () => {
  const com = computeSleepScore({ items: [RF('a', 'cdb', 500000, { liq: 'ate1', emissor: 'Banco A' }), RF('b', 'cdb', 500000, { liq: 'ate1', emissor: 'Banco B' })], reserva: NAO, today });
  const umSem = computeSleepScore({ items: [RF('a', 'cdb', 500000, { liq: 'ate1', emissor: 'Banco A' }), RF('b', 'cdb', 500000, { liq: 'ate1' })], reserva: NAO, today });
  assert.equal(com.dimensions.concentracao.score, 30);
  assert.equal(umSem.dimensions.concentracao.factors.nEff, 1);      // pior caso: mesmo emissor
  assert.equal(umSem.dimensions.concentracao.score, null);          // 50% identificado < 60%: sem nota
  assert.equal(issuerOf(RF('x', 'cdb', 1)).identified, false);
  assert.equal(issuerOf(RF('x', 'cdb', 1, { emissor: { nome: 'X' } })).identified, false);   // objeto não é emissor
  const tres = computeSleepScore({ items: [RF('a', 'cdb', 400000, { liq: 'ate1', emissor: 'Banco A' }), RF('b', 'cdb', 400000, { liq: 'ate1', emissor: 'Banco B' }), RF('c', 'cdb', 200000, { liq: 'ate1' })], reserva: NAO, today });
  assert.ok(Math.abs(tres.dimensions.concentracao.factors.hhi - (0.6 ** 2 + 0.4 ** 2)) < 1e-12);
  assert.equal(tres.dimensions.concentracao.status, 'parcial');
  assert.ok(tres.limitations.some(l => /Sem emissor informado: c \(20% do valor\)/.test(l)));
});

test('prazo desconhecido conta como o mais longo; abaixo de 60% conhecido, o acesso fica sem nota', () => {
  const r = computeSleepScore({ items: [A('VALE3', 'acao', 500000), RF('cdb', 'cdb', 500000, { emissor: 'X' })], reserva: DEF([]), today });
  assert.equal(r.dimensions.acesso.coverage, 0.5);
  assert.equal(r.dimensions.acesso.score, null);
  assert.equal(r.score, null);
  assert.deepEqual(r.motivos, ['acesso_insuficiente']);
  const parcial = computeSleepScore({ items: [A('VALE3', 'acao', 700000), RF('cdb', 'cdb', 300000, { emissor: 'X' })], reserva: NAO, today });
  assert.equal(parcial.dimensions.acesso.score, Math.round(0.7 * 75));   // CDB conta como 0, não fica de fora
  assert.equal(parcial.dimensions.acesso.status, 'parcial');
  const diaria = computeSleepScore({ items: [A('VALE3', 'acao', 500000), RF('cdb', 'cdb', 500000, { liq: 'ate1', emissor: 'X' })], reserva: NAO, today });
  const longa = computeSleepScore({ items: [A('VALE3', 'acao', 500000), RF('cdb', 'cdb', 500000, { liq: 'mais30', emissor: 'X' })], reserva: NAO, today });
  assert.equal(diaria.dimensions.acesso.score, Math.round((0.5 * 0.75 + 0.5 * 1) * 100));
  assert.equal(longa.dimensions.acesso.score, Math.round(0.5 * 0.75 * 100));
});

test('prazo: renda fixa não significa liquidez; bolsa só com classe verificada no catálogo', () => {
  assert.equal(accessOf(RF('x', 'cdb', 1, { liq: 'data', liqData: '2027-03-01' }), today).level, 'mais30');
  assert.equal(accessOf(RF('x', 'lci', 1, { liq: 'data', liqData: '2026-10-30' }), today).level, 'ate30');
  assert.equal(accessOf(RF('x', 'lci', 1, { liq: 'data', liqData: '2026-10-01' }), today).level, 'ate1');   // carência já passou
  assert.equal(accessOf(RF('x', 'cdb', 1, { liq: 'data', liqData: '2026-02-31' }), today).level, null);     // data inexistente
  assert.equal(accessOf(RF('x', 'lca', 1), today).level, null);
  assert.deepEqual([accessOf(RF('x', 'ipca', 1), today).level, accessOf(RF('x', 'ipca', 1), today).marketPriced], ['ate1', true]);
  assert.equal(accessOf(A('BOVA11', 'fii', 1, { classe: 'etf' }), today).level, null);   // ETF cadastrado como FII: vale a classe do catálogo
  assert.equal(accessOf(A('XXXX11', 'fii', 1, { classe: null }), today).level, null);    // sem classe verificada: desconhecido
  assert.equal(accessOf(A('YYYY34', 'acao', 1, { classe: 'bdr' }), today).level, null);  // BDR: prazo não conferido em fonte primária
  const r = computeSleepScore({ items: [A('XXXX11', 'fii', 500000, { classe: null }), A('VALE3', 'acao', 500000)], reserva: NAO, today });
  assert.ok(r.limitations.some(l => /Classe não confirmada no catálogo de ativos para XXXX11/.test(l)));
});

test('reserva: valor vinculado ≠ cobertura considerada (prazo de liquidação não basta)', () => {
  const items = [
    RF('selic', 'selic', 100000), RF('pre', 'pre', 100000), RF('ipca', 'ipca', 100000), A('VALE3', 'acao', 100000),
    RF('cdbOk', 'cdb', 100000, { liq: 'ate1', resgate: 'estavel' }), RF('cdbSemResgate', 'cdb', 100000, { liq: 'ate1' }),
    RF('fundoMercado', 'fundo', 100000, { liq: 'ate1', resgate: 'mercado' }), RF('cdbSemPrazo', 'cdb', 100000, { resgate: 'estavel' }),
    RF('lciCarencia', 'lci', 100000, { liq: 'data', liqData: '2027-01-01', resgate: 'estavel' }),
  ];
  const s = reserveSummary({ items, reserva: DEF(items.map(i => i.id).concat('apagada')), today });
  assert.equal(s.vinculadoCents, 900000);
  assert.equal(s.consideradoCents, 200000);       // só Tesouro Selic e o CDB com os dois dados
  assert.equal(s.faltaDadoCents, 200000);         // sem resgate informado e sem prazo
  assert.equal(s.ausentes, 1);
  const motivo = Object.fromEntries(s.posicoes.map(p => [p.id, p.motivo]));
  assert.match(motivo.pre, /preço de mercado/);
  assert.match(motivo.ipca, /preço de mercado/);
  assert.match(motivo.VALE3, /2 dias úteis/);
  assert.match(motivo.fundoMercado, /pode variar/);
  assert.match(motivo.lciCarencia, /mais de 1 dia útil/);
  assert.equal(reserveEligibility(RF('x', 'cdb', 1, { liq: 'ate1', resgate: 'estavel' }), today).conta, true);
  const r = computeSleepScore({ items, reserva: DEF(items.map(i => i.id), 100000, 4), today });
  assert.equal(r.dimensions.reserva.score, 50);   // 200 mil considerados de 400 mil
  assert.equal(r.dimensions.reserva.status, 'parcial');
});

test('reserva não definida, com falha ou carregando: dimensões aparecem, sem nota geral e sem renormalizar pesos', () => {
  const items = [RF('selic', 'selic', 600000), A('VALE3', 'acao', 400000)];
  const estados = { nao_definida: NAO, falha: { state: 'falha' }, carregando: { state: 'carregando' }, ausente: undefined };
  for (const [nome, reserva] of Object.entries(estados)) {
    const r = computeSleepScore({ items, reserva, today });
    assert.equal(r.score, null, nome);
    assert.equal(r.status, 'indisponivel', nome);
    assert.notEqual(r.dimensions.concentracao.score, null, nome);
    assert.notEqual(r.dimensions.acesso.score, null, nome);
    assert.deepEqual(r.contribuicoes, {}, nome);
  }
  assert.deepEqual(computeSleepScore({ items, reserva: { state: 'falha' }, today }).motivos, ['reserva_falha']);
  assert.ok(computeSleepScore({ items, reserva: { state: 'falha' }, today }).limitations.some(l => /Nenhum dado antigo é usado/.test(l)));
  assert.deepEqual(computeSleepScore({ items, today }).motivos, ['reserva_falha']);   // estado desconhecido nunca vira "sem reserva"
  assert.deepEqual(computeSleepScore({ items, reserva: NAO, today }).motivos, ['reserva_nao_definida']);
});

/* ---------- regressões da revisão: perder informação não pode aumentar a nota ---------- */
const BASE = [
  RF('cdbLongo', 'cdb', 1200000, { emissor: 'Banco X', liq: 'mais30', resgate: 'estavel' }),
  RF('lciX', 'lci', 1500000, { emissor: 'Banco X', liq: 'ate30', resgate: 'estavel' }),
  RF('selic', 'selic', 2000000), A('PETR4', 'acao', 800000), A('TEST11', 'fii', 700000),
];
const nota = (items, reserva) => computeSleepScore({ items, reserva, today });
const naoAumentou = (antes, depois, msg) => assert.ok(depois.score == null || (antes.score != null && depois.score <= antes.score), `${msg}: ${antes.score} → ${depois.score}`);

test('regressão 1: apagar o prazo da posição menos líquida não aumenta a nota', () => {
  const R = DEF(['selic', 'lciX'], 500000);
  const antes = nota(BASE, R), depois = nota(BASE.map(i => i.id === 'cdbLongo' ? { ...i, liq: undefined } : i), R);
  naoAumentou(antes, depois, 'prazo apagado');
  assert.ok(depois.dimensions.acesso.score <= antes.dimensions.acesso.score);
  assert.equal(depois.status, 'parcial');
});

test('regressão 2: apagar o emissor de uma posição do mesmo banco não cria diversificação', () => {
  const R = DEF(['selic', 'lciX'], 500000);
  const b2 = [...BASE, RF('cdbSem', 'cdb', 600000, { liq: 'ate1', resgate: 'estavel' })];
  const antes = nota(b2, R), depois = nota(b2.map(i => i.id === 'lciX' ? { ...i, emissor: undefined } : i), R);
  naoAumentou(antes, depois, 'emissor apagado');
  assert.ok(depois.dimensions.concentracao.factors.nEff <= antes.dimensions.concentracao.factors.nEff + 1e-12);
});

test('regressão 3: remover uma reserva sem cobertura não aumenta a nota', () => {
  const antes = nota(BASE, DEF([], 500000)), depois = nota(BASE, NAO);
  assert.equal(antes.dimensions.reserva.score, 0);
  naoAumentou(antes, depois, 'reserva removida');
  assert.equal(depois.score, null);
});

test('regressão 4: falha ao carregar a reserva não aumenta a nota nem reaproveita dado antigo', () => {
  const antes = nota(BASE, DEF(['selic'], 500000, 12)), depois = nota(BASE, { state: 'falha' });
  naoAumentou(antes, depois, 'falha ao carregar');
  assert.equal(depois.dimensions.reserva.status, 'falha');
  assert.equal(depois.dimensions.reserva.factors, null);
});

test('propriedade: em carteiras aleatórias, remover qualquer informação nunca aumenta nota, dimensões nem diversificação', () => {
  let seed = 20261013;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const KINDS = ['selic', 'pre', 'ipca', 'cdb', 'lci', 'lca', 'fundo', 'acao', 'fii'];
  const remocoes = [
    (its, r) => [its.map((i, k) => k === 0 ? { ...i, emissor: undefined } : i), r],
    (its, r) => [its.map((i, k) => k === 1 ? { ...i, liq: undefined, liqData: undefined } : i), r],
    (its, r) => [its.map((i, k) => k === 2 ? { ...i, resgate: undefined } : i), r],
    (its, r) => [its.map((i, k) => k === 3 ? { ...i, classe: null } : i), r],
    (its, r) => [its.map((i, k) => k === 4 ? { ...i, liqData: undefined } : i), r],
    (its, r) => [its, r.state === 'definida' ? { ...r, linkedPositionIds: r.linkedPositionIds.slice(1) } : r],
    (its, r) => [its, NAO],
    (its, r) => [its, { state: 'falha' }],
    (its, r) => [its.map(i => ({ ...i, emissor: undefined, liq: undefined, resgate: undefined })), r],
  ];
  let comparacoes = 0;
  for (let n = 0; n < 400; n++) {
    const its = Array.from({ length: 2 + Math.floor(rnd() * 7) }, (_, k) => {
      const kind = pick(KINDS), v = 10000 + Math.floor(rnd() * 2000000);
      if (kind === 'acao' || kind === 'fii') return A(pick(['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE']) + (kind === 'fii' ? '11' : pick(['3', '4'])) + (k > 4 ? k : ''), kind, v, { id: 'p' + k, classe: pick([kind, kind, 'etf', null]) });
      return RF('p' + k, kind, v, { emissor: pick([undefined, 'Banco A', 'Banco B', 'Gestora C']), liq: pick([undefined, 'ate1', 'ate30', 'mais30', 'data']),
        liqData: pick([undefined, '2026-01-10', '2027-05-01']), resgate: pick([undefined, 'estavel', 'mercado']) });
    }).map((i, k) => ({ ...i, id: 'p' + k }));
    const reserva = rnd() < 0.8 ? DEF(its.filter(() => rnd() < 0.6).map(i => i.id), 50000 + Math.floor(rnd() * 500000), 1 + Math.floor(rnd() * 12)) : NAO;
    const a = nota(its, reserva);
    for (const rem of remocoes) {
      const [its2, res2] = rem(its, reserva);
      const b = nota(its2, res2);
      naoAumentou(a, b, `carteira ${n}`);
      for (const k of ['concentracao', 'acesso', 'reserva']) {
        const x = a.dimensions[k].score, y = b.dimensions[k].score;
        assert.ok(y == null || (x != null && y <= x), `carteira ${n}, ${k}: ${x} → ${y}`);
      }
      assert.ok(b.dimensions.concentracao.factors.nEff <= a.dimensions.concentracao.factors.nEff + 1e-9, `carteira ${n}: diversificação aparente`);
      comparacoes++;
    }
  }
  assert.equal(comparacoes, 400 * remocoes.length);
});

test('nota completa: pesos fixos, contribuições somam a nota; faixas descritivas', () => {
  const items = [RF('selic', 'selic', 400000), ...Array.from({ length: 6 }, (_, i) => A(`AB${String.fromCharCode(65 + i)}C3`, 'acao', 100000))];
  const r = computeSleepScore({ items, reserva: DEF(['selic'], 50000, 6), today });
  assert.equal(r.status, 'completa');
  assert.deepEqual(Object.fromEntries(Object.entries(r.contribuicoes).map(([k, c]) => [k, c.peso])), SLEEP_WEIGHTS);
  const soma = Object.values(r.contribuicoes).reduce((s, c) => s + c.pontos, 0);
  assert.equal(Math.round(soma), r.score);
  assert.ok(['poucos', 'alguns', 'relevantes'].includes(r.band));
  assert.ok(MIN_COVERAGE > 0 && MIN_COVERAGE < 1);
  assert.ok(r.limitations.some(l => /Não mede volatilidade/.test(l)));
  // sem cotação: explícito nas limitações
  const sc = computeSleepScore({ items: [A('ABCD3', 'acao', 500000, { hasQuote: false }), RF('s', 'selic', 500000)], reserva: NAO, today });
  assert.equal(sc.coverage.cotacao, 0);
  assert.ok(sc.limitations.some(l => /1 posição sem cotação atual/.test(l)));
});
