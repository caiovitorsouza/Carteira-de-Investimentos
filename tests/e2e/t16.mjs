// Meus planos (antiga Lista de interesse) e simulação de aportes (dados fictícios, servidor de teste; nada é comprado).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9300+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
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
const abrir=async(p)=>{ await p.goto(B+'/#interesse'); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(700); };
const txt=(p,sel)=>p.textContent(sel).then(t=>(t||'').replace(/\s+/g,' ').trim());
const S=(p,l)=>p.locator('.sheet').getByLabel(l,{exact:true});
const ID={wish:'00000000-0000-4000-8000-0000000000a1', test:'00000000-0000-4000-8000-0000000000a2', manu:'00000000-0000-4000-8000-0000000000a3', ipca:'00000000-0000-4000-8000-0000000000a4'};
const stage=async(p,which)=>{ await p.click(which==='comprar'?'#watchTabBuy':'#watchTabFollow'); };
const card=async(p,id)=>{ if(!await p.locator('#wlt-'+id).count()) await stage(p,id===ID.wish||id===ID.test?'comprar':'acompanhar'); return p.evaluate(i=>document.getElementById('wlt-'+i).closest('.wl-card').innerText.replace(/\s+/g,' '),id); };
const menu=async(p,id)=>{ await p.click('#wlo-'+id); };

/* ---------- menu, vazio e cadastro com validação ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1100,900); await abrir(p);
  const nav=await p.evaluate(()=>[...document.querySelectorAll('.mainnav .navitem')].map(a=>a.dataset.page));
  log(nav.join()==='overview,holdings,income,watch,goals,simulators' && await txt(p,'#pageTitle')==='Meus planos','menu: Meus planos entre Proventos e Metas, com endereço próprio');
  log(/não recomenda ativos/.test(await txt(p,'#pg-watch')) && !await p.isVisible('#watchAddBtn') && await p.locator('#watchBody .fin-empty button').count()===1,'vazia: uma única ação; aviso de que não é recomendação');
  log(!await p.isVisible('#refreshBtn') && !await p.isVisible('#addBtn'),'sem ações da carteira no cabeçalho');
  await p.click('#watchBody .fin-empty button'); await p.waitForSelector('.sheet');
  await S(p,'Ativo').fill('wish11'); await S(p,'Classe').selectOption('fii'); await S(p,'Etapa').selectOption('comprar'); await S(p,'Sua prioridade').selectOption('1');
  await S(p,'Motivo (opcional)').fill('Diversificar em logística');
  await S(p,'Preço de interesse (R$, opcional)').fill('950');
  await S(p,'Aporte planejado em reais (opcional)').fill('100000');
  await S(p,'Ou quantidade planejada (opcional)').fill('10');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(150);
  log(/Preencha só um/.test(await txt(p,'.sheet')) && await p.evaluate(()=>document.activeElement.getAttribute('aria-invalid'))==='true' && (await ctl('')).watchLog===0,'valor E quantidade juntos: erro no campo, nada enviado');
  await S(p,'Ou quantidade planejada (opcional)').fill('');
  await S(p,'Cotação informada por você (R$, opcional)').fill('1000');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(150);
  log(/Informe a data da cotação/.test(await txt(p,'.sheet')) && (await ctl('')).watchLog===0,'cotação manual sem data é recusada (precisa ser datada)');
  await S(p,'Cotação informada por você (R$, opcional)').fill('');
  // falha preserva o formulário; reenvio usa o mesmo id
  await ctl('failWatchWrite=1');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(400);
  log(await p.locator('.sheet').count()===1 && /servidor não conseguiu/.test(await txt(p,'.sheet .fin-form-err')) && await S(p,'Ativo').inputValue()==='wish11','falha ao salvar: painel aberto, erro visível, dados preservados');
  await ctl('failWatchWrite=0&watchDelay=400');
  await p.evaluate(()=>{ const b=document.querySelector('.sheet button[type=submit]'); b.click(); b.click(); document.querySelector('.sheet form').requestSubmit(); });
  await p.waitForTimeout(1000); await ctl('watchDelay=0');
  const c=await ctl('watch=1'); const posts=c.watchLog.filter(l=>l.m==='POST');
  log(c.watch.length===1 && new Set(posts.map(x=>x.body.id)).size===1 && posts.filter(x=>!x.fail).length===1,'cliques e Enter repetidos geram um único envio; reenvio após falha usa o mesmo id');
  const b=posts[posts.length-1].body;
  log(b.asset==='WISH11' && b.kind==='fii' && b.stage==='comprar' && b.priority===1 && b.targetPriceCents===950 && b.plannedAmountCents===100000 && b.plannedQuantity===null && b.manualPriceCents===null,'enviado em centavos inteiros, ticker normalizado, só o aporte por valor '+JSON.stringify(b));
  log(await p.locator('.sheet').count()===0 && /WISH11 adicionado aos seus planos/.test(await txt(p,'#toast')) && /Planejo comprar/.test(await txt(p,'#watchBody')),'sucesso anunciado depois da confirmação; item na etapa escolhida');
  log((await ctl('')).saves===0,'a lista não altera a carteira');
  // quantidade fracionária em FII
  await p.click('#watchAddBtn'); await p.waitForSelector('.sheet');
  await S(p,'Ativo').fill('FRAC11'); await S(p,'Classe').selectOption('fii'); await S(p,'Ou quantidade planejada (opcional)').fill('1,5');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(150);
  log(/unidades inteiras/.test(await txt(p,'.sheet')),'FII/ação: quantidade planejada precisa ser inteira');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.activeElement.id)==='watchAddBtn','Escape fecha e devolve o foco ao botão');
  log(p._errs.length===0,'sem erros JS (cadastro) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- cotações, total planejado, mover, editar, excluir ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1&wl=1');
{ const {cx,p}=await novo(1100,900); await abrir(p);
  const w=await card(p,ID.wish), t=await card(p,ID.test), m=await card(p,ID.manu), r=await card(p,ID.ipca);
  log(/Cotação R\$ 10,25 fonte de cotações/.test(w) && /Preço de interesse R\$ 9,50 cotação 7,89% acima do seu preço/.test(w) && /Aporte planejado R\$ 1\.000,00 por valor/.test(w),'cotação da fonte, preço de interesse e aporte planejado separados: '+w);
  log(/Cotação R\$ 102,00 cotação da carteira/.test(t) && /10 unidades ≈ R\$ 1\.020,00 pela cotação usada/.test(t) && /já na carteira/.test(t),'ativo da carteira usa a cotação da carteira; aporte por quantidade estimado');
  log(/Cotação R\$ 21,50 informada por você em 01\/10\/2026/.test(m),'sem cotação na fonte: cotação manual identificada e datada');
  log(/sem cotação de mercado/.test(r) && /Sua prioridade: baixa/.test(r),'renda fixa sem cotação; prioridade é do usuário');
  await stage(p,'comprar');
  log(/Aporte planejado: R\$ 2\.020,00/.test(await txt(p,'#watchBody')),'total planejado: R$ 1.000 (valor) + 10 × R$ 102 (quantidade), cada item uma vez');
  // mover entre etapas (clique repetido envia uma vez)
  await menu(p,ID.wish);
  await ctl('watchDelay=300');
  await p.evaluate(i=>{ const b=document.getElementById('wlm-'+i); b.click(); b.click(); }, ID.wish);
  await p.waitForTimeout(800); await ctl('watchDelay=0');
  let c=await ctl('watch=1');
  log(c.watchLog.filter(l=>l.m==='PUT').length===1 && c.watch.find(x=>x.id===ID.wish).stage==='acompanhar','mover para "Quero acompanhar": um único envio, gravado');
  log(await p.evaluate(i=>document.getElementById('wlt-'+i).closest('section.wl-stage').getAttribute('aria-labelledby')==='hWl-acompanhar', ID.wish) && await p.evaluate(i=>document.activeElement.id==='wlo-'+i, ID.wish),'item aparece na outra etapa e o foco fica no botão de mover');
  await menu(p,ID.wish); await ctl('failWatchWrite=1'); await p.click('#wlm-'+ID.wish); await p.waitForTimeout(400); await ctl('failWatchWrite=0');
  log((await ctl('watch=1')).watch.find(x=>x.id===ID.wish).stage==='acompanhar' && /servidor não conseguiu/.test(await txt(p,'#toast')),'falha ao mover: aviso e item na etapa anterior');
  // editar e excluir
  await menu(p,ID.manu); await p.click('#wle-'+ID.manu); await p.waitForSelector('.sheet');
  log(await S(p,'Data dessa cotação').inputValue()==='2026-10-01' && await S(p,'Ou quantidade planejada (opcional)').inputValue()==='5','edição carrega os valores salvos');
  await S(p,'Sua prioridade').selectOption('2'); await p.click('.sheet button[type=submit]'); await p.waitForTimeout(500);
  log((await ctl('watch=1')).watch.find(x=>x.id===ID.manu).priority===2 && /Sua prioridade: média/.test(await card(p,ID.manu)),'edição gravada e refletida');
  await menu(p,ID.ipca); await p.click('#wle-'+ID.ipca); await p.waitForSelector('.sheet');
  await p.getByRole('button',{name:'Excluir'}).click();
  log(/Sua carteira não muda/.test(await txt(p,'.fin-confirm')) && (await ctl('')).watch===4,'exclusão pede confirmação e não remove antes');
  await p.getByRole('button',{name:'Remover dos planos'}).click(); await p.waitForTimeout(500);
  log((await ctl('')).watch===3 && !await p.evaluate(i=>!!document.getElementById('wlt-'+i), ID.ipca),'exclusão confirmada remove só o item');
  await abrir(p);
  log((await p.locator('.wl-card').count())===2 && /Planejo comprar \(1\)/.test(await txt(p,'#watchTabBuy')),'após recarregar, ambas as etapas mantêm os três itens persistidos no servidor');
  log(p._errs.length===0,'sem erros JS (lista) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- simulação de aporte: nada é gravado ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1&wl=1');
{ const {cx,p}=await novo(1100,900); await abrir(p);
  await stage(p,'comprar');
  const antes=await ctl('watch=1&puts=1');
  await p.click('#wls-'+ID.wish); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  let o=await txt(p,'.sheet');
  log(/Preço usado: R\$ 10,25 · fonte de cotações/.test(o) && /não altera a carteira nem registra compra/.test(o) && (o.match(/não altera a carteira/g)||[]).length===1,'simulação identifica o preço usado e avisa uma vez que nada é gravado');
  log(/Aporte usado\s*R\$ 994,25/.test(o) && /Quantidade\s*97 unidades/.test(o) && /Saldo restante\s*R\$ 5,75/.test(o),'por valor: só unidades inteiras (R$ 1.000 ÷ R$ 10,25 = 97) e saldo indicado');
  // o patrimônio fictício varia com a data (renda fixa estimada pelos dias aplicados): esperado calculado a partir dele
  const totCents=await p.evaluate(()=>Math.round(Number(document.getElementById('hsTotal').textContent.replace(/[^\d,]/g,'').replace(',','.'))*100));
  const f=(c)=>'R$ '+(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pc=(x)=>x.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  const sem=(s)=>s.replace(/\s+/g,'');
  log(sem(o).includes(sem(`Total da carteira ${f(totCents)} → ${f(totCents+99425)}`)) && sem(o).includes(sem(`Participação de WISH11 0,00% → ${pc(99425/(totCents+99425)*100)}`)),'novo total inclui só o aporte aplicado; participação antes e depois');
  const tab=await p.evaluate(()=>[...document.querySelectorAll('.wl-sim-table tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ')));
  log(tab.some(x=>new RegExp(`^FIIs ${pc(1217500/totCents*100)} R\\$ 12\\.175,00 ${pc(1316925/(totCents+99425)*100)} R\\$ 13\\.169,25`).test(x)) && tab.some(x=>/^Ações .* R\$ 210,00 .* R\$ 210,00/.test(x)),'distribuição por classe antes e depois '+JSON.stringify(tab));
  await p.fill('#wlSimValor',''); await p.type('#wlSimValor','500'); await p.waitForTimeout(100);
  log(/R\$ 5,00 não compra uma unidade inteira a R\$ 10,25/.test(await txt(p,'.sheet')),'valor menor que uma cota: não simula fração nem arredonda');
  await p.selectOption('.sheet .wl-sim-form select','quantidade'); await p.waitForTimeout(80);
  await p.fill('#wlSimValor','1,5'); await p.waitForTimeout(80);
  log(/unidades inteiras/.test(await txt(p,'.sheet')),'por quantidade: FII exige unidades inteiras');
  await p.fill('#wlSimValor','20'); await p.waitForTimeout(80);
  log(/Aporte usado\s*R\$ 205,00/.test(await txt(p,'.sheet')) && /Quantidade\s*20 unidades/.test(await txt(p,'.sheet')),'por quantidade: custo = quantidade × preço');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(i=>document.activeElement.id==='wls-'+i, ID.wish),'Escape fecha a simulação e devolve o foco ao botão');
  // ativo já na carteira, renda fixa, ativo sem preço
  await p.click('#wls-'+ID.test); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  const part=await p.evaluate(()=>{ const d=[...document.querySelectorAll('.sheet .sim-pair div')].find(x=>/Participação/.test(x.innerText)); return d.querySelector('dd').textContent; });
  const [pa,pd]=part.split('→').map(x=>parseFloat(x.replace(',','.')));
  log(/Aporte usado\s*R\$ 1\.020,00/.test(await txt(p,'.sheet')) && /Quantidade\s*10 unidades/.test(await txt(p,'.sheet')) && pa>0 && pd>pa,'ativo já na carteira: participação antes > 0 e cresce com o aporte ('+part+')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await stage(p,'acompanhar'); await p.click('#wls-'+ID.ipca); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  o=await txt(p,'.sheet');
  log(!await p.locator('.sheet select').count() && /Aporte usado\s*R\$ 500,00/.test(o) && !/Quantidade/.test(o) && /Preço: sem cotação disponível/.test(o),'renda fixa: aporte por valor, sem unidades e sem precisar de cotação');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const depois=await ctl('watch=1&puts=1');
  log(depois.saves===antes.saves && depois.puts.length===antes.puts.length && depois.watchLog.length===antes.watchLog.length,'simular não grava nada (nem carteira, nem lista)');
  log(p._errs.length===0,'sem erros JS (simulação) '+JSON.stringify(p._errs)); await cx.close(); }
{ await ctl('seed=1&logged=1&empty=0&reset=1');
  const {cx,p}=await novo(1100,900); await abrir(p);
  await p.click('#watchBody .fin-empty button'); await p.waitForSelector('.sheet');
  await S(p,'Ativo').fill('SEMP3'); await S(p,'Classe').selectOption('acao'); await S(p,'Ou quantidade planejada (opcional)').fill('5');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(600);
  const id=(await ctl('watch=1')).watch[0].id;
  await p.waitForTimeout(300);
  log(/sem cotação disponível/.test(await card(p,id)) && /sem preço para estimar o valor/.test(await card(p,id)),'ativo sem cotação na fonte nem manual: nada é estimado');
  await p.click('#wls-'+id); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  log(/Sem preço disponível, não dá para simular/.test(await txt(p,'.sheet')),'simulação recusa dados insuficientes em vez de inventar preço');
  await cx.close(); }

/* ---------- valores ocultos, falha ao carregar, celular ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1&wl=1');
{ const {cx,p}=await novo(1100,900,{ls:{'rendum.ocultarValores':'1'}}); await abrir(p);
  await stage(p,'comprar');
  const t=await p.evaluate(()=>document.getElementById('pg-watch').innerText);
  await p.click('#wls-'+ID.wish); await p.waitForSelector('.sheet'); await p.waitForTimeout(250);
  const s=await p.evaluate(()=>({t:document.querySelector('.sheet').innerText, type:document.getElementById('wlSimValor').type}));
  log(!/R\$\s?\d/.test(t) && /••• unidades/.test(t) && !/R\$\s?\d/.test(s.t) && s.type==='password','valores ocultos: lista e simulação sem valores, quantidades mascaradas, campo de valor oculto');
  await cx.close(); }
await ctl('seed=1&logged=1&empty=0&reset=1&wl=1&failWatchLoad=1');
{ const {cx,p}=await novo(1100,900); await abrir(p);
  log(await p.isVisible('#watchLoadErr') && !await p.isVisible('#watchAddBtn') && await p.locator('.wl-card').count()===0,'falha ao carregar: aviso e nenhuma ação sobre dados desconhecidos');
  await ctl('failWatchLoad=0'); await p.click('#watchRetry'); await p.waitForTimeout(500);
  log(await p.locator('.wl-card').count()===2 && /\(2\)/.test(await txt(p,'#watchTabBuy')),'tentar de novo carrega a lista');
  await cx.close(); }
for (const w of [320,390]) for (const scheme of ['light','dark']){
  await ctl('seed=1&logged=1&empty=0&reset=1&wl=1');
  const {cx,p}=await novo(w,800,{scheme}); await abrir(p);
  await stage(p,'comprar');
  const m=await p.evaluate(()=>({ sw:document.documentElement.scrollWidth, iw:innerWidth,
    fora:[...document.querySelectorAll('#pg-watch *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length,
    alvos:Math.min(...[...document.querySelectorAll('#pg-watch .wl-actions > button, #pg-watch .wl-menu > summary')].map(b=>b.getBoundingClientRect().height)) }));
  await p.click('#wls-'+ID.wish); await p.waitForSelector('.sheet'); await p.waitForTimeout(300);
  const s=await p.evaluate(()=>({ fora:[...document.querySelectorAll('.sheet *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length }));
  log(m.sw<=m.iw && m.fora===0 && m.alvos>=44 && s.fora===0,`${w}px ${scheme}: lista e simulação (sob demanda) sem rolagem horizontal; ações ≥ 44 px ${JSON.stringify({...m,sim:s})}`);
  if (p._errs.length) log(false,'erros JS '+JSON.stringify(p._errs));
  await cx.close();
}
log(externos.length===0,'nenhum pedido a servidores externos '+JSON.stringify(externos.slice(0,3)));
await br.close(); srv.kill();
process.exit(fails?1:0);
