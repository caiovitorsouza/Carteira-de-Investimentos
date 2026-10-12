// Colagem REAL: texto vai para a área de transferência do navegador e é colado com Ctrl+V
// (caminho nativo do Chromium, sem ClipboardEvent sintético). Também confere digitação e o valor enviado.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
const PORT=8900+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn('node',[new URL('./server.mjs', import.meta.url).pathname],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:900}, permissions:['clipboard-read','clipboard-write']});
await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:B});
const casos=[['100','R$ 100,00',100],['R$ 250','R$ 250,00',250],['1.234,56','R$ 1.234,56',1234.56]];
for (const [txt, esperado, valor] of casos){
  for (const tipo of ['resgate','aporte']){
    await ctl(`seed=1&only=r1&logged=1`);
    const pg=await ctx.newPage(); await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(250);
    await pg.click('[data-pid="r1"]'); await pg.waitForSelector('.sheet');
    await pg.click(tipo==='resgate' ? '.sheet .sheet-actions .btn-ghost' : '.sheet .sheet-actions .btn:not(.btn-ghost)'); await pg.waitForTimeout(450);
    const inp=(await pg.$$('.sheet input'))[0];
    await pg.evaluate(t=>navigator.clipboard.writeText(t), txt);
    const noClipboard=await pg.evaluate(()=>navigator.clipboard.readText());
    await inp.click(); await pg.keyboard.press('ControlOrMeta+V'); await pg.waitForTimeout(80);
    const mostrado=await inp.inputValue();
    log(noClipboard===txt && mostrado===esperado, `${tipo}: colar ${JSON.stringify(txt)} com Ctrl+V → ${JSON.stringify(mostrado)} (esperado ${esperado})`);
    // Confirma e verifica o efeito no servidor
    const apAntes=(await ctl('data=1')).data[0].ap;
    if (tipo==='resgate' && valor > 1084){ // maior que o resgatável: deve recusar sem enviar
      await pg.click('.sheet .btn-full'); await pg.waitForTimeout(500);
      const c=await ctl('puts=1'); const txtS=await pg.textContent('.sheet'); const m=txtS.match(/Valor maior do que o resgatável \([^)]*\)/);
      log(c.puts.length===0 && !!m, `${tipo} ${esperado}: recusado por exceder o saldo, sem envio (envios: ${c.puts.length}; mensagem: ${m?m[0]:'nenhuma'})`);
    } else {
      await pg.click('.sheet .btn-full'); await pg.waitForTimeout(800);
      const c=await ctl('puts=1&data=1'); const ap=c.data[0]?.ap;
      const ok = tipo==='aporte' ? Math.abs(ap-(apAntes+valor))<0.01 : (c.puts.length===1 && ap<apAntes);
      log(c.puts.length===1 && ok, `${tipo} ${esperado}: 1 envio, ap ${apAntes} → ${ap}`);
    }
    await pg.close();
  }
}
await br.close(); srv.kill();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS PASSARAM'); process.exit(fails?1:0);
