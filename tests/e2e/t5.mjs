const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const B='http://localhost:8787'; const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const log=(ok,msg)=>console.log((ok?'PASS ':'FAIL ')+msg);
const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1440,height:1000}, colorScheme:'dark'}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
await ctl('seed=1&logged=1&failLoad=0&failSave=0&failRefresh=0&delay=0&empty=0');
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(300);
log(await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark','tema inicial segue sistema (dark)');
log(await pg.textContent('#themeBtn')==='Tema claro','botão tema reflete estado');
await pg.click('#themeBtn');
log(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light' && await pg.evaluate(()=>localStorage.getItem('rendum.tema'))==='light','alterna e persiste');
await pg.reload(); await pg.waitForSelector('#app:not(.hide)');
log(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','escolha manual vence o sistema após recarregar');
// navegação
for (const [pgk,hash,title] of [['holdings','#carteira','Minha carteira'],['income','#proventos','Proventos'],['simulators','#cenarios','Cenários'],['overview','#visao-geral','Visão geral']]){
  await pg.click(`.mainnav a[data-page=${pgk}]`); await pg.waitForTimeout(100);
  const st=await pg.evaluate(k=>({h:location.hash, t:document.getElementById('pageTitle').textContent, cur:document.querySelector('.mainnav [aria-current=page]').dataset.page, vis:[...document.querySelectorAll('[data-panel]')].filter(s=>!s.hidden).map(s=>s.dataset.panel), f:document.activeElement.id}),pgk);
  log(st.h===hash&&st.t===title&&st.cur===pgk&&st.vis.length===1&&st.vis[0]===pgk&&st.f==='pageTitle','navega '+pgk+' '+JSON.stringify(st));
}
await pg.goBack(); await pg.waitForTimeout(150);
log(await pg.evaluate(()=>document.querySelector('.mainnav [aria-current=page]').dataset.page)==='simulators','voltar do navegador');
await pg.goto(B+'/#proventos'); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
log(await pg.evaluate(()=>!document.getElementById('pg-income').hidden),'link direto #proventos');
// endereços antigos (favoritos) continuam abrindo as páginas renomeadas
for (const [h,k,t] of [['#simuladores','simulators','Cenários'],['#interesse','watch','Meus planos']]){
  await pg.goto(B+'/'+h); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(150);
  log(await pg.evaluate(([k,t])=>!document.getElementById('pg-'+({simulators:'simulators',watch:'watch'})[k]).hidden && document.getElementById('pageTitle').textContent===t,[k,t]),'endereço antigo '+h+' abre '+t);
}
await pg.goto(B+'/#proventos'); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
// income
const it=await pg.evaluate(()=>({title:document.getElementById('monthTitle').textContent, dia15:document.getElementById('cald-15').getAttribute('aria-label'),
  marcados:[...document.querySelectorAll('#calendar .cal-d.has')].map(b=>b.dataset.day), und:document.getElementById('undatedBox').innerText}));
log(/2 pagamentos anunciados/.test(it.dia15) && it.marcados.join()==='15' && /Estimativas sem data/.test(it.und) && /SEMD11/.test(it.und) && /Próximas datas anunciadas/.test(it.und) && /FUTR3/.test(it.und),
  'calendário mês atual: 2 anúncios no dia 15, estimativas sem data e datas de outros meses separadas '+JSON.stringify({...it,und:undefined}));
await pg.click('#nextMonth'); await pg.waitForTimeout(100);
const nx=await pg.evaluate(()=>({marcados:[...document.querySelectorAll('#calendar .cal-d.has')].map(b=>b.getAttribute('aria-label')), lista:document.getElementById('calDay').innerText.replace(/\s+/g,' '), und:document.getElementById('undatedBox').innerText, cur:document.getElementById('thisMonth').disabled}));
log(nx.marcados.length===1 && /^3 de .*1 pagamento anunciado/.test(nx.marcados[0]) && /FUTR3/.test(nx.lista) && nx.und==='' && !nx.cur,'próximo mês mostra FUTR3 no dia anunciado, sem estimativas sem data '+JSON.stringify(nx.marcados));
await pg.click('#thisMonth');
await pg.click('#cald-15'); await pg.waitForTimeout(100);
await pg.click('#calDay .cal-ev'); await pg.waitForSelector('.sheet[role=dialog]');
log(/Pagamento anunciado/.test(await pg.textContent('.sheet')) && /(não confirma que você recebeu|ainda não pago)/.test(await pg.textContent('.sheet')),'detalhe do provento diz anunciado, sem confirmar recebimento');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(350);
log(await pg.evaluate(()=>document.activeElement.classList.contains('cal-ev')),'foco volta ao evento');
// holdings
await pg.click('.mainnav a[data-page=holdings]');
const rowsAll=await pg.$$eval('#assetList tr.pos-row',r=>r.length);
await pg.fill('#hSearch','demo'); await pg.waitForTimeout(100);
log(await pg.$$eval('#assetList tr.pos-row',r=>r.length)===1 && /1 ativo encontrado/.test(await pg.textContent('#searchStatus')),'busca filtra ('+rowsAll+' → 1)');
await pg.fill('#hSearch',''); await pg.click('#hClasses [data-class=rf]');
log((await pg.$$eval('#assetList tr.pos-row',t=>t.map(x=>x.dataset.row))).join()==='r1','filtro classe mostra só Renda fixa');
await pg.click('#hClasses [data-class=""]'); await pg.selectOption('#hSort','value');
const vals=await pg.$$eval('#assetList tr.pos-row td.col-value > span:first-child',es=>es.map(x=>Number(x.textContent.replace(/[^\d,]/g,'').replace(',','.'))));
log(vals.length>1 && vals.every((v,i)=>i===0||vals[i-1]>=v),'ordenar por maior posição no conjunto exibido '+JSON.stringify(vals));
// tela larga: detalhes ao lado da tabela; Escape fecha e devolve o foco à linha
await pg.click('#assetList tr.pos-row .assetname'); await pg.waitForSelector('#holdDetail:not([hidden])');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
log(await pg.evaluate(()=>document.getElementById('holdDetail').hidden && document.activeElement.classList.contains('assetname')&&document.activeElement.offsetParent!==null),'foco volta à linha visível');
// privacidade em todas as páginas
await pg.click('#visBtn');
let leak=[];
for (const k of ['overview','holdings','income','simulators']){ await pg.click(`.mainnav a[data-page=${k}]`); await pg.waitForTimeout(80);
  const t=await pg.evaluate(()=>document.getElementById('app').innerText); const m=t.match(/R\$\s?\d[\d.,]*/g)||[]; if(m.length) leak.push(k+':'+m.slice(0,3).join('|')); }
log(leak.length===0,'ocultar valores em todas as páginas '+leak.join(' ; '));
await pg.fill('#bazinPx','40'); await pg.fill('#bazinDiv','4');
log(!/R\$\s?\d/.test(await pg.textContent('#bazinOut')),'Bazin mascarado com valores ocultos');
await pg.click('.mainnav a[data-page=income]'); await pg.click('#calDay .cal-ev'); await pg.waitForSelector('.sheet');
log(!/R\$\s?\d/.test(await pg.textContent('.sheet')),'detalhe do provento mascarado');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
await pg.click('#visBtn');
// concorrência: refresh lento
await pg.click('.mainnav a[data-page=overview]');
await ctl('delay=1200');
await pg.click('#refreshBtn'); await pg.waitForTimeout(150);
const busy=await pg.evaluate(()=>({add:document.getElementById('addBtn').disabled, rf:document.getElementById('refreshBtn').disabled, t:document.getElementById('refreshBtn').textContent}));
log(busy.add&&busy.rf&&busy.t==='Atualizando…','durante atualização: adicionar e atualizar desabilitados');
await pg.click('#refreshBtn',{force:true}).catch(()=>{});
await pg.click('#assetList .assetname, #overviewPositions .assetname'); await pg.waitForTimeout(100);
log(await pg.evaluate(()=>!document.querySelector('.sheet')),'não abre edição durante atualização');
await pg.waitForTimeout(4500); await ctl('delay=0');
log(!(await pg.evaluate(()=>document.getElementById('addBtn').disabled)),'botões restaurados após atualizar');
log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br.close();
