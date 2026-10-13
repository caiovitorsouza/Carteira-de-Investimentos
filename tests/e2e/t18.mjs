// Apresentação antes do login (dados fictícios, servidor de teste).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9050+Math.floor(Math.random()*40), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const externos=[];
const novo=async(w,h,opt={})=>{ const cx=await br.newContext({viewport:{width:w,height:h},colorScheme:opt.scheme||'light',reducedMotion:opt.reduced||'no-preference'});
  await cx.route(u=>!u.href.startsWith(B), r=>{ externos.push(r.request().url()); return r.abort(); });
  // registra se a apresentação chegou a ficar visível em algum quadro (para quem já está autenticado)
  await cx.addInitScript(()=>{ window.__viuIntro=false; const t0=performance.now();
    const olhar=()=>{ const a=document.getElementById('auth'); if (a && !a.classList.contains('hide') && getComputedStyle(a).visibility==='visible' && a.getBoundingClientRect().height>0) window.__viuIntro=true;
      if (performance.now()-t0<12000) requestAnimationFrame(olhar); };
    requestAnimationFrame(olhar); });
  const p=await cx.newPage(); p._errs=[]; p.on('pageerror',e=>p._errs.push(e.message)); return {cx,p}; };
const visivelNaPrimeiraTela=(p,sel)=>p.evaluate(s=>{ const r=document.querySelector(s).getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight && r.width>0; },sel);

/* ---------- quem já está autenticado vai direto à Visão geral ---------- */
for (const atraso of [0,800,4000]){
  await ctl(`seed=1&logged=1&empty=0&reset=1&delay=${atraso}`);
  const {cx,p}=await novo(1440,900); await p.goto(B); await p.waitForSelector('#app:not(.hide)',{timeout:15000}); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({viu:window.__viuIntro, hash:location.hash, auth:document.getElementById('auth').classList.contains('hide'), t:document.getElementById('pageTitle').textContent}));
  log(!r.viu && r.auth && r.t==='Visão geral',`autenticado (resposta em ${atraso} ms): abre a Visão geral sem mostrar a apresentação ${JSON.stringify(r)}`);
  await cx.close();
}
await ctl('delay=0');

// Falha de rede/servidor não pode ser confundida com sessão ausente.
await ctl('seed=1&logged=1&failAuth=1');
{ const {cx,p}=await novo(390,844); await p.goto(B);
  await p.waitForSelector('#sessionRetry:not([hidden])');
  log(!await p.evaluate(()=>window.__viuIntro) && /Não foi possível conferir/.test(await p.textContent('#sessionCheck')),
    'falha na sessão: tela neutra com retry, sem apresentação nem carteira presumida');
  await ctl('failAuth=0'); await p.click('#sessionRetry'); await p.waitForSelector('#app:not(.hide)');
  log(!await p.evaluate(()=>window.__viuIntro) && !await p.isVisible('#sessionCheck'), 'retry confirma sessão e abre carteira sem apresentação');
  await cx.close(); }

/* ---------- conteúdo, entrada sempre à mão, textos e honestidade ---------- */
await ctl('seed=1&logged=0&reset=1');
{ const {cx,p}=await novo(1440,900); await p.goto(B); await p.waitForSelector('#authWelcome'); await p.waitForTimeout(400);
  log(await visivelNaPrimeiraTela(p,'#startLogin') && await visivelNaPrimeiraTela(p,'#startRegister') && await visivelNaPrimeiraTela(p,'#welcomeTitle'),'Entrar e Criar conta visíveis desde a primeira tela');
  const c=await p.evaluate(()=>({ h:[...document.querySelectorAll('#authWelcome h1, #authWelcome h2')].map(e=>e.textContent), cap:[...document.querySelectorAll('#authWelcome figcaption')].map(e=>e.textContent),
    figs:[...document.querySelectorAll('#authWelcome figure')].map(f=>f.getAttribute('role')+'|'+f.getAttribute('aria-label')), txt:document.getElementById('auth').innerText }));
  log(c.h.join('|')==='Sua carteira, com mais clareza.|Acompanhe seus investimentos e proventos.|Organize seus próximos passos.','três etapas com os títulos pedidos');
  log(c.cap.length===3 && c.cap.every(x=>x==='Exemplo com dados fictícios') && c.figs.every(f=>/^img\|Ilustração .*dados fictícios$/.test(f)),'ilustrações identificadas como dados fictícios (também para leitor de tela)');
  log(!/regulament|depoiment|certificad|garantid|aprovad[oa] pel|clientes satisfeitos|rendeu|lucro de|retorno de \d/i.test(c.txt),'sem depoimentos, credenciais, regulamentação ou resultados inventados');
  // rolagem nativa: a roda do mouse rola a página normalmente
  await p.mouse.move(700,450); await p.mouse.wheel(0,900); await p.waitForTimeout(400);
  const y=await p.evaluate(()=>scrollY);
  log(y>=350 && await p.evaluate(()=>getComputedStyle(document.documentElement).overflowY!=='hidden' && getComputedStyle(document.body).overflowY!=='hidden'),`rolagem nativa (rolou ${y}px)`);
  // revelação e parallax só com movimento permitido e tela larga
  await p.evaluate(()=>document.getElementById('introT3').scrollIntoView({block:'center'})); await p.waitForTimeout(900);
  const m=await p.evaluate(()=>({ op:[...document.querySelectorAll('#authWelcome .intro-step')].map(s=>getComputedStyle(s).opacity), tf:[...document.querySelectorAll('.intro-visual')].map(v=>v.style.transform) }));
  log(m.op.every(o=>o==='1') && m.tf.some(t=>/translate3d/.test(t)),'computador: etapas reveladas ao rolar e ilustrações com movimento leve '+JSON.stringify(m));
  // fim da página: entrar e voltar devolve o foco
  await p.click('#startLogin2'); await p.waitForTimeout(200);
  log(await p.isVisible('#authForm') && !await p.isVisible('#authWelcome') && await p.evaluate(()=>scrollY===0 && document.activeElement.id==='authTitle'),'Entrar no fim da apresentação abre o formulário no topo, com foco no título');
  await p.click('#authBack'); await p.waitForTimeout(200);
  log(await p.evaluate(()=>document.activeElement.id)==='startLogin2','Voltar devolve o foco ao botão usado');
  await p.click('#startRegister2'); await p.waitForTimeout(150);
  log(/Criar sua conta/.test(await p.textContent('#authTitle')),'Criar conta abre o cadastro (regras de acesso atuais preservadas)');
  log(p._errs.length===0,'sem erros JS '+JSON.stringify(p._errs)); await cx.close(); }

/* ---------- teclado ---------- */
{ const {cx,p}=await novo(1440,900); await p.goto(B); await p.waitForSelector('#authWelcome'); await p.waitForTimeout(300);
  const ordem=[]; for (let i=0;i<4;i++){ await p.keyboard.press('Tab'); ordem.push(await p.evaluate(()=>document.activeElement.id||document.activeElement.className)); }
  log(ordem.includes('startLogin') && ordem.indexOf('startLogin')<=2,'teclado: Entrar está entre os primeiros itens da ordem de foco '+ordem.join(' → '));
  await p.focus('#startLogin'); log(await p.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth))>=2,'foco visível no botão');
  await cx.close(); }

/* ---------- movimento reduzido e celular ---------- */
{ const {cx,p}=await novo(1440,900,{reduced:'reduce'}); await p.goto(B); await p.waitForSelector('#authWelcome'); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({ op:[...document.querySelectorAll('#authWelcome .intro-step')].map(s=>getComputedStyle(s).opacity), anim:document.getElementById('authWelcome').classList.contains('intro-anim') }));
  await p.mouse.wheel(0,800); await p.waitForTimeout(300);
  const tf=await p.evaluate(()=>[...document.querySelectorAll('.intro-visual')].map(v=>v.style.transform));
  log(r.op.every(o=>o==='1') && !r.anim && tf.every(t=>t===''),'movimento reduzido: todo o conteúdo visível sem animação nem parallax '+JSON.stringify({...r,tf}));
  await cx.close(); }
for (const w of [320,390,768]) for (const scheme of ['light','dark']){
  const {cx,p}=await novo(w,w===768?1024:700,{scheme}); await p.goto(B); await p.waitForSelector('#authWelcome'); await p.waitForTimeout(300);
  const ini=await visivelNaPrimeiraTela(p,'#startLogin');
  await p.evaluate(async()=>{ for (let y=0;y<=document.documentElement.scrollHeight;y+=250){ scrollTo(0,y); await new Promise(r=>setTimeout(r,40)); } });
  await p.waitForTimeout(500);
  const m=await p.evaluate(()=>({ sw:document.documentElement.scrollWidth, iw:innerWidth,
    fora:[...document.querySelectorAll('#auth *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+0.5 && !e.closest('.sr-only'); }).length,
    tf:[...document.querySelectorAll('.intro-visual')].every(v=>v.style.transform===''), alvos:Math.min(...[...document.querySelectorAll('#authWelcome button')].map(b=>b.getBoundingClientRect().height)) }));
  log(ini && m.sw<=m.iw && m.fora===0 && m.tf && m.alvos>=44,`${w}px ${scheme}: Entrar na primeira tela, sem rolagem horizontal, sem parallax, botões ≥ 44 px ${JSON.stringify(m)}`);
  if (p._errs.length) log(false,'erros JS '+JSON.stringify(p._errs));
  await cx.close();
}
log(externos.length===0,'nenhum pedido a servidores externos '+JSON.stringify(externos.slice(0,3)));
await br.close(); srv.kill();
process.exit(fails?1:0);
