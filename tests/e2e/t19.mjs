// Refinamento visual: matriz de larguras/temas, sem dados reais nem escritas de carteira.
const {chromium}=await import(process.env.PW_MODULE||'playwright');
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const PORT=9400+Math.floor(Math.random()*70), B='http://127.0.0.1:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'});
process.on('exit',()=>srv.kill());
await new Promise(r=>setTimeout(r,700));
const ctl=q=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const br=await chromium.launch();let fails=0;const external=[];
const log=(ok,msg)=>{if(!ok)fails++;console.log((ok?'PASS ':'FAIL ')+msg);};
const wish='00000000-0000-4000-8000-0000000000a1';
const path='output/playwright/refino-2026-10-13';fs.mkdirSync(path,{recursive:true});
async function fits(p,selector){return p.evaluate(s=>{
 const root=document.querySelector(s),vis=[root,...root.querySelectorAll('*')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],.sr-only'));
 const outside=vis.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<-.6||r.right>innerWidth+.6)&&getComputedStyle(e).position!=='absolute';});
 return {sw:document.documentElement.scrollWidth,iw:innerWidth,outside:outside.map(e=>e.tagName+'.'+e.className).slice(0,6)};
},selector);}
try{
for(const w of [320,390,768,1440])for(const scheme of ['light','dark']){
 const tag=w+'px '+scheme;
 await ctl('seed=1&logged=1&recs=1&wl=1');
 const cx=await br.newContext({viewport:{width:w,height:w===768?1024:900},colorScheme:scheme,hasTouch:w<=768});
 await cx.route(u=>!u.href.startsWith(B),r=>{external.push(r.request().url());return r.abort();});
 const p=await cx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(B+'/#carteira');await p.waitForSelector('#app:not(.hide)');await p.waitForTimeout(450);
 let m=await fits(p,'#pg-holdings');log(m.sw===w&&!m.outside.length,tag+' carteira cabe '+JSON.stringify(m));
 log(await p.locator('#assetList tr.pos-row').count()===7 && await p.locator('.grp-btn').count()===0,tag+' tabela única completa, detalhes fechados');
 for(const [k,n] of [['acao',1],['fii',5],['rf',1]]){await p.click('#hClasses [data-class='+k+']');log(await p.locator('#assetList tr.pos-row').count()===n,tag+' filtro '+k);}
 await p.click('#hClasses [data-class=""]');
 await p.screenshot({path:path+'/carteira-'+w+'-'+scheme+'.png'});
 if(w<=768){
  await p.tap('#menuBtn');await p.waitForTimeout(260);
  log(await p.evaluate(()=>document.getElementById('mainContent').inert&&!document.getElementById('sidebar').inert),tag+' menu por toque, inert correto');
  await p.keyboard.press('Escape');await p.waitForTimeout(260);
  log(await p.evaluate(()=>!document.getElementById('mainContent').inert&&document.getElementById('sidebar').inert&&document.activeElement.id==='menuBtn'),tag+' Escape devolve foco e torna menu inerte');
 }else{
  const x=(await p.locator('.main').boundingBox()).x;
  await p.hover('#sidebar');await p.waitForTimeout(230);
  log(await p.evaluate(()=>document.getElementById('sidebar').getBoundingClientRect().width===224)&&(await p.locator('.main').boundingBox()).x===x&&x<=80,tag+' hover expande por cima, sem deslocar o conteúdo e sem faixa vazia (conteúdo a partir de '+x+'px)');
  await p.screenshot({path:path+'/sidebar-expandida-'+scheme+'.png'});
  await p.mouse.move(w-40,300);await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed')),tag+' sair com o cursor recolhe após pequeno atraso');
  await p.click('#hClasses [data-class=fii]');
  log(await p.locator('#assetList tr.pos-row').count()===5,tag+' com a lateral recolhida, os controles da página respondem');
  await p.click('#hClasses [data-class=""]');
  await p.focus('.mainnav a[data-page=watch]');await p.mouse.move(900,80);await p.waitForTimeout(400);
  log(await p.evaluate(()=>!document.getElementById('shell').classList.contains('side-collapsed')),tag+' foco mantém expansão');
  await p.focus('#hSearch');await p.waitForTimeout(400);
  log(await p.evaluate(()=>document.getElementById('shell').classList.contains('side-collapsed')),tag+' sair com teclado recolhe');
 }
 await p.goto(B+'/#interesse');await p.waitForTimeout(400);
 log(await p.locator('.wl-card').count()===2 && await p.locator('#watchTabFollow').getAttribute('aria-selected')==='true',tag+' só lista Quero acompanhar');
 await p.focus('#watchTabFollow');await p.keyboard.press('ArrowRight');
 log(await p.locator('#watchTabBuy').getAttribute('aria-selected')==='true'&&await p.locator('.wl-card').count()===2,tag+' abas por teclado, só Planejo comprar');
 log(/2\.020,00/.test(await p.textContent('.wl-total')),tag+' total planejado valor + quantidade sem duplicação');
 await p.click('#wlo-'+wish);await p.keyboard.press('Escape');
 log(await p.evaluate(i=>!document.getElementById('wlmenu-'+i).open&&document.activeElement.id==='wlo-'+i,wish),tag+' ações secundárias: Escape e foco');
 const before=await ctl('watch=1&puts=1');
 await p.click('#wls-'+wish);const sim=w>=1200?'#watchPreview':'.sheet';
 await p.waitForSelector(sim);await p.waitForTimeout(250);
 const simText=(await p.locator(sim).innerText()).replace(/\s+/g,' ');
 log(/Quantidade 97 unidades/.test(simText)&&/Aporte usado R\$ 994,25/.test(simText)&&/Saldo restante R\$ 5,75/.test(simText),tag+' simulação preserva unidades e saldo');
 m=await fits(p,sim);log(m.sw===w&&!m.outside.length,tag+' simulação cabe '+JSON.stringify(m));
 await p.screenshot({path:path+'/lista-simulacao-'+w+'-'+scheme+'.png'});
 await p.locator(sim+' input').fill('');await p.locator(sim+' input').pressSequentially('200000');
 if(w>=1200){await p.waitForTimeout(150);log(/195 unidades/.test(await p.textContent(sim)),tag+' painel editável recalcula');}
 await p.keyboard.press('Escape');await p.waitForTimeout(350);
 const after=await ctl('watch=1&puts=1');
 log(after.saves===before.saves&&after.watchLog.length===before.watchLog.length,tag+' simulação não escreve carteira nem lista');
 await p.goto(B+'/#proventos');await p.waitForTimeout(400);
 await p.click('#cald-15');
 log(await p.locator('#cald-15').getAttribute('aria-pressed')==='true' && /15 de/.test(await p.textContent('#calDayTitle')) && await p.locator('#calDay .cal-ev').count()===2,tag+' seleção destaca só os eventos do dia');
 m=await fits(p,'#pg-income');log(m.sw===w&&!m.outside.length,tag+' calendário cabe '+JSON.stringify(m));
 const day=await p.locator('#cald-15').boundingBox();log(day.width>=32&&day.height>=44&&(w!==320||day.width>=100),tag+' alvos do calendário preservados');
 await p.screenshot({path:path+'/calendario-'+w+'-'+scheme+'.png'});
 await p.click('.cal-explanation summary');log(/não viram|nenhum deles vira/.test(await p.textContent('.cal-explanation')),tag+' explicação acessível sob demanda');
 await ctl('logged=0');await p.goto(B+'/');await p.reload();await p.waitForSelector('#auth:not(.hide)');await p.waitForTimeout(300);
 m=await fits(p,'#auth');log(m.sw===w&&!m.outside.length,tag+' apresentação cabe '+JSON.stringify(m));
 const old=await p.evaluate(()=>[...document.querySelectorAll('.intro-text,.intro-visual')].map(e=>e.style.transform));
 await p.mouse.wheel(0,500);await p.waitForTimeout(350);
 const motion=await p.evaluate(()=>({y:scrollY,transforms:[...document.querySelectorAll('.intro-text,.intro-visual')].map(e=>e.style.transform),cta:['startLogin','startRegister'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})}));
 log(motion.y>0&&motion.cta,tag+' rolagem nativa, acesso permanente');
 log(w>900?motion.transforms.some((t,i)=>t!==old[i]):motion.transforms.every(t=>!t),tag+' camadas coordenadas ou simplificação móvel');
 await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);await p.screenshot({path:path+'/apresentacao-'+w+'-'+scheme+'.png',fullPage:true});
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(180);
 log(await p.evaluate(()=>[...document.querySelectorAll('.intro-text,.intro-visual')].every(e=>e.style.transform==='')&&[...document.querySelectorAll('.intro-step')].every(e=>getComputedStyle(e).opacity==='1')),tag+' movimento reduzido: todas as etapas estáticas e visíveis');
 log(errors.length===0,tag+' sem erros JavaScript '+JSON.stringify(errors));await cx.close();
}
// Excluir o último item deve encerrar a prévia e liberar a lista inteira.
await ctl('seed=1&logged=1&wl=1');
const rows=(await ctl('watch=1')).watch;
for(const row of rows.filter(x=>x.id!==wish))await fetch(B+'/api/watchlist/'+row.id,{method:'DELETE'});
{
 const cx=await br.newContext({viewport:{width:1440,height:900}});
 await cx.route(u=>!u.href.startsWith(B),r=>r.abort());
 const p=await cx.newPage();await p.goto(B+'/#interesse');await p.waitForSelector('#app:not(.hide)');await p.waitForTimeout(500);
 await p.click('#watchTabBuy');await p.click('#wls-'+wish);
 log(await p.isVisible('#watchPreview'),'último item: prévia presente antes de excluir');
 await p.keyboard.press('Escape');await p.waitForTimeout(250);
 log(!await p.isVisible('#watchPreview'),'Escape mantém prévia fechada');
 await p.click('#wls-'+wish);await p.click('#wlo-'+wish);await p.click('#wle-'+wish);
 await p.locator('.sheet').getByRole('button',{name:'Excluir',exact:true}).click();
 await p.getByRole('button',{name:'Remover dos planos',exact:true}).click();await p.waitForTimeout(450);
 log(await p.locator('.wl-card').count()===0&&!await p.isVisible('#watchPreview')&&await p.locator('#watchPreview input').count()===0,'excluir último item remove cartões, prévia e premissas antigas');
 const dims=await p.evaluate(()=>({body:document.getElementById('watchBody').getBoundingClientRect().width,layout:document.querySelector('.wl-layout').getBoundingClientRect().width}));
 log(Math.abs(dims.body-dims.layout)<1,'estado vazio usa a largura disponível');
 await cx.close();
}
log(external.length===0,'nenhuma requisição externa '+JSON.stringify(external.slice(0,3)));
}finally{await br.close();srv.kill();}
process.exitCode=fails?1:0;
