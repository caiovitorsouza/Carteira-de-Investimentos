// Rolagem até o fim: a página não passa do último conteúdo e não tem efeito elástico.
const { chromium, devices } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
const PORT=9100+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn('node',[new URL('./server.mjs', import.meta.url).pathname],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
await ctl('seed=1&logged=1');
const br=await chromium.launch();
const LIMITE=48; // margem inferior do conteúdo (40px) + folga
for (const [nome,cfg] of [['desktop 1440×900',{viewport:{width:1440,height:900}}],['iPad Pro 11 horizontal',devices['iPad Pro 11 landscape']],
  ['iPad Pro 11 vertical',devices['iPad Pro 11']],['iPhone 13',devices['iPhone 13']],['320px',{viewport:{width:320,height:640}}]]){
  const ctx=await br.newContext(cfg); const pg=await ctx.newPage(); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(250);
  const ob=await pg.evaluate(()=>[getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]);
  log(ob[0]==='none' && ob[1]==='none', `${nome}: efeito elástico desligado (html ${ob[0]}, body ${ob[1]})`);
  for (const p of ['overview','holdings','income','simulators']){
    await pg.evaluate(p=>document.querySelector(`.mainnav a[data-page=${p}]`).click(),p); await pg.waitForTimeout(100);
    // tenta rolar muito além do fim
    await pg.mouse.move(Math.min(600,(pg.viewportSize().width)-20),300);
    for (let i=0;i<6;i++){ await pg.mouse.wheel(0,3000); }
    await pg.evaluate(()=>window.scrollBy(0,99999)); await pg.waitForTimeout(150);
    const r=await pg.evaluate(()=>{
      const vh=innerHeight, maxScroll=document.documentElement.scrollHeight-vh;
      const panel=document.querySelector('[data-panel]:not([hidden])');
      let last=0; for (const el of panel.querySelectorAll('*')){ if(el.closest('details:not([open])') && !el.matches('summary') && !el.closest('summary')) continue; const b=el.getBoundingClientRect(); if(b.height>0 && b.width>0) last=Math.max(last,b.bottom); }
      return {scrollY:Math.round(scrollY), maxScroll, vazio:Math.round(vh-last), vh};
    });
    if (r.maxScroll<=0) log(r.scrollY===0, `${nome} · ${p}: a página cabe na tela; não rola (rolagem ${r.scrollY}/0)`);
    else log(r.scrollY<=r.maxScroll && r.vazio>=0 && r.vazio<=LIMITE, `${nome} · ${p}: no fim, ${r.vazio}px vazios abaixo do último conteúdo (limite ${LIMITE}); rolagem ${r.scrollY}/${r.maxScroll}`);
  }
  await ctx.close();
}
await br.close(); srv.kill();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS PASSARAM'); process.exit(fails?1:0);
