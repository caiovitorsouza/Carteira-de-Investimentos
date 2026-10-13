// Calendário interativo de proventos e estatísticas de Recebidos (dados fictícios, servidor de teste).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9400+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
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
const abrir=async(p)=>{ await p.goto(B+'/#proventos'); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(600); };
const txt=(p,sel)=>p.textContent(sel).then(t=>(t||'').replace(/\s+/g,' ').trim());
const T=new Date(), Y=T.getFullYear(), M=T.getMonth()+1, D=T.getDate();
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const brl=(c)=>'R$ '+(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const norm=(s)=>s.replace(/\s+/g,' ');
const SEED='seed=1&logged=1&empty=0&reset=1&recs=1';

/* ---------- calendário: categorias separadas, grade, painel do dia ---------- */
await ctl(SEED);
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const s=await p.evaluate(()=>({ cells:[...document.querySelectorAll('#calSummary .cal-sum-cell')].map(c=>c.className.match(/cs-(\w+)/)[1]+'='+c.querySelector('strong').textContent.replace(/\s+/g,' ')),
    nota:document.querySelector('.cal-explanation').textContent, leg:[...document.querySelectorAll('#calLegend li')].map(l=>l.textContent) }));
  // recebidos do mês atual (rc1 + rc2) = 78,00 + 45,50; anunciados TEST11 100×0,80 + DEMO11 50×0,10; estimativas SEMD11/INVL11/PASS11
  log(s.cells.join('|')==='rec=R$ 123,50|anu=R$ 85,00|est=R$ 14,70','resumo do mês: um bloco por categoria, cada uma com seu total '+s.cells.join('|'));
  log(/não viram recebimento e nada é somado duas vezes/.test(s.nota) && !(await txt(p,'#incEst')).includes('223,20'),'nenhum total geral somando categorias (123,50 + 85,00 + 14,70 não aparece)');
  log(s.leg.length===2 && /Recebido/.test(s.leg[0]) && /Anunciado/.test(s.leg[1]),'legenda só com as marcas presentes na grade');
  const g=await p.evaluate((D)=>({ has:[...document.querySelectorAll('#calendar .cal-d.has')].map(b=>b.dataset.day+':'+[...b.querySelectorAll('.mk')].map(m=>m.className.replace('mk mk-','')).join('+')+(b.querySelector('.cnt')?'#'+b.querySelector('.cnt').textContent:'')),
    hoje:document.getElementById('cald-'+D).classList.contains('today') && /, hoje/.test(document.getElementById('cald-'+D).getAttribute('aria-label')),
    l15:document.getElementById('cald-15').getAttribute('aria-label'), tab0:document.querySelectorAll('#calendar .cal-d[tabindex="0"]').length, botoes:document.querySelectorAll('#calendar button.cal-d').length,
    dim:new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() }), D);
  const esperado=[...new Set(['1:rec', D+':rec', '15:anu#2'].map(x=>x))];
  log(g.has.includes('1:rec') && g.has.some(x=>x.startsWith('15:') && x.includes('anu')) && g.has.some(x=>x.startsWith(D+':') && x.includes('rec')),'grade marca recebidos (círculo) e anunciados (anel) nos dias certos '+g.has.join(' '));
  log(g.has.length<=3 && !g.has.some(x=>x.includes('est')),'estimativas sem data não aparecem na grade (nenhuma data inventada)');
  log(g.hoje && /2 pagamentos anunciados/.test(g.l15) && g.botoes===g.dim && g.tab0===1,'dia de hoje identificado; rótulo acessível com quantidade por categoria; um único dia na ordem do Tab');
  const mes=await txt(p,'#calDay');
  log(new RegExp(`Dias com proventos em ${MESES[M-1]}`).test(mes) && /TEST11/.test(mes) && /KNRI11/.test(mes) && /DEMO11/.test(mes),'sem dia selecionado, o painel lista os dias do mês');
  log(/Você já registrou recebimento deste ativo neste mês/.test(mes),'ativo com recebimento e anúncio no mesmo mês é sinalizado, não somado');
  // seleção de dia
  await p.click('#cald-15'); await p.waitForTimeout(120);
  const dia=await p.evaluate(()=>({ pressed:document.getElementById('cald-15').getAttribute('aria-pressed'), titulo:document.getElementById('calDayTitle').textContent, rows:[...document.querySelectorAll('#calDay .cal-ev')].map(r=>r.querySelector('.cal-ev-tk').textContent+'|'+r.querySelector('.cal-ev-val .num').textContent.replace(/\s+/g,' ')+'|'+r.querySelectorAll('.amark').length),
    sub:document.querySelector('#calDay .cal-subtot')?.textContent.replace(/\s+/g,' '), foco:document.activeElement.id }));
  log(dia.pressed==='true' && new RegExp(`^15 de ${MESES[M-1]}`).test(dia.titulo) && dia.rows.join()==='DEMO11|R$ 5,00|1,TEST11|R$ 80,00|1' && /Anunciado\s*R\$ 85,00/.test(dia.sub) && dia.foco==='cald-15',
    'dia selecionado mostra ativos, logos, valores e total do dia '+JSON.stringify(dia));
  log(await p.evaluate(()=>document.querySelector('#calDay .cal-ev .amark img')?.complete===true),'logo do ativo aparece no evento (logo fictício do próprio ticker)');
  await p.click('#calDay .cal-day-head .textlink'); await p.waitForTimeout(100);
  log(await p.evaluate(()=>document.getElementById('cald-15').getAttribute('aria-pressed')==='false' && /Dias com proventos/.test(document.getElementById('calDayTitle').textContent)),'"Ver o mês inteiro" desfaz a seleção');
  // teclado
  await p.focus('#cald-15'); await p.keyboard.press('ArrowRight');
  let k=await p.evaluate(()=>({f:document.activeElement.id, t0:[...document.querySelectorAll('#calendar .cal-d[tabindex="0"]')].map(b=>b.id)}));
  log(k.f==='cald-16' && k.t0.join()==='cald-16','seta para a direita vai ao dia seguinte (foco itinerante)');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp');
  log(await p.evaluate(()=>document.activeElement.id)==='cald-15','setas para baixo/esquerda/cima movem por semana e por dia');
  await p.keyboard.press('Home');
  const home=await p.evaluate(()=>{ const d=Number(document.activeElement.dataset.day); const t=new Date(); return (new Date(t.getFullYear(),t.getMonth(),d).getDay()+6)%7; });
  log(home===0,'Home vai para a segunda-feira da semana');
  await p.focus('#cald-15'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  log(await p.evaluate(()=>document.getElementById('cald-15').getAttribute('aria-pressed')==='true' && document.activeElement.id==='cald-15'),'Enter seleciona o dia e mantém o foco');
  await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
  const pd=await p.evaluate(()=>({t:document.getElementById('monthTitle').textContent, f:document.activeElement.id}));
  log(new RegExp(MESES[M%12],'i').test(pd.t) && pd.f==='cald-15','Page Down muda para o mês seguinte mantendo o dia em foco '+JSON.stringify(pd));
  log(await p.evaluate(()=>/FUTR3/.test(document.getElementById('calDay').innerText) && document.getElementById('undatedBox').innerText===''),'mês seguinte: só o anúncio com data (FUTR3), sem estimativas sem data');
  await p.click('#calDay .cal-ev'); await p.waitForSelector('.sheet[role=dialog]');
  const fut=await txt(p,'.sheet');
  log(/Anunciado \(ainda não pago\)/.test(fut) && /não divulgado/.test(fut) && !/Registrar recebimento/.test(fut),'anúncio futuro: sem valor inventado e sem atalho para registrar');
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  await p.focus('#cald-15'); await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
  log(new RegExp(MESES[M-1],'i').test(await txt(p,'#monthTitle')),'Page Up volta ao mês anterior');
  // recebimento registrado: abre a edição; Escape devolve o foco à linha
  await p.click('#ev-rec-rc1'); await p.waitForSelector('.sheet[role=dialog]');
  log(/Editar recebimento/.test(await txt(p,'.sheet')),'recebimento no calendário abre a edição do registro');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.activeElement.id)==='ev-rec-rc1','foco volta ao recebimento');
  // próximas datas: leva ao mês e ao dia anunciado
  await p.click('#undatedBox [aria-labelledby=hProx] .cal-ev'); await p.waitForTimeout(150);
  const prox=await p.evaluate(()=>({t:document.getElementById('monthTitle').textContent, f:document.activeElement.id, sel:document.querySelector('#calendar [aria-pressed="true"]')?.id}));
  log(new RegExp(MESES[M%12],'i').test(prox.t) && prox.f==='cald-3' && prox.sel==='cald-3','"Próximas datas anunciadas" abre o mês e o dia do anúncio '+JSON.stringify(prox));
  log(p._errs.length===0,'sem erros JS (calendário) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- anúncio com data passada: registrar recebimento pré-preenchido (sem valor inventado) ---------- */
await ctl(SEED);
{ const {cx,p}=await novo(1440,900); await abrir(p);
  // PASS11 tem pagamento divulgado em 10/01/2026 (data passada)
  const voltar=(Y-2026)*12+(M-1);
  for (let i=0;i<voltar;i++) await p.click('#prevMonth');
  await p.waitForTimeout(150);
  log(/Janeiro de 2026/.test(await txt(p,'#monthTitle')),'navega até janeiro de 2026');
  await p.click('#cald-10'); await p.waitForTimeout(100);
  await p.click('#calDay .cal-ev'); await p.waitForSelector('.sheet[role=dialog]');
  const sh=await txt(p,'.sheet');
  log(/data já passou \(não confirma que você recebeu\)/.test(sh) && /10\/01\/2026/.test(sh) && /data-com/.test(sh),'anúncio passado: deixa claro que não confirma recebimento');
  await p.click('.sheet .btn-full'); await p.waitForTimeout(400);
  const S=(l)=>p.locator('.sheet').getByLabel(l,{exact:true});
  const pre={a:await S('Ativo').inputValue(), d:await S('Data do recebimento').inputValue(), v:await S('Valor total recebido (R$)').inputValue()};
  log(pre.a==='PASS11' && pre.d==='2026-01-10' && pre.v==='','registro pré-preenchido com ativo e data; o valor fica para você informar '+JSON.stringify(pre));
  await S('Valor total recebido (R$)').fill('1000'); await p.click('.sheet button[type=submit]'); await p.waitForTimeout(600);
  const fin=(await ctl('fin=1')).fin.receipts.find(r=>r.asset==='PASS11');
  log(fin && fin.receivedOn==='2026-01-10' && fin.amountCents===1000,'recebimento gravado com a data do anúncio');
  const dez=await p.evaluate(()=>({ l:document.getElementById('cald-10').getAttribute('aria-label'), sum:[...document.querySelectorAll('#calSummary .cal-sum-cell')].map(c=>c.className.match(/cs-(\w+)/)[1]+'='+c.querySelector('strong').textContent.replace(/\s+/g,' ')).join('|') }));
  log(/1 recebimento registrado e 1 pagamento anunciado/.test(dez.l) && dez.sum==='rec=R$ 10,00|anu=R$ 10,00','calendário atualiza: recebido e anunciado lado a lado, cada um com seu total '+JSON.stringify(dez));
  log(p._errs.length===0,'sem erros JS (registrar a partir do anúncio) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- falha ao carregar recebimentos; valores ocultos ---------- */
await ctl(SEED+'&failFinLoad=1');
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const f=await p.evaluate(()=>({sum:document.getElementById('calSummary').innerText, has:[...document.querySelectorAll('#calendar .cal-d.has')].map(b=>b.dataset.day)}));
  log(/Recebimentos registrados indisponíveis/.test(f.sum) && !/Recebido no mês/.test(f.sum) && f.has.join()==='15','falha ao carregar: aviso no calendário, sem fingir que não houve recebimentos; anúncios continuam');
  await ctl('failFinLoad=0'); await p.click('#calSummary button'); await p.waitForTimeout(500);
  log(/Recebido no mês/.test(await txt(p,'#calSummary')),'tentar de novo carrega os recebimentos');
  await cx.close(); }
await ctl(SEED);
{ const {cx,p}=await novo(1440,900,{ls:{'rendum.ocultarValores':'1'}}); await abrir(p);
  await p.click('#cald-15'); await p.waitForTimeout(100);
  const o=await p.evaluate(()=>({t:document.getElementById('incEst').innerText, labs:[...document.querySelectorAll('#incEst [aria-label]')].map(e=>e.getAttribute('aria-label')).join(' ')}));
  log(!/R\$\s?\d/.test(o.t) && !/R\$\s?\d|\d,\d\d/.test(o.labs),'valores ocultos: calendário sem valores no texto nem nos rótulos acessíveis');
  await p.click('#incTabRec'); await p.waitForTimeout(250);
  await p.selectOption('#recMonth', String(M===1?1:M-1)); await p.waitForTimeout(100);
  const r=await p.evaluate(()=>({t:document.getElementById('incRec').innerText, bars:document.querySelectorAll('.rec-bar').length}));
  log(!/R\$\s?\d/.test(r.t) && r.bars===0 && new RegExp(`Recebido em ${MESES[(M===1?1:M-1)-1]}`).test(r.t),'valores ocultos em Recebidos: sem gráfico, mês escolhido pelo campo Mês');
  await cx.close(); }

/* ---------- estatísticas de Recebidos ---------- */
await ctl(SEED);
{ const {cx,p}=await novo(1440,900); await abrir(p);
  await p.click('#incTabRec'); await p.waitForTimeout(300);
  const pm=M===1?12:M-1, py=M===1?Y-1:Y, dim=new Date(py,pm,0).getDate();
  // mês anterior até o dia D (período comparável): rc3 (dia 1) + rc4 (dia min(D,dim)) + rc5 (último dia, se ≤ D)
  const ant=7600+500+(dim<=D?510:0)+(M===1?7000*(15<=D?1:0):0), atual=7800+4550;
  const pctTxt=(v)=>(v>0?'+':v<0?'−':'')+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  const st=await p.evaluate(()=>[...document.querySelectorAll('.rec-stat')].map(s=>s.innerText.replace(/\s+/g,' ')));
  log(new RegExp(`^Recebido em ${MESES[M-1]} \\(1 a ${D}, mês em andamento\\) R\\$ 123,50 2 registros no mês`).test(st[0]),'mês em andamento identificado, com total e quantidade do mês: '+st[0]);
  log(norm(st[1]).includes(pctTxt((atual-ant)/ant*100)) && new RegExp(`1 a ${Math.min(D,dim)} de ${MESES[pm-1]}, mesmo período: ${brl(ant).replace('$','\\$')}`).test(norm(st[1])),'comparação com o mesmo período do mês anterior (não com o mês completo): '+st[1]);
  log(/^Total recebido em \d{4} R\$/.test(st[2]) && /ano em andamento/.test(st[2]) && /^Registros no ano \d+/.test(st[3]),'total e registros do ano selecionado');
  const bars=await p.evaluate(()=>[...document.querySelectorAll('.rec-bar')].map(b=>({d:b.disabled, p:b.getAttribute('aria-pressed'), l:b.getAttribute('aria-label')})));
  log(bars.length===12 && bars[M-1].p==='true' && bars.slice(M).every(b=>b.d && /ainda não chegou/.test(b.l)) && bars.slice(0,M).filter(b=>/sem registros/.test(b.l)).length>=1,'gráfico: 12 meses, mês atual escolhido, futuros desativados, meses vazios "sem registros"');
  if (M>1){
    await p.click(`.rec-bar >> nth=${M-2}`); await p.waitForTimeout(150);
    const st2=await p.evaluate(()=>[...document.querySelectorAll('.rec-stat')].map(s=>s.innerText.replace(/\s+/g,' ')));
    log(new RegExp(`^Recebido em ${MESES[M-2]} R\\$ 86,10 3 registros no mês`).test(st2[0]) && /—/.test(st2[1]) && /Sem registros em .*mês completo; não há base para comparar/.test(st2[1]),'mês completo sem registros no anterior: sem percentual, explica por quê '+st2[1]);
    log(await p.evaluate((i)=>document.activeElement===document.querySelectorAll('.rec-bar')[i] && document.querySelectorAll('.rec-month.is-selected').length===1, M-2),'escolher a barra mantém o foco nela e destaca os registros do mês');
    await p.selectOption('#recMonth', String(M)); await p.waitForTimeout(100);
  }
  const div=await p.evaluate(()=>[...document.querySelectorAll('.rec-asset-list li')].map(li=>li.querySelector('.ra-tk').textContent+'|'+li.querySelector('.ra-pct').textContent+'|'+(li.querySelector('.amark img')?'logo':li.querySelector('.amark').className.includes('neutro')?'neutro':'mono')));
  log(div.join()==='TEST11|63,16%|logo,KNRI11|36,84%|neutro','divisão por ativo no mês, com logo do ativo da carteira e monograma neutro para ativo fora dela '+div.join());
  await p.click('.rec-assets .seg button:last-child'); await p.waitForTimeout(100);
  const ano=await p.evaluate(()=>[...document.querySelectorAll('.rec-asset-list li .ra-pct')].map(e=>parseFloat(e.textContent.replace(',','.'))));
  log(ano.length>=2 && Math.abs(ano.reduce((s,x)=>s+x,0)-100)<0.05 && await p.evaluate(()=>document.activeElement.textContent===String(new Date().getFullYear())),'divisão no ano soma 100% e o foco fica no botão escolhido');
  await p.selectOption('#recAsset','TEST11'); await p.waitForTimeout(100);
  log(await p.locator('.rec-assets').count()===0 && /Total recebido em \d{4} · TEST11/.test(await txt(p,'#recBody')),'com filtro de um ativo, a divisão por ativo some e os totais seguem o filtro');
  await p.selectOption('#recAsset',''); await p.selectOption('#recYear',String(Y-1)); await p.waitForTimeout(100);
  const ant2=await p.evaluate(()=>({m:document.getElementById('recMonth').value, s:document.querySelector('.rec-stat').innerText.replace(/\s+/g,' '), t:document.querySelectorAll('.rec-stat')[2].innerText.replace(/\s+/g,' ')}));
  log(ant2.m==='12' && /^Recebido em dezembro R\$ 70,00/.test(ant2.s) && /Ano completo/.test(ant2.t),'ano anterior: abre no último mês com registro e indica ano completo '+JSON.stringify(ant2));
  log(p._errs.length===0,'sem erros JS (estatísticas) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- celular e larguras: sem rolagem horizontal; painel abaixo da grade ---------- */
for (const w of [320,390,768]) for (const scheme of ['light','dark']){
  await ctl(SEED);
  const {cx,p}=await novo(w,800,{scheme}); await abrir(p);
  const c=await p.evaluate(()=>{ const pg=document.getElementById('pg-income'); const g=document.getElementById('calendar').getBoundingClientRect(), d=document.getElementById('calDay').getBoundingClientRect();
    return { sw:document.documentElement.scrollWidth, iw:innerWidth, fora:[...pg.querySelectorAll('*')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length,
      larguras:Math.min(...[...document.querySelectorAll('#calendar .cal-d')].map(b=>b.getBoundingClientRect().width)), datas:Math.min(...[...document.querySelectorAll('.cal-day-date')].map(b=>b.getBoundingClientRect().height)), alvos:Math.min(...[...document.querySelectorAll('#calendar .cal-d')].map(b=>b.getBoundingClientRect().height)), abaixo:d.top>=g.bottom,
      cortes:[...pg.querySelectorAll('.cal-ev-val .num, .cal-sum-cell strong')].filter(e=>e.offsetParent && e.scrollWidth>e.clientWidth+1).length }; });
  if(w===320){
    await p.click('#cald-15'); await p.keyboard.press('ArrowDown');
    const down=await p.evaluate(()=>document.activeElement.id);
    await p.keyboard.press('ArrowUp');
    log(down==='cald-17' && await p.evaluate(()=>document.activeElement.id)==='cald-15', `${scheme} 320px: setas acompanham as duas colunas da agenda`);
  }
  await p.click('#incTabRec'); await p.waitForTimeout(250);
  const r=await p.evaluate(()=>({ sw:document.documentElement.scrollWidth, fora:[...document.querySelectorAll('#incRec *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length }));
  log(c.sw<=c.iw && c.fora===0 && c.alvos>=44 && c.larguras>=44 && c.datas>=44 && c.abaixo && c.cortes===0 && r.sw<=c.iw && r.fora===0,`${w}px ${scheme}: calendário e Recebidos sem rolagem horizontal, dias ≥ 44 px de altura, lista abaixo da grade ${JSON.stringify({...c,rec:r})}`);
  if (p._errs.length) log(false,'erros JS '+JSON.stringify(p._errs));
  await cx.close();
}

/* ---------- Visão geral: só o bloco de proventos estimados mudou (virou "Seu próximo passo") ---------- */
await ctl(SEED);
{ const {cx,p}=await novo(1440,900); await p.goto(B); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(500);
  const v=await p.evaluate(()=>({h:document.getElementById('hNext')?.textContent, agenda:!!document.getElementById('dcalBox'), pos:!!document.getElementById('overviewPositions'), sleep:!!document.getElementById('sleepCard'), nav:!!document.querySelector('.mainnav a[data-page=income]')}));
  log(v.h==='Seu próximo passo' && !v.agenda && v.pos && v.sleep && v.nav,'Visão geral: "Seu próximo passo" no lugar dos proventos estimados; resto preservado e Proventos acessível pela navegação');
  await cx.close(); }
log(externos.length===0,'nenhum pedido a servidores externos '+JSON.stringify(externos.slice(0,3)));
await br.close(); srv.kill();
process.exit(fails?1:0);
