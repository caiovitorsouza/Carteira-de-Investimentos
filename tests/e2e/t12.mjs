// Regressão: o foco inicial do painel não pode roubar o foco de um campo já escolhido, nem disparar
// depois que o painel fecha. Reproduz a corrida de forma determinística: o campo é focado no mesmo
// instante em que o painel abre, antes de o temporizador de 60 ms disparar.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9400+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
await ctl('seed=1&logged=1');
const br=await chromium.launch(); const pg=await (await br.newContext({viewport:{width:1280,height:900}})).newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
// registra temporizadores de 60 ms e quais foram cancelados
await pg.addInitScript(()=>{ const st=window.setTimeout.bind(window), ct=window.clearTimeout.bind(window); window.__t60=[]; window.__cleared=new Set();
  window.setTimeout=(fn,ms,...a)=>{ const id=st(fn,ms,...a); if(ms===60) window.__t60.push(id); return id; };
  window.clearTimeout=(id)=>{ window.__cleared.add(id); return ct(id); }; });
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(400);
await pg.click('.mainnav a[data-page=income]'); await pg.click('#incTabRec'); await pg.waitForTimeout(250);

// o painel abre e, no MESMO instante, o foco vai para o campo escolhido (antes dos 60 ms)
const abrirEFocar=(rotulo)=>pg.evaluate((rot)=>{
  document.getElementById('recAddBtn').click();
  const lab=[...document.querySelectorAll('.sheet label')].find(l=>l.textContent.trim()===rot);
  const inp=document.getElementById(lab.htmlFor); inp.focus(); return inp.id; }, rotulo);
for (const rotulo of ['Valor total recebido (R$)','Observação (opcional)','Data do recebimento']){
  const id=await abrirEFocar(rotulo);
  await pg.waitForTimeout(250);   // bem acima dos 60 ms do temporizador: ele já disparou (ou foi ignorado)
  const ativo=await pg.evaluate(()=>document.activeElement&&document.activeElement.id);
  log(ativo===id,`foco já escolhido em "${rotulo}" não é roubado (ativo: ${ativo}, esperado: ${id})`);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
}
// sem escolha prévia, o foco inicial continua indo ao primeiro campo
await pg.evaluate(()=>document.getElementById('recAddBtn').click()); await pg.waitForTimeout(250);
log(await pg.evaluate(()=>{ const a=document.activeElement; return a && a.closest('.sheet') && a.type==='text' && a.maxLength===40; }),'sem escolha prévia, o primeiro campo (Ativo) recebe o foco');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);

// fechar antes dos 60 ms cancela o temporizador e nada acontece depois
const opener=await pg.evaluate(()=>document.activeElement&&document.activeElement.id);
await pg.evaluate(()=>{ window.__t60.length=0; window.__cleared.clear(); document.getElementById('recAddBtn').click();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); });
await pg.waitForTimeout(450);   // o app devolve o foco a quem abriu o painel após ~270 ms
const t=await pg.evaluate(()=>({ ids:[...window.__t60], cleared:[...window.__cleared], sheets:document.querySelectorAll('.sheet').length, active:document.activeElement&&document.activeElement.id }));
log(t.ids.length>=1 && t.ids.every(i=>t.cleared.includes(i)),'fechar o painel cancela o temporizador de foco inicial: '+JSON.stringify({criados:t.ids,cancelados:t.cleared}));
log(t.sheets===0 && t.active===opener,'foco volta a quem abriu o painel, sem roubo posterior (ativo: '+t.active+', origem: '+opener+')');
/* ---- máscara de moeda: o temporizador de foco não pode desfazer a seleção do usuário ---- */
// sequência controlada: foco → seleção (Ctrl+A / Tab seleciona tudo) → temporizador → digitação
const rid=crypto.randomUUID();
await fetch(B+'/api/finance/receipts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:rid,asset:'MASK11',receivedOn:'2026-01-10',amountCents:12345,note:null})});
await pg.reload(); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(400);
await pg.click('.mainnav a[data-page=income]'); await pg.click('#incTabRec'); await pg.waitForTimeout(250);
await pg.locator('.rec-row',{hasText:'MASK11'}).click(); await pg.waitForSelector('.sheet'); await pg.waitForTimeout(250);
const vid=await pg.evaluate(()=>{ const lab=[...document.querySelectorAll('.sheet label')].find(l=>l.textContent.trim()==='Valor total recebido (R$)'); return lab.htmlFor; });
// 1) seleção feita no mesmo instante do foco (antes do temporizador de 0 ms)
await pg.evaluate((id)=>{ const i=document.getElementById(id); i.blur(); i.focus(); i.select(); }, vid);
await pg.waitForTimeout(100);   // o temporizador da máscara já disparou
const sel=await pg.evaluate((id)=>{ const i=document.getElementById(id); return { s:i.selectionStart, e:i.selectionEnd, len:i.value.length, val:i.value }; }, vid);
log(sel.s===0 && sel.e===sel.len && sel.len>0,'seleção do usuário sobrevive ao temporizador da máscara: '+JSON.stringify(sel));
await pg.keyboard.type('20000');
log(await pg.inputValue('#'+vid)==='R$ 200,00','digitar sobre a seleção substitui o valor existente (R$ 200,00)');
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(500);
const stored=(await ctl('fin=1')).fin.receipts.find(r=>r.id===rid);
log(stored && stored.amountCents===20000 && Number.isInteger(stored.amountCents),'valor enviado ao servidor: '+(stored&&stored.amountCents));
// 2) com o campo sem seleção (clique), o cursor continua indo ao fim
await pg.locator('.rec-row',{hasText:'MASK11'}).click(); await pg.waitForSelector('.sheet'); await pg.waitForTimeout(250);
const vid2=await pg.evaluate(()=>{ const lab=[...document.querySelectorAll('.sheet label')].find(l=>l.textContent.trim()==='Valor total recebido (R$)'); return lab.htmlFor; });
await pg.click('#'+vid2,{position:{x:6,y:10}}); await pg.waitForTimeout(100);
const caret=await pg.evaluate((id)=>{ const i=document.getElementById(id); return { s:i.selectionStart, e:i.selectionEnd, len:i.value.length }; }, vid2);
log(caret.s===caret.len && caret.e===caret.len,'clique sem seleção: cursor no fim, como antes: '+JSON.stringify(caret));
log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br.close(); srv.kill();
process.exit(fails?1:0);
