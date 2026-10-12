// Navegação: lateral fixa na altura da janela, sem numeração, botão "Adicionar ativo" por página.
const pw = await import(process.env.PW_MODULE || 'playwright');
const { chromium, devices } = pw;
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9000+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
await ctl('seed=1&logged=1');
const br=await chromium.launch();
const side = (pg)=>pg.evaluate(()=>{const s=document.querySelector('.sidebar'); const r=s.getBoundingClientRect(); const m=document.querySelector('.main').getBoundingClientRect();
  return {top:Math.round(r.top), bottom:Math.round(r.bottom), right:Math.round(r.right), vh:innerHeight, scrollY:Math.round(scrollY), mainLeft:Math.round(m.left), own:s.scrollHeight>s.clientHeight, ov:getComputedStyle(s).overflowY};});

// 1) Desktop e iPad horizontal: lateral fixa durante a rolagem, altura total, sem cobrir o conteúdo
const cfgs=[['desktop 1440×900',{viewport:{width:1440,height:900}}],['desktop 1280×720',{viewport:{width:1280,height:720}}],
  ['iPad Pro 11 horizontal',devices['iPad Pro 11 landscape']],['iPad (gen 7) horizontal',devices['iPad (gen 7) landscape']]];
for (const [nome,cfg] of cfgs){
  const ctx=await br.newContext(cfg); const pg=await ctx.newPage(); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(250);
  for (const page of ['overview','holdings','income','simulators']){
    await pg.evaluate(p=>{document.querySelector(`.mainnav a[data-page=${p}]`).click();},page); await pg.waitForTimeout(80);
    const docH=await pg.evaluate(()=>document.documentElement.scrollHeight);
    await pg.evaluate(()=>window.scrollTo(0, document.documentElement.scrollHeight)); await pg.waitForTimeout(120);
    const s=await side(pg);
    log(s.top===0 && s.bottom===s.vh && s.mainLeft>=s.right, `${nome} · ${page}: rolou ${s.scrollY}px de ${docH}; lateral top ${s.top}, base ${s.bottom}/${s.vh}, conteúdo começa em ${s.mainLeft}≥${s.right}`);
  }
  // Simula a barra do Safari encolhendo/crescendo (muda a altura visível)
  const vp=pg.viewportSize();
  for (const h of [vp.height-70, vp.height+0]){ await pg.setViewportSize({width:vp.width,height:h}); await pg.waitForTimeout(120);
    const s=await side(pg); log(s.top===0 && s.bottom===h, `${nome}: altura da janela ${h}px → lateral ocupa ${s.top}–${s.bottom}`); }
  log(!(await side(pg)).own, `${nome}: lateral sem rolagem própria quando os itens cabem`);
  await ctx.close();
}

// 2) Janela baixa: a lateral ganha rolagem própria só porque os itens não cabem; a página continua rolando
{ const pg=await br.newPage({viewport:{width:1280,height:300}}); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)');
  const s=await side(pg);
  await pg.mouse.move(700,200); await pg.mouse.wheel(0,800); await pg.waitForTimeout(150);
  const s2=await side(pg);
  log(s.own && s.ov==='auto' && s2.scrollY>0 && s2.top===0, `janela de 300px: lateral rola sozinha (${s.own}), conteúdo rola (${s2.scrollY}px), lateral fixa (${s2.top})`);
  await pg.close(); }

// 3) Sem numeração, rótulos alinhados, destaque e foco de teclado
{ const pg=await br.newPage({viewport:{width:1440,height:900}}); await pg.goto(B+'/#carteira'); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
  const nav=await pg.evaluate(()=>[...document.querySelectorAll('.mainnav .navitem')].map(a=>({t:a.textContent.trim(), x:Math.round(a.firstChild.nodeType===3? (()=>{const r=document.createRange(); r.selectNodeContents(a); return r.getBoundingClientRect().left;})() : 0)})));
  log(nav.every(n=>!/\d/.test(n.t)) && nav.map(n=>n.t).join('|')==='Visão geral|Minha carteira|Proventos|Metas|Simuladores','sem números: '+nav.map(n=>n.t).join(' | '));
  log(new Set(nav.map(n=>n.x)).size===1, 'rótulos alinhados à mesma margem: x='+[...new Set(nav.map(n=>n.x))].join(','));
  log(await pg.evaluate(()=>document.querySelector('.mainnav [aria-current=page]').dataset.page)==='holdings' && await pg.evaluate(()=>location.hash)==='#carteira','destaque da aba ativa e endereço preservados');
  await pg.focus('.mainnav a[data-page=income]'); await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab');
  const foco=await pg.evaluate(()=>{const a=document.activeElement; const cs=getComputedStyle(a); return {pg:a.dataset.page, ow:cs.outlineWidth, os:cs.outlineStyle};});
  log(foco.pg==='income' && foco.os!=='none' && parseFloat(foco.ow)>=2, 'foco de teclado visível na aba ('+foco.ow+' '+foco.os+')');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  log(await pg.evaluate(()=>location.hash)==='#proventos','Enter na aba navega para #proventos');
  await pg.close(); }

// 4) Botão "Adicionar ativo" por página (desktop e celular), sem espaço vazio
for (const [nome,cfg] of [['desktop',{viewport:{width:1440,height:900}}],['iPhone 13',devices['iPhone 13']],['320px',{viewport:{width:320,height:700}}]]){
  const ctx=await br.newContext(cfg); const pg=await ctx.newPage(); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
  for (const [page,deve] of [['overview',true],['holdings',true],['income',false],['simulators',false]]){
    await pg.evaluate(p=>{document.querySelector(`.mainnav a[data-page=${p}]`).click();},page); await pg.waitForTimeout(80);
    const st=await pg.evaluate(()=>{const a=document.getElementById('addBtn'), r=document.getElementById('refreshBtn'), la=document.querySelector('.lead-actions');
      const ar=a.getBoundingClientRect(), rr=r.getBoundingClientRect(), lr=la.getBoundingClientRect();
      return {vis:a.offsetParent!==null && ar.width>0, gapRight:Math.round(lr.right-rr.right), refreshW:Math.round(rr.width), laW:Math.round(lr.width)};});
    const semVazio = deve ? true : (st.gapRight<=1);
    log(st.vis===deve && semVazio, `${nome} · ${page}: Adicionar ${st.vis?'visível':'oculto'} (esperado ${deve?'visível':'oculto'}); fim do cabeçalho sem vão (${st.gapRight}px)`);
  }
  await ctx.close();
}
// botão funciona nas duas páginas
for (const page of ['overview','holdings']){
  const pg=await br.newPage({viewport:{width:1280,height:900}}); await pg.goto(B+(page==='holdings'?'/#carteira':'')); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
  await pg.click('#addBtn'); await pg.waitForSelector('.sheet[role=dialog]');
  log(/O que você quer adicionar/.test(await pg.textContent('.sheet')), `${page}: Adicionar ativo abre o painel`);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(350);
  log(await pg.evaluate(()=>document.activeElement.id)==='addBtn', `${page}: foco volta ao botão`);
  await pg.close();
}

// 5) Celular: navegação compacta, sem números, sem rolagem horizontal
for (const [nome,cfg] of [['iPhone 13',devices['iPhone 13']],['320px',{viewport:{width:320,height:700}}],['iPad Pro 11 vertical',devices['iPad Pro 11']]]){
  const ctx=await br.newContext(cfg); const pg=await ctx.newPage(); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(200);
  const r=await pg.evaluate(()=>{const n=[...document.querySelectorAll('.mainnav .navitem')]; return {txt:n.map(a=>a.textContent.trim()), trunc:n.filter(a=>a.scrollWidth>a.clientWidth+1).length, ov:document.documentElement.scrollWidth-innerWidth, sticky:getComputedStyle(document.querySelector('.sidebar')).position, minH:Math.min(...n.map(a=>a.getBoundingClientRect().height))};});
  log(r.txt.every(t=>!/\d/.test(t)) && r.trunc===0 && r.ov===0 && r.sticky==='static' && r.minH>=44, `${nome}: navegação compacta (${r.txt.join(' | ')}), sem corte, sem rolagem horizontal, alvos ≥44px (${Math.round(r.minH)})`);
  await ctx.close();
}
await br.close(); srv.kill();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS PASSARAM'); process.exit(fails?1:0);
