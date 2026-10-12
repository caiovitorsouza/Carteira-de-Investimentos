// Regressão: resgate/venda/aporte — máscara, valores ponta a ponta e não duplicação.
// Sobe um servidor próprio em porta isolada; cada caso começa com carteira semeada.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=8800+Math.floor(Math.random()*100), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const brNum=(t)=>Number(String(t).replace(/[^\d,]/g,'').replace(',','.'));
async function abrir(pid, acao){ await ctl(`seed=1&only=${pid}&logged=1`); const pg=await br.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg._errs=errs;
  await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(250);
  await pg.click(`[data-pid="${pid}"]`); await pg.waitForSelector('.sheet');
  await pg.click(acao==='sell' ? '.sheet .sheet-actions .btn-ghost' : '.sheet .sheet-actions .btn:not(.btn-ghost)'); await pg.waitForTimeout(450); return pg; }

// 1) máscara: digitação e colagem
{ const pg=await abrir('r1','sell'); const inp=(await pg.$$('.sheet input'))[0]; await inp.click();
  const seq=[]; for(const ch of '10000'){ await pg.keyboard.type(ch); seq.push(await inp.inputValue()); }
  log(JSON.stringify(seq)===JSON.stringify(['R$ 0,01','R$ 0,10','R$ 1,00','R$ 10,00','R$ 100,00']),'digitação preenche pelos centavos: '+seq.join(' → '));
  const casos={'100':'R$ 100,00','100,50':'R$ 100,50','1.234,56':'R$ 1.234,56','R$ 250':'R$ 250,00','1234.5':'R$ 1.234,50'};
  for (const [t,esp] of Object.entries(casos)){ await inp.fill(''); await inp.focus();
    await pg.evaluate(t=>{const i=document.querySelector('.sheet input'); const dt=new DataTransfer(); dt.setData('text/plain',t); i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},t);
    log(await inp.inputValue()===esp, `colar ${JSON.stringify(t)} → ${await inp.inputValue()} (esperado ${esp})`); }
  await pg.close(); }

// 2) resgate parcial: formulário → envio → persistido → saldo
{ const pg=await abrir('r1','sell');
  const atualAntes=brNum(await pg.textContent('#heroValue'));
  const apAntes=(await ctl('data=1')).data[0].ap;
  const inp=(await pg.$$('.sheet input'))[0]; await inp.click(); await pg.keyboard.type('10000');
  log(await inp.inputValue()==='R$ 100,00','formulário mostra R$ 100,00');
  await ctl('delay=700');
  await pg.click('.sheet .btn-full'); await pg.waitForTimeout(250);
  const toastCedo=await pg.evaluate(()=>document.getElementById('toast').classList.contains('show')?document.getElementById('toast').textContent:'');
  log(!/registrado/.test(toastCedo),'sem confirmação enquanto o servidor não respondeu (toast: '+JSON.stringify(toastCedo)+')');
  await pg.waitForTimeout(900); await ctl('delay=0');
  const c=await ctl('puts=1&data=1');
  const esperadoAp=Number((apAntes*(1-100/atualAntes)).toFixed(2));
  const enviado=c.puts.map(p=>p.positions[0].ap);
  log(c.puts.length===1 && Math.abs(enviado[0]-esperadoAp)<=0.01, `um envio com ap ${enviado} (esperado ${esperadoAp} = ${apAntes} × (1 − 100/${atualAntes}))`);
  log(Math.abs(c.data[0].ap-esperadoAp)<=0.01, 'persistido = enviado: '+c.data[0].ap);
  const saldo=brNum(await pg.textContent('#heroValue'));
  log(Math.abs(saldo-(atualAntes-100))<=0.02, `saldo final ${saldo} ≈ ${atualAntes} − 100`);
  log(/Resgate de R\$\s100,00 registrado/.test(await pg.textContent('#toast')),'confirmação só após salvar: '+await pg.textContent('#toast'));
  log(pg._errs.length===0,'sem erros JS'); await pg.close(); }

// 3) não duplicação por clique duplo e Enter repetido — resgate, venda e aporte
for (const [pid, acao, tecla, valor, campo] of [
  ['r1','sell','dbl','10000','ap'], ['r1','sell','enter','10000','ap'],
  ['a1','sell','dbl','5','q'], ['a1','sell','enter','5','q'],
  ['a1','buy','dbl','5','q'], ['a1','buy','enter','5','q'],
  ['r1','buy','enter','10000','ap'],
]){
  const pg=await abrir(pid,acao); const antes=(await ctl('data=1')).data[0][campo];
  const inp=(await pg.$$('.sheet input'))[0]; await inp.click(); await pg.keyboard.press('Control+A'); await pg.keyboard.type(valor);
  if (tecla==='dbl') await pg.dblclick('.sheet .btn-full');
  else { await pg.focus('.sheet .btn-full'); for(let i=0;i<4;i++) await pg.keyboard.press('Enter'); }
  await pg.waitForTimeout(900);
  const c=await ctl('puts=1&data=1'); const depois=c.data[0]?.[campo];
  log(c.puts.length===1, `${acao==='sell'?'venda/resgate':'aporte'} ${pid} com ${tecla==='dbl'?'clique duplo':'Enter ×4'}: ${c.puts.length} envio(s), ${campo} ${antes} → ${depois}`);
  await pg.close();
}

// 4) falha + novas tentativas (inclusive clique duplo no "Tentar salvar de novo")
{ const pg=await abrir('r1','sell'); await ctl('failSave=1');
  const inp=(await pg.$$('.sheet input'))[0]; await inp.click(); await pg.keyboard.type('10000');
  await pg.click('.sheet .btn-full'); await pg.waitForTimeout(700);
  log(await pg.isVisible('#saveBanner') && !/registrado/.test(await pg.textContent('#toast')),'falha: banner visível, sem confirmação de sucesso');
  await pg.click('#saveRetryBtn'); await pg.waitForTimeout(500);
  await ctl('failSave=0'); await pg.dblclick('#saveRetryBtn'); await pg.waitForTimeout(900);
  const c=await ctl('puts=1&data=1'); const aps=[...new Set(c.puts.map(p=>p.positions[0].ap))];
  log(aps.length===1 && c.puts.filter(p=>!p.fail).length===1 && c.data[0].ap===aps[0], `tentativas reenviam o mesmo estado (${c.puts.map(p=>(p.fail?'falha':'ok')+':'+p.positions[0].ap).join(', ')}); persistido ${c.data[0].ap}`);
  log(!(await pg.isVisible('#saveBanner')),'banner some após salvar');
  await pg.close(); }

await br.close(); srv.kill();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS PASSARAM'); process.exit(fails?1:0);
