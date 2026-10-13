// Refinamentos de interface: primeira entrada, estados vazios com ação única, ações do cabeçalho por
// página, seções expansíveis (teclado/foco) e celular compacto (dados fictícios, servidor de teste).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9500+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const novo=async(w,h,scheme='light')=>{ const cx=await br.newContext({viewport:{width:w,height:h},colorScheme:scheme}); const p=await cx.newPage(); p._errs=[]; p.on('pageerror',e=>p._errs.push(e.message)); return {cx,p}; };
const txt=(p,sel)=>p.textContent(sel).then(t=>t.replace(/\s+/g,' ').trim());
const vis=(p,sel)=>p.evaluate(s=>{ const e=document.querySelector(s); return !!e && e.offsetParent!==null && getComputedStyle(e).visibility!=='hidden'; }, sel);
const ir=async(p,page)=>{ await p.evaluate(k=>document.querySelector(`.mainnav a[data-page=${k}]`).click(),page); await p.waitForTimeout(150); };
const abrir=async(p)=>{ await p.goto(B); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(400); };

/* ---------- carteira vazia: primeira entrada ---------- */
await ctl('seed=1&logged=1&empty=1&reset=1');
{ const {cx,p}=await novo(1280,900); await abrir(p);
  const e=await txt(p,'#emptyState');
  log(/Cadastre seu primeiro investimento/.test(e) && /Informe o ativo, a quantidade e o preço pago/.test(e),'primeira entrada: orientação direta para cadastrar o primeiro investimento');
  log(!/destravar/i.test(e) && !/Sleep Score/i.test(e) && !/independência financeira/i.test(e) && !/garant/i.test(e),'sem promessa de benefícios (projeções, Sleep Score, independência) ao adicionar um ativo');
  log(await vis(p,'#emptyAddBtn') && !await vis(p,'#addBtn') && !await vis(p,'#refreshBtn') && !await vis(p,'.lead-actions'),'visão geral vazia: uma única ação (no estado vazio); cabeçalho sem "Adicionar ativo", sem "Atualizar cotações" e sem barra vazia');
  log(!await vis(p,'#overviewPositions'),'seção "Suas posições" vazia não ocupa espaço');
  // o glossário indicado existe de verdade e o link leva até ele
  const link=p.locator('#emptyState a[data-page=simulators]'); log(await link.count()===1 && /glossário, no fim da página Simuladores/.test(await link.textContent()),'referência ao glossário diz onde ele está');
  await link.click(); await p.waitForTimeout(250);
  log(await p.evaluate(()=>location.hash)==='#simuladores' && await vis(p,'#hGloss') && await p.locator('#tips details').count()>=5,'o link abre Simuladores, onde o glossário existe');
  await ir(p,'holdings');
  log(await p.locator('#assetList button').count()===1 && /Adicionar primeiro ativo/.test(await txt(p,'#assetList')) && !await vis(p,'#addBtn'),'Minha carteira vazia: uma única ação');
  await p.click('#assetList button'); await p.waitForSelector('.sheet'); log(/O que você quer adicionar/.test(await txt(p,'.sheet')),'a ação abre o fluxo de adicionar ativo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await ir(p,'income'); log(!await vis(p,'#refreshBtn'),'proventos estimados sem ativos: sem "Atualizar cotações"');
  log(p._errs.length===0,'sem erros JS (vazio) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- carteira preenchida: ações por página ---------- */
await ctl('seed=1&logged=1&empty=0&reset=1');
{ const {cx,p}=await novo(1280,900); await abrir(p);
  const estado=async()=>({ add:await vis(p,'#addBtn'), refresh:await vis(p,'#refreshBtn'), barra:await vis(p,'.lead-actions') });
  const casos=[['overview',null,{add:true,refresh:true,barra:true}],['holdings',null,{add:true,refresh:true,barra:true}],['income','#incTabEst',{add:false,refresh:true,barra:true}],
    ['income','#incTabRec',{add:false,refresh:false,barra:false}],['goals',null,{add:false,refresh:false,barra:false}],['simulators',null,{add:false,refresh:false,barra:false}]];
  for (const [pg,aba,esp] of casos){ await ir(p,pg); if(aba){ await p.click(aba); await p.waitForTimeout(120); } const r=await estado();
    log(JSON.stringify(r)===JSON.stringify(esp),`ações do cabeçalho em ${pg}${aba?' '+aba:''}: ${JSON.stringify(r)}`); }
  await ir(p,'goals'); log(/carteira atual/.test(await txt(p,'#pg-goals .fin-lead')),'Metas indica que os cálculos usam a carteira atual');
  await ir(p,'simulators'); log(/usando sua carteira atual/.test(await txt(p,'#pg-simulators .info-banner')),'Simuladores indica que usam a carteira atual');
  // seções expansíveis: recolhidas por padrão, teclado e foco
  for (const [pg,aba,id] of [['income','#incTabRec','recMore'],['goals',null,'goalsMore'],['goals',null,'resMore'],['simulators',null,'indepMore']]){
    await ir(p,pg); if(aba){ await p.click(aba); await p.waitForTimeout(100); }
    const fechada=await p.evaluate(i=>!document.getElementById(i).open,id);
    await p.focus(`#${id} summary`);
    const foco=await p.evaluate(()=>{ const s=getComputedStyle(document.activeElement); return { w:parseFloat(s.outlineWidth), st:s.outlineStyle, h:document.activeElement.getBoundingClientRect().height }; });
    await p.keyboard.press('Enter'); const aberta=await p.evaluate(i=>document.getElementById(i).open,id);
    await p.keyboard.press('Enter'); const volta=await p.evaluate(i=>!document.getElementById(i).open,id);
    log(fechada && aberta && volta && foco.h>=44,`#${id}: recolhida, abre/fecha por Enter, resumo ≥ 44 px (${Math.round(foco.h)})`);
  }
  log(p._errs.length===0,'sem erros JS (preenchido) '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- celular ---------- */
for (const scheme of ['light','dark']){
  const {cx,p}=await novo(390,844,scheme); await abrir(p);
  const m=await p.evaluate(()=>{ const r=(s)=>document.querySelector(s).getBoundingClientRect(); const nav=[...document.querySelectorAll('.mainnav .navitem')];
    return { navH:Math.round(r('.mainnav').height), cols:getComputedStyle(document.querySelector('.mainnav')).gridTemplateColumns.split(' ').length,
      crumb:getComputedStyle(document.getElementById('crumb').parentElement).display, sub:getComputedStyle(document.getElementById('pageSubtitle')).display,
      trunc:nav.filter(a=>a.scrollWidth>a.clientWidth+1).length, alvos:nav.every(a=>a.getBoundingClientRect().height>=44),
      tools:[...document.querySelectorAll('.tools button')].map(b=>Math.round(b.getBoundingClientRect().height)), toolsLinhas:new Set([...document.querySelectorAll('.tools button')].map(b=>Math.round(b.getBoundingClientRect().top))).size,
      tituloTopo:Math.round(r('#pageTitle').top), sw:document.documentElement.scrollWidth }; });
  log(m.cols===5 && m.navH<=60 && m.trunc===0 && m.alvos,`${scheme} 390px: navegação em uma linha (${m.navH}px, ${m.cols} colunas), sem texto cortado, alvos ≥ 44 px`);
  log(m.crumb==='none' && m.sub==='none' && m.toolsLinhas===1 && m.tools.every(h=>h>=44),`${scheme} 390px: sem trilha/subtítulo redundantes; ferramentas numa linha com alvos ≥ 44 px (${m.tools})`);
  log(m.tituloTopo<=190,`${scheme} 390px: título começa a ${m.tituloTopo}px do topo`);
  for (const pg of ['goals','simulators','income','overview','holdings']){ await ir(p,pg);
    const q=await p.evaluate(()=>({ sw:document.documentElement.scrollWidth, iw:innerWidth, topo:Math.round(document.querySelector('.page:not([hidden])').getBoundingClientRect().top),
      acoes:(()=>{ const b=document.querySelector('.lead-actions'); return !!b && b.offsetParent!==null; })() }));
    // com a barra de ações úteis (uma linha de 44 px) o conteúdo começa um pouco mais abaixo
    const limite=q.acoes?290:235;
    log(q.sw<=q.iw+1 && q.topo<=limite,`${scheme} 390px ${pg}: sem rolagem horizontal; conteúdo começa a ${q.topo}px (limite ${limite}px${q.acoes?', com ações úteis':''})`); }
  log(p._errs.length===0,`${scheme} 390px sem erros JS`); await cx.close();
}
{ const {cx,p}=await novo(320,640); await abrir(p);
  const m=await p.evaluate(()=>{ const nav=[...document.querySelectorAll('.mainnav .navitem')]; return { cols:getComputedStyle(document.querySelector('.mainnav')).gridTemplateColumns.split(' ').length, trunc:nav.filter(a=>a.scrollWidth>a.clientWidth+1).length, sw:document.documentElement.scrollWidth }; });
  log(m.cols===3 && m.trunc===0 && m.sw<=320,`320px: navegação em 3 colunas, sem corte nem rolagem horizontal (${JSON.stringify(m)})`); await cx.close(); }
await br.close(); srv.kill();
process.exit(fails?1:0);
