// Sleep Score v2 na interface (dados fictícios, servidor de teste).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9100+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const externos=[];
const novo=async(w,h,opt={})=>{ const cx=await br.newContext({viewport:{width:w,height:h},colorScheme:opt.scheme||'light'});
  if (opt.ls) await cx.addInitScript(ls=>{ for (const [k,v] of Object.entries(ls)) localStorage.setItem(k,v); }, opt.ls);
  await cx.route(u=>!u.href.startsWith(B), r=>{ externos.push(r.request().url()); return r.abort(); });
  const p=await cx.newPage(); p._errs=[]; p.on('pageerror',e=>p._errs.push(e.message)); return {cx,p}; };
const abrir=async(p,hash='#visao-geral')=>{ await p.goto(B+'/'+hash); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(700); };
const txt=(p,sel)=>sel==='#holdDetail .sleep-data'
  ? p.evaluate(s=>{ const d=document.querySelector(s); d.open=true; return d.innerText.replace(/\s+/g,' ').trim(); }, sel)      // seção recolhida no painel: abre antes de ler (dt/dd separados por quebra de linha)
  : p.textContent(sel).then(t=>(t||'').replace(/\s+/g,' ').trim());
const reserva=(ids)=>fetch(B+'/api/finance/reserve',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({monthlyExpenseCents:150000,months:6,linkedPositionIds:ids})});
const carteira=async(positions)=>{ const v=(await ctl('')).version; return fetch(B+'/api/portfolio',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({version:v,positions})}); };
const cartao=(p)=>p.evaluate(()=>{ const c=document.getElementById('sleepCard'); return { n:c.querySelector('.n').textContent, tag:c.querySelector('.tag').textContent, ring:c.querySelector('.sleep-ring').getAttribute('aria-label'),
  dims:[...c.querySelectorAll('.sleep-dims li')].map(li=>li.querySelector('.sd-n').textContent+'='+li.querySelector('.sd-v').textContent.replace(/\s+/g,' ').trim()), txt:c.innerText.replace(/\s+/g,' ') }; });

/* ---------- cartão na Visão geral: composição preservada, avaliação parcial sem reserva ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const c=await cartao(p);
  const lay=await p.evaluate(()=>({ filhos:[...document.querySelector('.secondary-row').children].map(e=>e.className||e.id), ring:!!document.querySelector('#sleepCard .sleep-ring svg'), how:!!document.querySelector('#sleepCard details.sleep-how') }));
  log(lay.filhos.join()==='sleep-wrap,attention' && lay.ring && lay.how,'composição da Visão geral preservada: anel, texto e "Como calculamos?" ao lado dos pontos de atenção');
  log(c.n==='—' && c.tag==='Sem nota geral' && /sem nota geral/i.test(c.ring),'sem reserva: dimensões disponíveis, sem nota geral nem renormalização');
  log(c.dims.length===3 && /^Concentração por emissor=\d+$/.test(c.dims[0]) && /^Acesso ao dinheiro=\d+$/.test(c.dims[1]) && c.dims[2]==='Reserva de emergência=— não definida','dimensões visíveis; reserva não definida fica sem nota '+JSON.stringify(c.dims));
  log(!/seguro|garant(e|ia) (de )?seguran|recomendamos|compre/i.test(c.txt.replace('não garante segurança','')) && /Não é previsão nem recomendação/.test(c.txt),'sem promessas nem recomendações');
  // teclado: "Como calculamos?" → metodologia → Escape devolve o foco
  await p.focus('#sleepCard summary'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  await p.focus('#sleepMethodBtn'); await p.keyboard.press('Enter'); await p.waitForSelector('.sheet[role=dialog]'); await p.waitForTimeout(300);
  const m=await p.evaluate(()=>{ const s=document.querySelector('.sheet'); return { t:s.innerText.replace(/\s+/g,' '), linhas:[...s.querySelectorAll('.sleep-table tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ')),
    links:[...s.querySelectorAll('a[href]')].map(a=>({h:a.href, t:a.target, r:a.rel})), nome:document.getElementById(s.getAttribute('aria-labelledby'))?.textContent }; });
  log(m.nome==='Sleep Score: metodologia' && /Versão 2\.1/.test(m.t) && /não prevê perdas, não garante segurança e não recomenda compras/.test(m.t),'metodologia com versão e aviso de que é indicador explicativo');
  log(m.linhas.length===3 && /Reserva de emergência — \(não definida\) 20% —/.test(m.linhas[2]),'tabela de dimensões com peso usado e contribuição; reserva fora da nota '+JSON.stringify(m.linhas));
  log(m.linhas.every(l=>!/pts/.test(l)) && /50%/.test(m.linhas[0]) && /30%/.test(m.linhas[1]),'sem nota geral: pesos fixos e nenhuma contribuição agregada');
  log(/Cobertura e limitações/.test(m.t) && /Não mede volatilidade, correlação, risco de crédito/.test(m.t) && /Reserva de emergência não definida/.test(m.t),'cobertura e limitações mostradas à parte');
  log(m.links.length>=8 && m.links.every(l=>l.h.startsWith('https://') && l.t==='_blank' && /noopener/.test(l.r)),'fontes primárias com links seguros');
  log(/escolhas deste modelo/.test(m.t) && /não foi validado estatisticamente/.test(m.t),'pesos declarados como escolhas do modelo, sem alegar validação');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.activeElement.id)==='sleepMethodBtn','Escape fecha e devolve o foco ao botão');
  log(p._errs.length===0,'sem erros JS (cartão) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- reserva definida: avaliação completa ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1'); await reserva(['r1']);
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const c=await cartao(p);
  log(!/parcial/.test(c.tag) && /^Reserva de emergência=\d+$/.test(c.dims[2]),'com reserva definida e dados suficientes: avaliação completa '+JSON.stringify(c));
  await cx.close(); }

/* ---------- liquidez desconhecida: nota indisponível; informar dados pelo detalhe da aplicação ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
await carteira([
  {id:'c1',kind:'cdb',nome:'CDB Fictício A',ap:8000,dt:'2025-01-10',taxa:110},
  {id:'c2',kind:'lci',nome:'LCI Fictícia B',ap:2000,dt:'2025-05-10',taxa:90},
  {id:'a1',kind:'fii',classe:'fii',ticker:'TEST11',name:'Fundo Teste',segment:'tijolo_log',q:10,c:100,a:102,noQuote:false,d:0.8,quotedAt:new Date().toISOString()},
]);
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const c=await cartao(p);
  log(c.n==='—' && /Sem nota geral/.test(c.tag) && /Falta o prazo de acesso/.test(c.txt) && /Acesso ao dinheiro=— dados insuficientes/.test(c.dims.join('|')),'prazo de acesso desconhecido na maior parte: nota indisponível, sem tratar como líquido nem ilíquido '+JSON.stringify(c));
  await abrir(p,'#carteira');
  await p.click('#assetList [data-pid=c1]'); await p.waitForTimeout(250);
  const antes=await txt(p,'#holdDetail .sleep-data');
  log(/Emissor não informado/.test(antes) && /Prazo para ter o dinheiro desconhecido/.test(antes) && /Informar dados/.test(antes),'detalhe da aplicação mostra o que falta para o Sleep Score');
  await p.click('#holdDetail .sleep-data-btn'); await p.waitForSelector('.sheet[role=dialog]');
  const S=(l)=>p.locator('.sheet').getByLabel(l,{exact:true});
  await S('Emissor (banco ou gestora)').fill('Banco Fictício'); await S('Prazo para ter o dinheiro').selectOption('data');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(150);
  log(/Informe a data de carência ou vencimento/.test(await txt(p,'.sheet')) && (await ctl('')).saves===1,'"a partir de uma data" exige a data; nada é salvo antes');
  await S('Prazo para ter o dinheiro').selectOption('ate1'); await S('Valor ao resgatar antes do vencimento').selectOption('estavel'); await S('Vencimento do título (opcional)').fill('2028-01-10');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(700);
  const pos=(await ctl('data=1')).data.find(x=>x.id==='c1');
  log(pos.emissor==='Banco Fictício' && pos.liq==='ate1' && pos.resgate==='estavel' && pos.venc==='2028-01-10' && !('liqData' in pos),'dados gravados na própria posição (sem migração) '+JSON.stringify(pos));
  const depois=await txt(p,'#holdDetail .sleep-data');
  log(/Banco Fictício informado por você/.test(depois) && /Até 1 dia útil informado por você/.test(depois) && /10\/01\/2028/.test(depois),'detalhe atualizado, identificado como informado por você');
  await abrir(p);
  const c2=await cartao(p);
  log(c2.n==='—' && /^Acesso ao dinheiro=\d+ parcial$/.test(c2.dims[1]),'com cobertura ≥ 60%, acesso tem limite inferior; sem reserva, a nota geral segue indisponível '+JSON.stringify(c2.dims));
  log(p._errs.length===0,'sem erros JS (dados da aplicação) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- Tesouro e bolsa: dados por regra, não editáveis ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p,'#carteira');
  await p.click('#assetList [data-pid=r1]'); await p.waitForTimeout(250);
  const t=await txt(p,'#holdDetail .sleep-data');
  log(/Tesouro Nacional/.test(t) && /Até 1 dia útil recompra diária a preço de mercado/.test(t) && !await p.locator('#holdDetail .sleep-data-btn').count(),'Tesouro: emissor e prazo pela regra do produto, sem edição');
  await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(250);
  const a=await txt(p,'#holdDetail .sleep-data');
  log(/TEST pelas 4 primeiras letras do código/.test(a) && /liquidação em 2 dias úteis/.test(a),'FII: emissor pela raiz do código e liquidação D+2');
  await cx.close(); }

/* ---------- regressões: reserva, falha de dados e ETF legado ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1'); await reserva(['a1']);
{ const {cx,p}=await novo(1440,900); await abrir(p, '#metas');
  const r=await txt(p,'#resOut');
  log(/Valor vinculado\s*R\$ 10\.200,00/.test(r) && /Considerado no Sleep Score\s*R\$ 0,00/.test(r)
    && await p.locator('#resOut [role=progressbar]').getAttribute('aria-valuenow')==='0' && !/Objetivo atingido/.test(r),
    'FII vinculado acima do objetivo: valor preservado, cobertura e progresso zero, sem objetivo atingido');
  await abrir(p); const before=await cartao(p);
  log(/^\d+$/.test(before.n) && before.dims[2]==='Reserva de emergência=0', 'reserva sem cobertura entra na nota com zero');
  await ctl('failFinLoad=1'); await p.reload(); await p.waitForTimeout(700);
  const failed=await cartao(p);
  log(failed.n==='—' && /não carregada/.test(failed.dims[2]) && /Não foi possível carregar sua reserva/.test(failed.txt),
    'falha ao carregar: sem nota geral, distingue erro de reserva não definida');
  await ctl('failFinLoad=0'); await p.click('#sleepRetryBtn'); await p.waitForTimeout(500);
  log((await cartao(p)).n===before.n, 'retry restaura a mesma nota, sem aumento por ausência de dados');
  await fetch(B+'/api/finance/reserve',{method:'DELETE'}); await p.reload(); await p.waitForTimeout(700);
  log((await cartao(p)).n==='—', 'remover reserva elimina a nota geral em vez de elevar a nota');
  log(p._errs.length===0,'regressões da reserva sem erros JS'); await cx.close(); }

await ctl('seed=1&logged=1&empty=0&reset=1');
await carteira([{id:'e1',kind:'fii',classe:'etf',ticker:'ETFQ11',name:'ETF fictício legado',q:10,c:100,a:102,noQuote:false,d:0},
  {id:'r1',kind:'selic',nome:'Tesouro Selic',ap:3000,dt:'2026-01-02'}]); await reserva(['r1']);
{ const {cx,p}=await novo(1440,900); await abrir(p,'#carteira');
  log(await p.locator('#assetList [data-pid=e1]').count()===1 && await p.locator('#hClasses [data-class=fundo]').count()===1,
    'ETF legado em FII: catálogo prevalece, filtro Fundos disponível');
  await p.click('#assetList [data-pid=e1]'); await p.waitForTimeout(150);
  const d=await txt(p,'#holdDetail .sleep-data');
  log(/Classe no catálogo de ativos ETF/.test(d) && /Prazo para ter o dinheiro desconhecido/.test(d),
    'ETF genérico não herda D+2: categoria de liquidação ausente é explícita');
  log(!/Comparação em 12 meses/.test(await txt(p,'#holdDetail')) && !await p.locator('#holdDetail .div-estimate').count(),
    'ETF sem renda informada não herda estimativa mensal nem comparação de FII');
  log(p._errs.length===0,'ETF sem erros JS'); await cx.close(); }

/* ---------- valores ocultos e celular ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1'); await reserva(['r1']);
{ const {cx,p}=await novo(1440,900,{ls:{'rendum.ocultarValores':'1'}}); await abrir(p);
  await p.evaluate(()=>{ document.querySelector('#sleepCard details').open=true; }); await p.click('#sleepMethodBtn'); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  log(!/R\$\s?\d/.test(await p.evaluate(()=>document.getElementById('sleepCard').innerText+document.querySelector('.sheet').innerText)),'valores ocultos: cartão e metodologia sem valores em reais');
  await cx.close(); }
for (const w of [320,390]) for (const scheme of ['light','dark']){
  const {cx,p}=await novo(w,800,{scheme}); await abrir(p);
  await p.evaluate(()=>document.getElementById('sleepCard').scrollIntoView());
  await p.evaluate(()=>{ document.querySelector('#sleepCard details').open=true; });
  const c=await p.evaluate(()=>({ fora:[...document.querySelectorAll('#sleepCard *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5; }).length, sw:document.documentElement.scrollWidth, iw:innerWidth,
    alvo:document.getElementById('sleepMethodBtn').getBoundingClientRect().height }));
  await p.click('#sleepMethodBtn'); await p.waitForSelector('.sheet'); await p.waitForTimeout(300);
  const s=await p.evaluate(()=>[...document.querySelectorAll('.sheet *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length);
  log(c.fora===0 && c.sw<=c.iw && c.alvo>=44 && s===0,`${w}px ${scheme}: cartão e metodologia sem rolagem horizontal; botão ≥ 44 px ${JSON.stringify({...c,sheet:s})}`);
  if (p._errs.length) log(false,'erros JS '+JSON.stringify(p._errs));
  await cx.close();
}
log(externos.length===0,'nenhum pedido a servidores externos '+JSON.stringify(externos.slice(0,3)));
await br.close(); srv.kill();
process.exit(fails?1:0);
