const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const B='http://localhost:8787'; const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const log=(ok,msg)=>console.log((ok?'PASS ':'FAIL ')+msg);
const br=await chromium.launch(); const pg=await br.newPage({viewport:{width:1280,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await ctl('seed=1&logged=1&failLoad=0&failSave=0&empty=0&reset=1');
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(300);
async function addSelic(){
  await pg.click('#addBtn'); await pg.waitForSelector('.sheet');
  await pg.click('.sheet .type-grid > *:nth-child(2)'); await pg.waitForTimeout(500);
  await pg.click('.sheet button:has-text("Tesouro Selic")'); await pg.waitForTimeout(500);
  const ins=await pg.$$('.sheet input'); 
  for(const i of ins){ const ph=await i.getAttribute('placeholder')||''; const t=await i.getAttribute('type'); if(t!=='date'){ await i.click(); await pg.keyboard.type('50000'); break; } }
  await pg.click('.sheet .btn-full'); await pg.waitForTimeout(900);
}
const n0=(await pg.evaluate(()=>fetch('/api/portfolio').then(r=>r.json()))).positions.length;
await ctl('failSave=1'); await addSelic();
log(await pg.isVisible('#saveBanner') && !/adicionado/.test(await pg.textContent('#toast')),'adicionar com falha: sem confirmação ('+await pg.textContent('#toast')+')');
await ctl('failSave=0'); await pg.click('#saveRetryBtn'); await pg.waitForTimeout(800);
const n1=(await pg.evaluate(()=>fetch('/api/portfolio').then(r=>r.json()))).positions.length;
log(n1===n0+1,`adicionado uma vez após retry (${n0}→${n1})`);
await addSelic();
const n2=(await pg.evaluate(()=>fetch('/api/portfolio').then(r=>r.json()))).positions.length;
log(n2===n1+1 && /adicionado/.test(await pg.textContent('#toast')),'adicionar com sucesso confirma depois de salvar');
log(errs.length===0,'sem erros '+JSON.stringify(errs));
await br.close();
