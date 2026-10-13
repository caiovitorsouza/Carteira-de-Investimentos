// Simuladores com premissas editáveis, ocultar valores, dois temas e larguras 390/1440 (dados fictícios).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const PORT=9300+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const SHOTS=process.env.RENDUM_SHOTS; if(SHOTS) fs.mkdirSync(SHOTS,{recursive:true});
await ctl('seed=1&logged=1');
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(400);
const txt=(sel)=>pg.textContent(sel).then(t=>t.replace(/\s+/g,' ').trim());
await pg.click('.mainnav a[data-page=simulators]'); await pg.waitForTimeout(200);

/* ---------- independência ---------- */
const vals=await pg.evaluate(()=>['indepInicial','indepAporte','indepCusto','indepRent','indepTaxaRenda','indepInflacao'].map(i=>document.getElementById(i).value));
log(JSON.stringify(vals)===JSON.stringify(['','500,00','3.500,00','10','7','']),'taxas e valores anteriores preservados como iniciais editáveis: '+JSON.stringify(vals));
log(/Em branco, usa o patrimônio atual da carteira \(R\$\s?[\d.]+,\d\d\)/.test(await txt('#indepBox')),'capital inicial em branco usa o patrimônio atual (explícito)');
const hero=await txt('#heroValue');
const calc=await pg.evaluate(async (heroTxt)=>{ const m=await import('/finance-calc.js'); const pat=m.parseMoneyToCents(heroTxt);
  const r=m.simulateIndependence({initialCents:null,monthlyContributionCents:50000,desiredIncomeCents:350000,returnBp:1000,incomeRateBp:700,inflationBp:null},pat); return {pat,months:r.months,reachable:r.reachable}; }, hero);
const shown=await txt('#indepResult .time');
const years=calc.months/12; const expect = calc.months<12?`${calc.months} ${calc.months===1?'mês':'meses'}`: (Math.round(years*10)/10<2?'1 ano':String(Math.round(years*10)/10).replace('.',',')+' anos');
log(calc.reachable && shown===expect,'resultado da tela = cálculo puro (mês a mês, taxa mensal equivalente): '+shown+' / '+expect);
log(!await pg.evaluate(()=>document.getElementById('indepMore').open) && /Premissas e metodologia/.test(await txt('#indepMore summary')),'premissas ficam numa seção recolhida (uma explicação visível curta)');
log(/taxa mensal equivalente/.test(await txt('#indepMore')) && /não 0,83%|dividir por 12/.test(await txt('#indepMore')),'premissa explica conversão anual→mensal');
log(/Valores nominais, sem inflação/.test(await txt('#indepResult')) && /Sem inflação informada/.test(await txt('#indepMore')) && /não uma garantia/.test(await txt('#indepResult')),'sem inflação: nominal e ausência de garantia visíveis no resultado');
await pg.focus('#indepMore summary'); await pg.keyboard.press('Enter');
log(await pg.evaluate(()=>document.getElementById('indepMore').open),'seção de premissas abre pelo teclado');
await pg.fill('#indepAporte','600'); await pg.waitForTimeout(80);
log(await pg.evaluate(()=>document.getElementById('indepMore').open) && await pg.evaluate(()=>document.activeElement.id)==='indepAporte','editar um campo não fecha a seção aberta nem tira o foco');
await pg.fill('#indepAporte','500');
// regressão do limite (R$ 300.000, não 300.500): capital 0, R$ 500/mês, rentabilidade 0%, meta inalcançável
await pg.fill('#indepInicial','0,00'); await pg.fill('#indepRent','0'); await pg.fill('#indepCusto','1.000.000'); await pg.waitForTimeout(80);
{ const r=await txt('#indepResult'); log(/mais de 50 anos/.test(r) && /R\$\s?300\.000,00/.test(r) && !/300\.500,00/.test(r),'limite de 50 anos: capital exatamente R$ 300.000,00 (600 aportes), sem aporte extra: '+r.slice(0,150)); }
await pg.fill('#indepInicial',''); await pg.fill('#indepRent','10'); await pg.fill('#indepCusto','3.500,00');
await pg.fill('#indepRent','12'); await pg.fill('#indepTaxaRenda','6'); await pg.fill('#indepInflacao','4,5'); await pg.fill('#indepCusto','4.000'); await pg.fill('#indepInicial','10.000,00'); await pg.fill('#indepAporte','800');
await pg.waitForTimeout(100);
const t=await txt('#indepBox');
log(/Valores nominais \(no futuro\)/.test(t) && /Poder de compra de hoje/.test(t) && /Inflação de 4,50% ao ano/.test(t) && /Rentabilidade de 12,00% ao ano/.test(t) && /6,00% ao ano/.test(t) && /valor informado por você/.test(t),'inflação opcional separa nominal x poder de compra e lista premissas: '+t.slice(0,160));
log(!/garant(e|imos) (um )?resultado|com certeza|promet(e|emos)/i.test(t) && /não é uma garantia|não uma garantia|não é promessa|estimativa, não uma garantia/.test(t),'não promete resultados');
const ind1=await pg.evaluate(async ()=>{ const m=await import('/finance-calc.js'); const r=m.simulateIndependence({initialCents:1000000,monthlyContributionCents:80000,desiredIncomeCents:400000,returnBp:1200,incomeRateBp:600,inflationBp:450}); return {months:r.months, nomCap:r.nominal.capitalCents, realCap:r.real.capitalCents}; });
log(ind1.nomCap>ind1.realCap && new RegExp('Capital R\\$\\s?'+ (ind1.nomCap/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/\./g,'\\.')).test(t),'valores nominal/real coerentes com o cálculo puro');
// entradas inválidas e inalcançável sem travar
await pg.fill('#indepRent','abc');
log(/Confira estes campos: rentabilidade anual/.test(await txt('#indepResult')) && await pg.getAttribute('#indepRent','aria-invalid')==='true','entrada inválida: mensagem e campo marcado');
await pg.fill('#indepRent','12'); await pg.fill('#indepTaxaRenda','0');
log(/Confira estes campos: taxa anual para estimar renda/.test(await txt('#indepResult')),'taxa de renda zero recusada (sem divisão por zero)');
await pg.fill('#indepTaxaRenda','6'); await pg.fill('#indepCusto','0');
log(/renda mensal desejada/.test(await txt('#indepResult')),'renda desejada zero recusada');
await pg.fill('#indepCusto','100.000'); await pg.fill('#indepAporte','0'); await pg.fill('#indepInicial','1');
log(/mais de 50 anos/.test(await txt('#indepResult')) && /não é atingida em 50 anos/.test(await txt('#indepResult')),'cenário inalcançável é tratado');
await pg.fill('#indepRent','-80'); log(/Confira estes campos/.test(await txt('#indepResult')),'rentabilidade fora da faixa recusada');
await pg.fill('#indepRent','10');
// salvar: sem duplicar, só confirma após o servidor
await pg.fill('#indepInicial',''); await pg.fill('#indepAporte','800'); await pg.fill('#indepCusto','4000'); await pg.fill('#indepTaxaRenda','6,5'); await pg.fill('#indepRent','11'); await pg.fill('#indepInflacao','4,5');
await ctl('finDelay=400');
await pg.evaluate(()=>{ const b=document.getElementById('indepSave'); b.click(); b.click(); });
await pg.waitForTimeout(150);
log(await pg.isDisabled('#indepSave') && await pg.getAttribute('#indepSave','aria-busy')==='true' && /Salvando/.test(await txt('#indepStatus')) && !/Premissas salvas\./.test(await txt('#indepStatus')),'durante o envio: botão bloqueado e sem anúncio de sucesso');
await pg.waitForTimeout(900);
let c=await ctl('fin=1'); const puts=c.finLog.filter(l=>l.m==='PUT'&&/simulators\/independence/.test(l.p));
log(puts.length===1 && /Premissas salvas\./.test(await txt('#indepStatus')),'um único envio e sucesso só após confirmação');
const sv=c.fin.simulators.independence;
log(sv.initialCents===null && sv.monthlyContributionCents===80000 && sv.desiredIncomeCents===400000 && sv.returnBp===1100 && sv.incomeRateBp===650 && sv.inflationBp===450,'premissas em centavos e pontos-base inteiros: '+JSON.stringify(sv));
await ctl('finDelay=0&failFinWrite=1');
await pg.fill('#indepAporte','900'); await pg.click('#indepSave'); await pg.waitForTimeout(400);
log(/servidor não conseguiu|Não foi possível/.test(await txt('#indepStatus')) && await pg.inputValue('#indepAporte')==='900' && (await ctl('fin=1')).fin.simulators.independence.monthlyContributionCents===80000,'falha: formulário preservado, nada alterado, sem "salvo"');
await ctl('failFinWrite=0'); await pg.click('#indepSave'); await pg.waitForTimeout(400);
await pg.reload(); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(500); await pg.click('.mainnav a[data-page=simulators]');
const back=await pg.evaluate(()=>['indepInicial','indepAporte','indepCusto','indepRent','indepTaxaRenda','indepInflacao'].map(i=>document.getElementById(i).value));
log(JSON.stringify(back)===JSON.stringify(['','900,00','4.000,00','11','6,5','4,5']),'após recarregar, as premissas salvas voltam: '+JSON.stringify(back));
await pg.click('#indepReset');
log(await pg.inputValue('#indepRent')==='10' && await pg.inputValue('#indepCusto')==='3.500,00' && /não salvas|Salve para mantê-los/.test(await txt('#indepStatus')),'restaurar padrões não salva sozinho');

/* ---------- Bazin ---------- */
await pg.click('#bazinInput'); await pg.keyboard.type('bbas'); await pg.waitForSelector('#bazinList:not([hidden])'); await pg.keyboard.press('Enter');
let bz=await txt('#bazinOut');
log(/dado ilustrativo, não é cotação/.test(bz) && /Dados ilustrativos/.test(await txt('#bazinBox')),'valores da lista marcados como ilustrativos');
await pg.fill('#bazinDiv','5,00'); await pg.fill('#bazinTaxa','8,5'); await pg.waitForTimeout(100);
bz=await txt('#bazinOut');
log(/Proventos anuais informado por você/.test(bz) && /Preço de referência: dado ilustrativo/.test(bz) && /Preço-teto \(8,50%\)\s*R\$\s?58,82/.test(bz),'origem manual dos proventos e taxa editável (5,00 ÷ 8,5% = 58,82): '+bz.slice(0,200));
log(!/compre|comprar|oportunidade|recomendamos|barato/i.test(bz) && /referência simplificada, não uma recomendação de compra ou venda/.test(bz),'preço-teto não é apresentado como recomendação');
await pg.fill('#bazinPx',''); await pg.waitForTimeout(100);
log(/Preço-teto \(8,50%\)/.test(await txt('#bazinOut')) && /Sem preço de referência/.test(await txt('#bazinOut')),'preço de referência é opcional');
await pg.fill('#bazinPx','50'); await pg.fill('#bazinTaxa','0'); log(/taxa de referência/.test(await txt('#bazinOut')),'taxa zero recusada');
await pg.fill('#bazinTaxa','8,5');
await pg.click('#bazinSave'); await pg.waitForTimeout(400);
const bs=(await ctl('fin=1')).fin.simulators.bazin;
log(bs && bs.annualDividendCents===500 && bs.rateBp===850 && bs.priceCents===5000 && bs.ticker==='BBAS3' && bs.dividendOrigin==='manual' && bs.priceOrigin==='manual' && /Cenário salvo\./.test(await txt('#bazinStatus')),'cenário Bazin salvo com origem manual: '+JSON.stringify(bs));
await pg.reload(); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(500); await pg.click('.mainnav a[data-page=simulators]');
log(await pg.inputValue('#bazinDiv')==='5,00' && await pg.inputValue('#bazinTaxa')==='8,5' && /informado por você/.test(await txt('#bazinOut')),'Bazin salvo volta após recarregar');

/* ---------- ocultar valores ---------- */
await pg.click('#visBtn'); await pg.waitForTimeout(200);
const hid=await pg.evaluate(()=>{ const t=document.getElementById('pg-simulators').innerText; return { money:(t.match(/R\$\s?\d/g)||[]), types:['indepInicial','indepAporte','indepCusto','bazinPx','bazinDiv'].map(i=>document.getElementById(i).type), pctInput:document.getElementById('indepRent').type,
  labs:[...document.querySelectorAll('#pg-simulators [aria-label],#pg-simulators [title]')].some(e=>/R\$\s?\d/.test((e.getAttribute('aria-label')||'')+(e.title||''))) }; });
log(hid.money.length===0 && hid.types.every(x=>x==='password') && hid.pctInput==='text' && !hid.labs,'valores ocultos nos simuladores (texto, campos monetários, rótulos): '+JSON.stringify(hid));
await pg.click('#visBtn'); await pg.waitForTimeout(100);
log(await pg.getAttribute('#bazinDiv','type')==='text','mostrar valores restaura os campos');

/* ---------- larguras, temas e movimento reduzido ---------- */
const goalId=crypto.randomUUID();
await fetch(B+'/api/finance/goals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:goalId,kind:'patrimonio',name:'Meta com um nome razoavelmente comprido para testar quebra de linha',targetCents:30000000,deadline:'2031-06-30'})});
await fetch(B+'/api/finance/receipts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),asset:'KNRI11',receivedOn:new Date().getFullYear()+'-02-10',amountCents:98765,note:'Observação longa '.repeat(8)})});
await fetch(B+'/api/finance/reserve',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({monthlyExpenseCents:450000,months:9,linkedPositionIds:['r1']})});
await br.close();
const br2=await chromium.launch();
for (const [w,h] of [[390,844],[1440,900]]){
  for (const scheme of ['light','dark']){
    const cx=await br2.newContext({viewport:{width:w,height:h},colorScheme:scheme}); const p=await cx.newPage();
    const pe=[]; p.on('pageerror',e=>pe.push(e.message));
    await p.goto(B); await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(500);
    const theme=await p.evaluate(()=>document.documentElement.getAttribute('data-theme')||'?');
    for (const [page,prep] of [['income',async()=>{ await p.click('#incTabRec'); await p.waitForTimeout(200); }],['goals',async()=>{}],['simulators',async()=>{}]]){
      await p.evaluate(k=>document.querySelector(`.mainnav a[data-page=${k}]`).click(),page); await p.waitForTimeout(150); await prep(); await p.waitForTimeout(150);
      const m=await p.evaluate(()=>({ sw:document.documentElement.scrollWidth, iw:window.innerWidth, wide:[...document.querySelectorAll('.page:not([hidden]) *')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>window.innerWidth+1 && getComputedStyle(e).position!=='fixed' && !e.closest('.calendar,.sr-only,.bazin-list'); }).length,
        small:[...document.querySelectorAll('.page:not([hidden]) button, .page:not([hidden]) select, .page:not([hidden]) input:not([type=checkbox])')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<36; }).length }));
      log(m.sw<=m.iw+1 && m.wide===0,`${w}px ${scheme}(${theme}) ${page}: sem rolagem horizontal (sw ${m.sw}/${m.iw}, elementos fora ${m.wide})`);
      log(m.small===0,`${w}px ${scheme} ${page}: alvos de toque ≥ 36px (${m.small} menores)`);
      if (SHOTS) await p.screenshot({path:`${SHOTS}/${w}-${scheme}-${page}.png`,fullPage:true});
    }
    // painel de recebimento em tela estreita
    await p.evaluate(()=>document.querySelector('.mainnav a[data-page=income]').click()); await p.click('#incTabRec'); await p.click('#recAddBtn'); await p.waitForSelector('.sheet'); await p.waitForTimeout(350);
    const sh=await p.evaluate(()=>{ const s=document.querySelector('.sheet').getBoundingClientRect(); return { fits:s.left>=-1 && s.right<=window.innerWidth+1, h:s.height<=window.innerHeight+1 }; });
    log(sh.fits && sh.h,`${w}px ${scheme}: painel de registro cabe na tela`);
    if (SHOTS) await p.screenshot({path:`${SHOTS}/${w}-${scheme}-sheet.png`});
    log(pe.length===0,`${w}px ${scheme}: sem erros JS ${JSON.stringify(pe)}`);
    await cx.close();
  }
}
const cr=await br2.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}); const pr=await cr.newPage();
await pr.goto(B); await pr.waitForSelector('#app:not(.hide)'); await pr.waitForTimeout(400); await pr.evaluate(()=>document.querySelector('.mainnav a[data-page=goals]').click()); await pr.waitForTimeout(300);
const dur=await pr.evaluate(()=>{ const s=document.querySelector('.progress > span'); return s?getComputedStyle(s).transitionDuration:null; });
log(dur==='0s','movimento reduzido: barra de progresso sem transição ('+dur+')');
await cr.close();
log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br2.close(); srv.kill();
process.exit(fails?1:0);
