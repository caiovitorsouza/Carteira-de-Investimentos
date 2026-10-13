// Carteira agrupada, logos com fallback, detalhes ao lado da tabela e menu lateral recolhível
// (dados fictícios, servidor de teste; nenhum logo real é baixado).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9600+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const externos=[];
const novo=async(w,h,opt={})=>{ const cx=await br.newContext({viewport:{width:w,height:h},colorScheme:opt.scheme||'light',reducedMotion:opt.reduced||'no-preference'});
  if (opt.ls) await cx.addInitScript(ls=>{ for (const [k,v] of Object.entries(ls)) localStorage.setItem(k,v); }, opt.ls);
  // nenhum pedido sai do servidor local (logos de terceiros não são baixados nos testes)
  await cx.route(u=>!u.href.startsWith(B), r=>{ externos.push(r.request().url()); return r.abort(); });
  const p=await cx.newPage(); p._errs=[]; p.on('pageerror',e=>p._errs.push(e.message)); return {cx,p}; };
const abrir=async(p,hash='#carteira')=>{ await p.goto(B+'/'+hash); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(450); };
const txt=(p,sel)=>p.textContent(sel).then(t=>(t||'').replace(/\s+/g,' ').trim());

/* ---------- logos e fallback ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p); await p.waitForTimeout(300);
  const lg=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#assetList tr.pos-row')].map(tr=>{ const m=tr.querySelector('.amark'); const img=m.querySelector('img');
    return [tr.dataset.row,{img:!!img, ok:!!img&&img.complete&&img.naturalWidth>0, mono:img?null:m.textContent, w:Math.round(m.getBoundingClientRect().width), h:Math.round(tr.getBoundingClientRect().height), hidden:m.getAttribute('aria-hidden')}]; })));
  log(lg.a1.ok && lg.a1.w===28,'logo do próprio ticker carrega (TEST11)');
  log(lg.a2.mono==='DE' && !lg.a2.img,'logo de outro ticker é recusado: monograma (DEMO11)');
  log(lg.a6.mono==='PA','ícone genérico do provedor conta como ausente (PASS11)');
  log(lg.a4.mono==='IN','falha ao carregar o logo vira monograma (INVL11)');
  log(lg.r1.mono==='TS' && lg.a3.mono==='SE','sem logo: monograma neutro (renda fixa e FII sem logo)');
  log(Object.values(lg).every(x=>x.w===28 && x.hidden==='true'),'marca com tamanho fixo e oculta do leitor de tela (o nome já está ao lado)');
  // mesma estrutura de conteúdo (resultado em duas linhas): com logo (a1) e com monograma (a2)
  log(Math.abs(lg.a1.h-lg.a2.h)<=1,`linhas com e sem logo têm a mesma altura (${lg.a1.h}/${lg.a2.h})`);
  // Visão geral preservada: mesma tabela (Ativo / Valor atual / Peso), agora com logos
  await p.evaluate(()=>document.querySelector('.mainnav a[data-page=overview]').click()); await p.waitForTimeout(150);
  const ov=await p.evaluate(()=>({heads:[...document.querySelectorAll('#overviewPositions th')].map(t=>t.textContent), marks:document.querySelectorAll('#overviewPositions .amark').length, rows:document.querySelectorAll('#overviewPositions tbody tr').length}));
  log(ov.heads.join('|')==='Ativo|Valor atual|Peso' && ov.marks===ov.rows && ov.rows===6,'Visão geral mantém a tabela e ganha logos '+JSON.stringify(ov));
  log(p._errs.length===0,'sem erros JS (logos) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- grupos, busca, filtros ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const g=await p.evaluate(()=>({ heads:[...document.querySelectorAll('#assetList thead th')].map(t=>t.childNodes[0].textContent),
    tabs:[...document.querySelectorAll('#hClasses button')].map(b=>b.textContent), rows:document.querySelectorAll('#assetList tr.pos-row').length }));
  log(g.heads.join('|')==='Ativo|Quantidade|Cotação|Valor total|Resultado|Peso','colunas: ativo, quantidade, cotação (preço médio abaixo), valor, resultado, peso');
  log(g.tabs.join('|')==='Todos|Ações|FIIs|Renda fixa' && g.rows===7,'filtros horizontais e uma tabela com todas as posições');
  const rf=await p.evaluate(()=>{ const tr=document.querySelector('#assetList tr[data-row=r1]'); return { q:tr.querySelector('.col-qty [aria-hidden]').textContent, sr:tr.querySelector('.col-qty .sr-only').textContent, cot:tr.querySelector('.col-quote [aria-hidden]').textContent }; });
  log(rf.q==='—' && rf.sr==='não se aplica' && rf.cot==='—','renda fixa: quantidade e cotação ausentes não viram zero '+JSON.stringify(rf));
  const semNome=await p.evaluate(()=>[...document.querySelectorAll('#assetList .assetname')].every(b=>{ const s=b.querySelector('small'); return !s || s.textContent.trim().toLowerCase()!==b.querySelector('.an-main').textContent.trim().toLowerCase(); }));
  log(semNome,'ticker não se repete como nome');
  const alinh=await p.evaluate(()=>[...document.querySelectorAll('#assetList td.num')].filter(td=>td.offsetParent).every(td=>getComputedStyle(td).textAlign==='right'));
  log(alinh,'números alinhados à direita');
  await p.click('#hClasses [data-class=fii]');
  log(await p.locator('#assetList tr.pos-row').count()===5 && await p.locator('.grp-btn').count()===0,'FIIs: cinco posições, sem grupos recolhíveis');
  await p.fill('#hSearch','demo'); await p.waitForTimeout(150);
  log(await p.locator('#assetList tr.pos-row').count()===1 && /1 ativo encontrado/.test(await txt(p,'#searchStatus')),'busca aplicada ao filtro escolhido');
  await p.click('#hClasses [data-class=acao]');
  log(await p.locator('#assetList tr.pos-row').count()===0,'trocar classe preserva a busca e não inclui FIIs em Ações');
  await p.fill('#hSearch',''); await p.click('#hClasses [data-class=""]');
  // sem resultados ≠ carteira vazia
  await p.fill('#hSearch','zzzz'); await p.waitForTimeout(150);
  const nr=await txt(p,'#assetList');
  log(/Nenhum ativo da sua carteira corresponde a “zzzz”/.test(nr) && !/ainda não tem posições/.test(nr) && await p.locator('#assetList .no-results button').count()===1,'busca sem resultados tem mensagem própria e ação para limpar');
  await p.click('#assetList .no-results button'); await p.waitForTimeout(150);
  log(await p.evaluate(()=>document.activeElement.id==='hSearch' && document.querySelectorAll('#assetList tr.pos-row').length===7),'limpar volta à carteira completa e foca a busca');
  // ordenação por nome dentro dos grupos
  await p.selectOption('#hSort','name'); await p.waitForTimeout(100);
  const fiis=await p.$$eval('#assetList tr.pos-row .an-main',e=>e.map(x=>x.textContent));
  log(fiis.join()===[...fiis].sort((a,b)=>a.localeCompare(b,'pt-BR')).join(),'ordenar por nome no conjunto: '+fiis.join(','));
  await p.selectOption('#hSort','default');
  log(p._errs.length===0,'sem erros JS (grupos) '+JSON.stringify(p._errs)); await cx.close(); }
{ await ctl('seed=1&logged=1&empty=1&reset=1'); const {cx,p}=await novo(1440,900); await abrir(p);
  const e=await txt(p,'#pg-holdings');
  log(/ainda não tem posições/.test(e) && await p.evaluate(()=>document.querySelector('#pg-holdings .filterbar').hidden),'carteira vazia: estado próprio, sem busca sobre lista vazia');
  await cx.close(); await ctl('empty=0'); }

/* ---------- detalhes ao lado da tabela (tela larga) ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const larg0=await p.evaluate(()=>[...document.querySelectorAll('#assetList thead th')].filter(t=>getComputedStyle(t).display!=='none').length);
  await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(200);
  const d=await p.evaluate(()=>{ const h=document.getElementById('holdDetail'); const t=document.querySelector('#assetList .hold-table');
    return { aberto:!h.hidden, sheet:!!document.querySelector('.sheet'), cols:[...document.querySelectorAll('#assetList thead th')].filter(t=>getComputedStyle(t).display!=='none').map(t=>t.childNodes[0].textContent),
      cabe:t.scrollWidth<=t.parentElement.clientWidth, foco:document.activeElement.id, nome:h.getAttribute('aria-labelledby'), sel:document.querySelector('#assetList tr.is-selected')?.dataset.row,
      txt:h.innerText.replace(/\s+/g,' '), links:[...h.querySelectorAll('.asset-links a')].map(a=>({h:a.href, rel:a.rel, t:a.target})) }; });
  log(d.aberto && !d.sheet && larg0===6 && d.cols.join('|')==='Ativo|Valor total|Resultado' && d.cabe,'tela larga: painel ao lado, lista reduzida a ativo/valor/resultado e sem corte '+d.cols.join('|'));
  log(d.foco==='holdDetailTitle' && d.nome==='holdDetailTitle' && d.sel==='a1','foco no título do painel; linha selecionada destacada');
  log(/Fundo imobiliário/.test(d.txt) && /Cotação atual R\$ 102,00 Atualizada/.test(d.txt) && /Valor da posição R\$ 10\.200,00/.test(d.txt) && /Quantidade 100/.test(d.txt) && /Preço médio R\$ 100,00/.test(d.txt) && /Total investido R\$ 10\.000,00/.test(d.txt)
    && /Resultado da posição \+ R\$ 200,00 \+2,00% sobre o preço médio/.test(d.txt) && /Participação na carteira \d{1,2},\d\d%/.test(d.txt),'detalhes: classe, cotação com atualização, quantidade, preço médio, investido, resultado e participação');
  log(/não é o retorno total/.test(d.txt) && !/Variação do dia/.test(d.txt),'resultado da posição separado de retorno total; sem variação do dia quando o dado não existe');
  log(d.links.length===1 && d.links[0].h.startsWith('https://fnet.bmfbovespa.com.br/') && d.links[0].rel.includes('noopener') && d.links[0].t==='_blank','Links do ativo: só endereço conferido, em nova aba com noopener');
  await p.click('#assetList [data-pid=a5]'); await p.waitForTimeout(150);
  const d2=await p.evaluate(()=>({t:document.querySelector('#holdDetail .ticker').textContent, links:document.querySelectorAll('#holdDetail .asset-links').length, sel:document.querySelector('#assetList tr.is-selected')?.dataset.row}));
  log(d2.t==='FUTR3' && d2.links===0 && d2.sel==='a5','outro ativo atualiza o painel; sem links conferidos, a seção não aparece');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const fe=await p.evaluate(()=>({h:document.getElementById('holdDetail').hidden, docked:document.getElementById('assetsSection').classList.contains('docked'), foco:document.activeElement.dataset.pid, cols:[...document.querySelectorAll('#assetList thead th')].filter(t=>getComputedStyle(t).display!=='none').length}));
  log(fe.h && !fe.docked && fe.foco==='a5' && fe.cols===6,'Escape fecha, restaura a tabela completa e devolve o foco à linha');
  // ação a partir do painel: abre por cima e o foco volta à linha do ativo
  await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(150);
  await p.click('#holdDetail .sheet-actions .btn:not(.btn-ghost)'); await p.waitForSelector('.sheet[role=dialog]');
  log(/Aportar/.test(await txt(p,'.sheet')) && !await p.evaluate(()=>document.getElementById('holdDetail').hidden),'Aportar abre por cima, sem fechar os detalhes');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(()=>!document.querySelector('.sheet') && document.activeElement.closest('#holdDetail') && /Aportar/.test(document.activeElement.textContent)),'ao fechar o aporte, o foco volta ao botão que o abriu');
  await p.click('#holdDetail .close-btn'); await p.waitForTimeout(100);
  log(await p.evaluate(()=>document.getElementById('holdDetail').hidden && document.activeElement.dataset.pid==='a1'),'botão Fechar do painel devolve o foco à linha');
  // ocultar valores: quantidade e valores mascarados, inclusive no painel
  await p.click('#visBtn'); await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(150);
  const oc=await p.evaluate(()=>({q:document.querySelector('#assetList tr[data-row=a1] .col-qty').textContent, t:document.getElementById('pg-holdings').innerText}));
  log(oc.q==='•••' && !/R\$\s?\d/.test(oc.t) && !/Quantidade 100/.test(oc.t),'ocultar valores cobre tabela, grupos e painel (inclui quantidade)');
  await p.click('#visBtn');
  log(p._errs.length===0,'sem erros JS (painel) '+JSON.stringify(p._errs)); await cx.close(); }
/* ---------- total da posição e confirmação de Aportar/Vender (persistência e foco) ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const servidor=async(id)=>(await ctl('data=1')).data.find(x=>x.id===id);
  // textos normalizados: o Intl usa espaço não separável depois de "R$"
  const painel=()=>p.evaluate(()=>{ const n=(s)=>s==null?s:s.replace(/\s+/g,' ').trim(); const h=document.getElementById('holdDetail'); const fato=(k)=>n([...h.querySelectorAll('.pos-facts .fact')].find(f=>f.querySelector('dt').textContent===k)?.querySelector('dd').childNodes[0].textContent);
    const tr=document.querySelector('#assetList tr[data-row=a1]');
    return { total:fato('Valor da posição'), cot:n(h.querySelector('.sheet-value')?.textContent), rotulo:h.querySelector('.value-label')?.textContent, qtd:fato('Quantidade'), pm:fato('Preço médio'), inv:fato('Total investido'),
      linhaValor:n(tr?.querySelector('.col-value > span').textContent), linhaQtd:n(tr?.querySelector('.col-qty').textContent) }; });
  await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(150);
  const d0=await painel();
  log(d0.total==='R$ 10.200,00' && d0.linhaValor===d0.total && d0.cot==='R$ 102,00' && /Cotação atual/.test(d0.rotulo) && d0.inv==='R$ 10.000,00','total da posição nos detalhes = quantidade × cotação (100 × R$ 102,00) e igual ao da tabela '+JSON.stringify(d0));
  // Cancelar com Escape não grava nada
  const puts0=(await ctl('')).puts;
  await p.click('#holdDetail .sheet-actions .btn:not(.btn-ghost)'); await p.waitForSelector('.sheet[role=dialog]');
  await (await p.$$('.sheet input'))[0].fill('5'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log((await ctl('')).puts===puts0 && (await servidor('a1')).q===100,'aporte cancelado com Escape não envia nada');
  // Aportar: 10 cotas a R$ 102,00 → 110 cotas, PM ponderado (100×100 + 10×102)/110
  await p.click('#holdDetail .sheet-actions .btn:not(.btn-ghost)'); await p.waitForSelector('.sheet[role=dialog]');
  await (await p.$$('.sheet input'))[0].fill('10'); await p.waitForTimeout(80);
  log(/110 cotas/.test(await txt(p,'.sheet .preview-note')),'prévia do aporte mostra a nova quantidade antes de confirmar');
  await p.click('.sheet .btn-full'); await p.waitForTimeout(800);
  const sa=await servidor('a1'), da=await painel();
  const pmEsperado=(100*100+10*102)/110;
  log(sa.q===110 && Math.abs(sa.c-pmEsperado)<1e-9,`aporte confirmado e gravado no servidor (q=${sa.q}, PM=${sa.c.toFixed(4)})`);
  log(da.total==='R$ 11.220,00' && da.qtd==='110' && da.pm==='R$ 100,18' && da.inv==='R$ 11.020,00' && da.linhaQtd==='110' && da.linhaValor==='R$ 11.220,00','painel e tabela atualizados após o aporte '+JSON.stringify(da));
  log(await p.evaluate(()=>!document.querySelector('.sheet') && document.activeElement.dataset.pid==='a1' && document.activeElement.offsetParent!==null),'após confirmar o aporte, o foco volta à linha do ativo');
  log(/Aporte de 10 cotas registrado/.test(await txt(p,'#toast')),'confirmação do aporte informada ao usuário');
  // Vender: 30 cotas → 80 cotas, preço médio inalterado
  await p.click('#holdDetail .sheet-actions .btn-ghost'); await p.waitForSelector('.sheet[role=dialog]');
  await (await p.$$('.sheet input'))[0].fill('30'); await p.waitForTimeout(80);
  log(/Vão sobrar 80 cotas/.test(await txt(p,'.sheet .preview-note')),'prévia da venda mostra as cotas restantes');
  await p.click('.sheet .btn-full'); await p.waitForTimeout(800);
  const sv=await servidor('a1'), dv=await painel();
  log(sv.q===80 && Math.abs(sv.c-pmEsperado)<1e-9,`venda confirmada e gravada; preço médio não muda (q=${sv.q})`);
  // venda não muda o preço médio; o total investido acompanha as cotas restantes (80 × PM)
  log(dv.total==='R$ 8.160,00' && dv.qtd==='80' && dv.pm==='R$ 100,18' && dv.inv==='R$ 8.014,55' && dv.linhaQtd==='80','painel e tabela atualizados após a venda '+JSON.stringify(dv));
  log(await p.evaluate(()=>!document.querySelector('.sheet') && document.activeElement.dataset.pid==='a1'),'após confirmar a venda, o foco volta à linha do ativo');
  // Persistência: recarregar mostra o que foi gravado
  await abrir(p); await p.click('#assetList [data-pid=a1]'); await p.waitForTimeout(150);
  const dr=await painel();
  log(dr.total==='R$ 8.160,00' && dr.qtd==='80' && dr.pm==='R$ 100,18','após recarregar, a posição continua com 80 cotas e o mesmo preço médio');
  log(p._errs.length===0,'sem erros JS (aporte/venda no painel lateral) '+JSON.stringify(p._errs)); await cx.close(); }
// Painel vindo da direita (tela intermediária): mesma confirmação, persistência e foco
{ const {cx,p}=await novo(900,768); await abrir(p);
  await p.click('#assetList [data-pid=a2]'); await p.waitForSelector('.sheet[role=dialog]'); await p.waitForTimeout(400);   // fim da entrada pela direita
  log(await p.evaluate(()=>{ const f=[...document.querySelectorAll('.sheet .pos-facts .fact')].find(x=>x.querySelector('dt').textContent==='Valor da posição'); const s=document.querySelector('.sheet').getBoundingClientRect(); return f.querySelector('dd').childNodes[0].textContent.replace(/\s+/g,' ')==='R$ 475,00' && !!document.querySelector('.sheet-backdrop.sheet-side') && Math.abs(s.right-innerWidth)<1 && s.height>=innerHeight-1; }),'tela intermediária: painel vindo da direita, com o total da posição (50 × R$ 9,50)');
  await p.click('.sheet .sheet-actions .btn-ghost'); await p.waitForTimeout(450);
  await (await p.$$('.sheet input'))[0].fill('10'); await p.click('.sheet .btn-full'); await p.waitForTimeout(800);
  const s=(await ctl('data=1')).data.find(x=>x.id==='a2');
  log(s.q===40 && s.c===10,'venda pelo painel modal gravada (50 → 40 cotas, PM mantido)');
  log(await p.evaluate(()=>!document.querySelector('.sheet') && document.activeElement.dataset.pid==='a2' && document.activeElement.offsetParent!==null),'foco volta à linha do ativo após Detalhes → Vender');
  await p.click('#assetList [data-pid=a2]'); await p.waitForSelector('.sheet[role=dialog]');
  await p.click('.sheet .sheet-actions .btn:not(.btn-ghost)'); await p.waitForTimeout(450);
  await (await p.$$('.sheet input'))[0].fill('10'); await p.click('.sheet .btn-full'); await p.waitForTimeout(800);
  const s2=(await ctl('data=1')).data.find(x=>x.id==='a2');
  log(s2.q===50 && Math.abs(s2.c-(40*10+10*9.5)/50)<1e-9 && await p.evaluate(()=>document.activeElement.dataset.pid==='a2'),'aporte pelo painel modal gravado e foco devolvido à linha');
  await abrir(p);
  log(await p.evaluate(()=>document.querySelector('#assetList tr[data-row=a2] .col-qty').textContent)==='50','após recarregar, a tabela mostra a quantidade gravada');
  log(p._errs.length===0,'sem erros JS (aporte/venda no painel modal) '+JSON.stringify(p._errs)); await cx.close(); }
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(900,768); await abrir(p);
  await p.click('#assetList [data-pid=a1]'); await p.waitForSelector('.sheet[role=dialog]');
  log(await p.evaluate(()=>document.getElementById('holdDetail').hidden && !!document.querySelector('.sheet-side .sheet .pos-facts')),'tela intermediária: detalhes num painel vindo da direita');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.activeElement.dataset.pid==='a1'),'Escape devolve o foco à linha'); await cx.close(); }

/* ---------- menu automático ---------- */
{ const {cx,p}=await novo(1440,900); await abrir(p);
  const main=await p.locator('.main').boundingBox();
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed')),'computador inicia recolhido');
  await p.hover('#sidebar'); await p.waitForTimeout(250);
  log(await p.evaluate(()=>document.getElementById('sidebar').getBoundingClientRect().width===224),'aproximar cursor expande');
  log((await p.locator('.main').boundingBox()).x===main.x,'expansão não desloca o conteúdo');
  await p.mouse.move(900,100); await p.waitForTimeout(450);
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed')),'sair recolhe após atraso');
  await p.focus('.mainnav a[data-page=income]'); await p.waitForTimeout(220);
  log(await p.evaluate(()=>!document.getElementById('shell').classList.contains('side-collapsed') && [...document.querySelectorAll('.mainnav a')].every(a=>a.getBoundingClientRect().height>=44 && a.textContent.trim())),'teclado mantém expandido, nomes acessíveis e alvos ≥44');
  await p.focus('#hSearch'); await p.waitForTimeout(450);
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed')),'sair com teclado volta ao modo automático');
  log(await p.evaluate(()=>!!document.querySelector('.side-brand #sideToggle') && !document.querySelector('.sidebar > #sideToggle')),'manter aberto fica no cabeçalho da lateral (sem botão isolado no rodapé)');
  await p.focus('#sideToggle'); await p.keyboard.press('Enter'); await p.focus('#hSearch'); await p.mouse.move(900,100); await p.waitForTimeout(450);
  log(await p.evaluate(()=>!document.getElementById('shell').classList.contains('side-collapsed') && document.getElementById('sideToggle').getAttribute('aria-pressed')==='true' && document.querySelector('.main').getBoundingClientRect().x>=224),'botão permite manter expandido (por teclado ou toque); fixada, a lateral ocupa a própria coluna');
  await p.focus('#sideToggle'); await p.keyboard.press('Enter'); await p.focus('#hSearch'); await p.mouse.move(900,100); await p.waitForTimeout(450);
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed') && document.documentElement.scrollWidth===1440),'botão retorna ao automático sem rolagem horizontal');
  log(p._errs.length===0,'sem erros JS no menu'); await cx.close(); }
{ const {cx,p}=await novo(1440,900,{reduced:'reduce'}); await abrir(p);
  log(await p.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('shell')).transitionDuration)===0),'movimento reduzido: menu recolhe sem animação'); await cx.close(); }
{ const {cx,p}=await novo(390,844); await abrir(p);
  await p.click('#menuBtn'); await p.waitForTimeout(350);
  const ab=await p.evaluate(()=>({exp:document.getElementById('menuBtn').getAttribute('aria-expanded'), inert:document.getElementById('mainContent').inert, lab:document.getElementById('menuBtnLabel').textContent}));
  await p.click('.mainnav a[data-page=income]'); await p.waitForTimeout(350);
  const nav=await p.evaluate(()=>({h:location.hash, vis:getComputedStyle(document.getElementById('sidebar')).visibility, inert:document.getElementById('mainContent').inert, foco:document.activeElement.id}));
  log(ab.exp==='true' && ab.inert && ab.lab==='Fechar' && nav.h==='#proventos' && nav.vis==='hidden' && !nav.inert && nav.foco==='pageTitle','celular: menu abre, escolher página fecha o menu e foca o título');
  await p.click('#menuBtn'); await p.waitForTimeout(300); await p.mouse.click(370,500); await p.waitForTimeout(350);
  log(await p.evaluate(()=>getComputedStyle(document.getElementById('sidebar')).visibility==='hidden'),'tocar fora fecha o menu');
  await cx.close(); }

/* ---------- larguras, temas e 100 ativos: nada cortado, sem rolagem horizontal ---------- */
for (const cenario of ['seed','many=100']){
  for (const w of [320,390,768,1440]) for (const scheme of ['light','dark']){
    await ctl('seed=1&logged=1&empty=0&reset=1'+(cenario==='seed'?'':'&'+cenario));
    const {cx,p}=await novo(w,800,{scheme}); await abrir(p);
    const m=await p.evaluate(()=>{ const t=document.querySelector('#assetList .hold-table'); const pg=document.getElementById('pg-holdings');
      return { tab:t.scrollWidth<=t.parentElement.clientWidth, sw:document.documentElement.scrollWidth, iw:innerWidth,
        fora:[...pg.querySelectorAll('*')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5; }).length,
        tickers:[...pg.querySelectorAll('.assetname:not(.no-ticker) .an-main')].filter(e=>e.offsetParent && e.scrollWidth>e.clientWidth+1).length,
        valores:[...pg.querySelectorAll('td.num > span:not(.sr-only), td.num small')].filter(e=>e.offsetParent && e.scrollWidth>e.clientWidth+1).length,
        // resultado aparece exatamente uma vez por linha: coluna própria ou, no celular estreito, sob o valor
        resultado:[...pg.querySelectorAll('tr.pos-row')].filter(r=>r.offsetParent).every(r=>[...r.querySelectorAll('.col-result, .mob-res')].filter(x=>x.offsetParent && x.textContent.trim()).length===1) }; });
    log(m.tab && m.sw<=m.iw && m.fora===0 && m.tickers===0 && m.valores===0 && m.resultado,`${cenario} ${w}px ${scheme}: tabela cabe, sem rolagem horizontal, tickers e valores inteiros, resultado visível ${JSON.stringify(m)}`);
    if (p._errs.length) log(false,'erros JS '+JSON.stringify(p._errs));
    await cx.close();
  }
}
log(externos.length===0,'nenhum pedido a servidores externos durante os testes '+JSON.stringify(externos.slice(0,3)));
await br.close(); srv.kill();
process.exit(fails?1:0);
