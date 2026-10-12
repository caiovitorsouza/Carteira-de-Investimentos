const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const B='http://localhost:8787'; const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const log=(ok,msg)=>console.log((ok?'PASS ':'FAIL ')+msg);
const br=await chromium.launch(); const pg=await br.newPage({viewport:{width:1280,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
await ctl('seed=1&logged=1&failLoad=1');
await pg.goto(B); await pg.waitForSelector('#loadError:not([hidden])');
log(!(await pg.isVisible('#dash')) && !(await pg.isVisible('#addBtn')),'falha ao carregar: painel bloqueado, sem botão adicionar');
await ctl('failLoad=0'); await pg.click('#loadRetryBtn'); await pg.waitForSelector('#loadError[hidden]',{state:'attached'});
log(await pg.isVisible('#dash') && /R\$\s?[1-9]/.test(await pg.textContent('#heroValue')),'retry carrega carteira');
// resgate renda fixa com falha e retry
await ctl('failSave=1');
await pg.click('[data-pid="r1"]'); await pg.waitForSelector('.sheet');
await pg.click('.sheet .sheet-actions .btn-ghost'); await pg.waitForTimeout(600);
const atualR1=await pg.evaluate(()=>{const t=document.querySelector('.sheet .sheet-value, .sheet')?.textContent||''; return t;});
const apAntes=(await ctl('data=1')).data.find(p=>p.id==='r1').ap;
const ri=await pg.$$('.sheet input'); await ri[0].click(); await pg.keyboard.type('10000');
log(await ri[0].inputValue()==='R$ 100,00','resgate: formulário mostra R$ 100,00');
await pg.click('.sheet .btn-full'); await pg.waitForTimeout(900);
log(await pg.isVisible('#saveBanner') && !/Resgate de/.test(await pg.textContent('#toast')),'resgate com falha não confirma');
await ctl('failSave=0'); await pg.click('#saveRetryBtn'); await pg.waitForTimeout(800);
const dados=await ctl('puts=1&data=1');
const okPuts=dados.puts.filter(p=>!p.fail);
const ap=dados.data.find(p=>p.id==='r1').ap;
const apsEnviados=[...new Set(dados.puts.map(p=>p.positions.find(x=>x.id==='r1').ap))];
log(okPuts.length===1 && apsEnviados.length===1 && ap===apsEnviados[0] && ap<apAntes && ap>apAntes*0.85,
  `resgate aplicado uma vez após retry: ap ${apAntes} → ${ap}; envios ${dados.puts.map(p=>(p.fail?'falha':'ok')+':'+p.positions.find(x=>x.id==='r1').ap).join(', ')}`);
// adicionar ativo renda fixa (sucesso)
const s0=(await ctl('')).saves;
await pg.click('#addBtn'); await pg.waitForSelector('.sheet');
const types=await pg.$$eval('.sheet .type-grid > *', els=>els.map(e=>e.innerText.split('\n')[0]));
console.log('tipos:',types.join(' | '));
await pg.click('.sheet .type-grid > *:nth-child(2)'); await pg.waitForTimeout(600);
console.log('painel:', (await pg.textContent('.sheet h3')).trim());
console.log('inputs:', await pg.$$eval('.sheet input,.sheet button', es=>es.map(e=>e.tagName+':'+(e.placeholder||e.textContent.trim().slice(0,25))).join(' | ')));
log(errs.length===0,'sem erros '+JSON.stringify(errs));
await br.close();
