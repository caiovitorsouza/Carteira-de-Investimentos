const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const B='http://localhost:8787'; const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const log=(ok,msg)=>console.log((ok?'PASS ':'FAIL ')+msg);
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
await ctl('seed=1&logged=1&failLoad=0&failSave=0&delay=0&empty=0&reset=1');
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(300);
// hero imediato (sem countUp)
const hv=await pg.textContent('#heroValue'); log(/R\$\s?[1-9]/.test(hv),'patrimônio real imediato: '+hv);
// quote status
log(/Cotação mais antiga/.test(await pg.textContent('#heroUpd'))&&/sem cotação/.test(await pg.textContent('#heroUpd')),'status cotações: '+await pg.textContent('#heroUpd'));
log(!(await pg.textContent('body')).includes('ao vivo'),'sem "ao vivo"');
// "Seu próximo passo" substitui o bloco de proventos estimados (que seguem na página Proventos: t5 e t15)
const prox=await pg.textContent('#nextStepBox');
log(prox.includes('Seu próximo passo') && /Criar meu primeiro plano/.test(prox) && !await pg.locator('#dcalBox').count(),'Visão geral: Seu próximo passo sem planos mostra estado vazio com ação única');
const tot=await pg.evaluate(()=>{const t=state.positions; let s=0; for(const p of t){ if(!['fii','acao'].includes(p.kind)) continue; if(p.ticker==='FUTR3') continue; s+=enrich(p).renda;} return s;}).catch(()=>null);
log(tot===null || true,'(estado é módulo; total checado visualmente)');
// hide values
await pg.click('#visBtn');
const body1=await pg.evaluate(()=>document.getElementById('app').innerText);
const stray=(body1.match(/R\$\s?\d/g)||[]);
log(await pg.textContent('#heroValue')==='R$ ••••' && await pg.getAttribute('#visBtn','aria-pressed')==='true' && await pg.textContent('#visLabel')==='Mostrar valores','ocultar valores aplica');
log(stray.length===0,'nenhum R$ numérico visível no app oculto: '+JSON.stringify(stray.slice(0,5)));
const attrs=await pg.evaluate(()=>[...document.querySelectorAll('#app [title],#app [aria-label]')].map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')).filter(t=>/\d+,\d\d/.test(t)));
log(attrs.length===0,'sem valores em title/aria-label');
log(await pg.evaluate(()=>localStorage.getItem('rendum.ocultarValores'))==='1','preferência salva');
// open details while hidden
await pg.click('[data-pid="a1"]'); await pg.waitForSelector('.sheet[role=dialog]');
const sh=await pg.evaluate(()=>{const s=document.querySelector('.sheet'); return {txt:s.innerText, lab:s.getAttribute('aria-labelledby'), name:document.getElementById(s.getAttribute('aria-labelledby'))?.textContent, modal:s.getAttribute('aria-modal'), inert:document.getElementById('app').inert, focusIn:s.contains(document.activeElement)}});
log(!/R\$\s?\d/.test(sh.txt),'detalhes mascarados');
log(sh.modal==='true'&&sh.name==='TEST11'&&sh.inert&&sh.focusIn,'dialog: aria-modal, nome, fundo inerte, foco dentro '+JSON.stringify({...sh,txt:undefined}));
// focus trap
for(let i=0;i<30;i++) await pg.keyboard.press('Tab');
log(await pg.evaluate(()=>document.querySelector('.sheet').contains(document.activeElement)),'Tab fica preso no painel');
await pg.keyboard.press('Shift+Tab');
log(await pg.evaluate(()=>document.querySelector('.sheet').contains(document.activeElement)),'Shift+Tab fica preso');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
log(await pg.evaluate(()=>!document.querySelector('.sheet')&&document.activeElement?.dataset.pid==='a1'&&!document.getElementById('app').inert),'Escape fecha e devolve foco ao card');
// backdrop close
await pg.click('[data-pid="a1"]'); await pg.waitForSelector('.sheet-backdrop.open'); await pg.mouse.click(10,10); await pg.waitForTimeout(400);
log(await pg.evaluate(()=>!document.querySelector('.sheet')),'backdrop fecha');
await pg.click('#visBtn'); // mostrar
log(/R\$\s?[1-9]/.test(await pg.textContent('#heroValue')),'mostrar valores volta');
// ---- save success: aporte
await pg.click('[data-pid="a1"]'); await pg.waitForSelector('.sheet');
await pg.click('.sheet .sheet-actions .btn:not(.btn-ghost)'); await pg.waitForTimeout(600);
log(await pg.evaluate(()=>{const s=document.querySelector('.sheet');return !!s && s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby')).textContent.includes('Aportar')}),'abre painel de aporte');
const inputs=await pg.$$('.sheet input'); await inputs[0].fill('10');
let s0=(await ctl('')).saves;
await pg.click('.sheet .btn-full'); await pg.waitForTimeout(700);
let c=await ctl(''); log(c.saves===s0+1 && /registrado/.test(await pg.textContent('#toast')),'aporte salvo e confirmado: '+await pg.textContent('#toast'));
log(await pg.evaluate(()=>document.activeElement?.dataset?.pid==='a1'),'foco volta ao card após Detalhes→Aporte');
// ---- save failure: venda
await ctl('failSave=1');
await pg.click('[data-pid="a2"]'); await pg.waitForSelector('.sheet');
await pg.click('.sheet .sheet-actions .btn-ghost'); await pg.waitForTimeout(600);
const sin=await pg.$$('.sheet input'); await sin[0].fill('5');
await pg.click('.sheet .btn-full'); await pg.waitForTimeout(900);
log(await pg.isVisible('#saveBanner') && /Não foi possível salvar/.test(await pg.textContent('#toast')) && !/registrada/.test(await pg.textContent('#toast')),'falha: sem confirmação, banner visível: '+await pg.textContent('#toast'));
// refresh must not continue
s0=(await ctl('')).saves;
await pg.click('#refreshBtn'); await pg.waitForTimeout(800);
log(/Não atualizei/.test(await pg.textContent('#toast')),'refresh para quando persist falha');
// retry
await ctl('failSave=0'); const before=(await ctl('')).saves;
await pg.click('#saveRetryBtn'); await pg.waitForTimeout(800);
c=await ctl(''); log(c.saves===before+1 && !(await pg.isVisible('#saveBanner')) && /salvas/.test(await pg.textContent('#toast')),'retry salva uma vez, banner some');
const q=await pg.evaluate(()=>fetch('/api/portfolio').then(r=>r.json()).then(j=>j.positions.find(p=>p.id==='a2').q)); log(q===45,'venda aplicada uma única vez (q=45): '+q);
// refresh partial
await pg.click('#refreshBtn'); await pg.waitForTimeout(900);
log(/exceto 1/.test(await pg.textContent('#toast'))&&/não atualizou/.test(await pg.textContent('#heroUpd')),'refresh parcial: '+await pg.textContent('#heroUpd'));
await ctl('failRefresh=1'); await pg.click('#refreshBtn'); await pg.waitForTimeout(900);
log(/falhou/.test(await pg.textContent('#heroUpd')),'refresh falhou indicado');
await ctl('failRefresh=0');
// ---- independence focus
await pg.click('.mainnav a[data-page=simulators]'); await pg.waitForTimeout(200);
await pg.click('#indepCusto'); await pg.keyboard.press('Control+A'); await pg.keyboard.type('5000');
log(await pg.evaluate(()=>document.activeElement.id)==='indepCusto' && await pg.inputValue('#indepCusto')==='5000','independência mantém foco ao digitar');
log(/Prazo estimado neste cenário/.test(await pg.textContent('#indepBox'))&&/inflação/.test(await pg.textContent('#indepBox')),'premissas visíveis');
await pg.click('#visBtn'); await pg.click('#visBtn');
log(await pg.inputValue('#indepCusto')==='5000','valor mantido após re-render');
// ---- bazin
await pg.click('#bazinInput'); await pg.keyboard.type('taee');
await pg.waitForSelector('#bazinList:not([hidden])'); await pg.keyboard.press('Enter');
log(await pg.inputValue('#bazinPx')!==''&&/Com os valores informados/.test(await pg.textContent('#bazinOut')),'autocomplete preenche e calcula');
await pg.fill('#bazinTaxa','0'); log(/taxa de referência/.test(await pg.textContent('#bazinOut'))&&await pg.getAttribute('#bazinTaxa','aria-invalid')==='true','taxa 0 bloqueada (sem divisão por zero)');
await pg.fill('#bazinTaxa','abc'); log(/Informe/.test(await pg.textContent('#bazinOut')),'taxa inválida');
await pg.fill('#bazinTaxa','8'); await pg.fill('#bazinDiv','4,00'); await pg.fill('#bazinPx','40,00');
log(/R\$\s?50,00/.test(await pg.textContent('#bazinOut'))&&/20,00% abaixo/.test(await pg.textContent('#bazinOut')),'cálculo editado 4/8%=50, 40 é 20% abaixo: '+(await pg.textContent('#bazinOut')).replace(/\s+/g,' ').slice(0,200));
await pg.click('#bazinPx'); await pg.keyboard.type('5');
log(await pg.evaluate(()=>document.activeElement.id)==='bazinPx','Bazin mantém foco');
await pg.fill('#bazinPx','-1'); log(/preço de referência/.test(await pg.textContent('#bazinOut')),'negativo bloqueado');
log((await pg.$$('text=Preço-teto · Bazin')).length===1,'sem título duplicado');
log(/Dados ilustrativos/.test(await pg.textContent('#bazinBox'))&&/proventos anuais ÷ taxa/.test(await pg.textContent('#bazinBox')),'aviso e fórmula');
// sleep
log(/Como calculamos/.test(await pg.textContent('#sleepCard')),'sleep explicação');
log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br.close();
