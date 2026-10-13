// Proventos recebidos, metas e reserva de emergência (dados fictícios, servidor de teste).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PORT=9200+Math.floor(Math.random()*90), B='http://localhost:'+PORT;
const srv=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs', import.meta.url))],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'}); await new Promise(r=>setTimeout(r,800));
const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
process.on('exit',()=>srv.kill());
let fails=0; const log=(ok,msg)=>{ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+msg); };
const Y=new Date().getFullYear();
const post=(path,body)=>fetch(B+'/api/finance/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const uid=()=>crypto.randomUUID();
await ctl('seed=1&logged=1');
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
await pg.goto(B); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(400);
const txt=(sel)=>pg.textContent(sel).then(t=>t.replace(/\s+/g,' ').trim());
const saves0=(await ctl('')).saves; const hero0=await txt('#heroValue');
const sheet=()=>pg.waitForSelector('.sheet');
const S=(label)=>pg.locator('.sheet').getByLabel(label,{exact:true});
// campo com máscara já preenchido: o foco leva o cursor ao fim (comportamento existente), então limpa e digita
const money=async(label,digits)=>{ const l=S(label); await l.click(); await l.press('Control+A'); await l.press('Backspace'); await l.pressSequentially(digits); };

/* ================= PROVENTOS: estimados x recebidos ================= */
await pg.click('.mainnav a[data-page=income]'); await pg.waitForTimeout(150);
log(await txt('#pageTitle')==='Proventos estimados' && await pg.getAttribute('#incTabEst','aria-pressed')==='true','abre em "Estimados" (calendário existente preservado)');
log(await pg.isVisible('#calendar') && /Estimado/.test(await txt('#pg-income')) && !await pg.isVisible('#incRec'),'calendário e estimativas visíveis, recebidos oculto');
await pg.click('#incTabRec'); await pg.waitForTimeout(150);
log(await txt('#pageTitle')==='Proventos recebidos' && await pg.getAttribute('#incTabRec','aria-pressed')==='true','aba Recebidos muda o título');
log(/Nenhum recebimento registrado/.test(await txt('#recBody')) && /informados por você/.test(await txt('#recBanner')) && /não são confirmados por corretora/.test(await txt('#recBanner')),'estado vazio útil e aviso curto de origem');
log(!await pg.isVisible('#recAddBtn') && await pg.locator('#recBody .fin-empty button').count()===1,'estado vazio: uma única ação principal (sem botão duplicado no cabeçalho)');
log(!await pg.evaluate(()=>document.getElementById('recMore').open) && /nunca vira recebimento sozinha/.test(await txt('#recMore')) && /não consulta corretoras/.test(await txt('#recMore')) && /não muda caixa, posições nem patrimônio/.test(await txt('#recMore')),'metodologia em seção recolhida, com o conteúdo essencial');
await pg.focus('#recMore summary'); await pg.keyboard.press('Enter');
log(await pg.evaluate(()=>document.getElementById('recMore').open) && await pg.evaluate(()=>document.activeElement.tagName)==='SUMMARY','seção expansível abre pelo teclado e mantém o foco');
await pg.keyboard.press('Space'); log(!await pg.evaluate(()=>document.getElementById('recMore').open),'e fecha pelo teclado');
log(!await pg.isVisible('#refreshBtn') && !await pg.evaluate(()=>!!document.querySelector('.lead-actions') && getComputedStyle(document.querySelector('.lead-actions')).display!=='none'),'Recebidos não oferece "Atualizar cotações" (registros manuais não dependem de preços)');
log((await ctl('fin=1')).fin.receipts.length===0,'estimativas não criam recebimentos');

// registrar (envio duplicado bloqueado)
await pg.click('#recBody .fin-empty button'); await sheet();
log(await pg.evaluate(()=>document.querySelector('.sheet').getAttribute('aria-modal'))==='true' && /Registro informado por você/.test(await txt('.sheet')) && /Não altera caixa, posição nem patrimônio/.test(await txt('.sheet')),'painel explica origem e que não altera a carteira');
await S('Ativo').fill('test11');
await S('Data do recebimento').fill(`${Y}-01-31`);
await S('Valor total recebido (R$)').fill('12345');
log(await S('Valor total recebido (R$)').inputValue()==='R$ 123,45','máscara de moeda no valor');
await S('Observação (opcional)').fill('JCP do trimestre');
await ctl('finDelay=400');
await pg.evaluate(()=>{ const b=document.querySelector('.sheet button[type=submit]'); b.click(); b.click(); document.querySelector('.sheet form').requestSubmit(); });
await pg.waitForTimeout(1000);
let c=await ctl('fin=1'); const posts=c.finLog.filter(l=>l.m==='POST');
log(posts.length===1 && c.fin.receipts.length===1,'cliques e Enter duplos geram um único envio: '+posts.length);
const sent=posts[0].body;
log(Number.isInteger(sent.amountCents)&&sent.amountCents===12345 && sent.receivedOn===`${Y}-01-31` && sent.note==='JCP do trimestre' && /^[0-9a-f-]{36}$/.test(sent.id),'enviado em centavos inteiros e data AAAA-MM-DD sem fuso: '+JSON.stringify(sent));
log(await pg.locator('.sheet').count()===0 && /Recebimento registrado/.test(await txt('#toast')) && !/123/.test(await txt('#toast')),'sucesso anunciado só depois da confirmação, sem valor no aviso');
await ctl('finDelay=0');
const row=pg.locator('.rec-row').first();
log(/TEST11/.test(await row.textContent()) && /R\$\s?123,45/.test(await row.textContent()) && /31\/01/.test(await row.textContent()),'registro listado sob "informados por você": '+await row.textContent());
log((await ctl('')).saves===saves0 && await txt('#heroValue')===hero0,'não altera carteira nem patrimônio');

// falha preserva formulário e reenvio não duplica
await pg.waitForTimeout(2400);   // deixa o aviso de sucesso anterior sumir
await ctl('failFinWrite=1');
await pg.click('#recAddBtn'); await sheet();
await S('Ativo').fill('MXRF11'); await S('Data do recebimento').fill(`${Y}-02-10`);
await S('Valor total recebido (R$)').fill('5000');
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(500);
log(await pg.locator('.sheet').count()===1 && /Não foi possível concluir|servidor não conseguiu/.test(await txt('.sheet .fin-form-err')) && await S('Ativo').inputValue()==='MXRF11' && await S('Valor total recebido (R$)').inputValue()==='R$ 50,00','falha: painel aberto, erro visível, dados preservados');
log(!await pg.evaluate(()=>document.getElementById('toast').classList.contains('show')) && (await ctl('fin=1')).fin.receipts.length===1,'falha não anuncia sucesso nem grava');
await ctl('failFinWrite=0');
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(500);
c=await ctl('fin=1');
const ids=new Set(c.finLog.filter(l=>l.m==='POST').slice(1).map(l=>l.body.id));
log(c.fin.receipts.length===2 && ids.size===1,'reenvio reutiliza o mesmo id (2 registros, 1 id para a tentativa): '+ids.size);

// validação local
await pg.click('#recAddBtn'); await sheet();
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(100);
log(await pg.evaluate(()=>document.activeElement.getAttribute('aria-invalid'))==='true' && /Informe o ativo/.test(await txt('.sheet')),'validação: foco no primeiro campo inválido');
await S('Ativo').fill('KNRI11'); await S('Valor total recebido (R$)').fill('0'); await pg.click('.sheet button[type=submit]');
log(/maior que zero/.test(await txt('.sheet')),'valor zero recusado');
await S('Valor total recebido (R$)').fill('100'); await S('Data do recebimento').fill('2099-01-01'); await pg.click('.sheet button[type=submit]');
log(/não pode ser futura/.test(await txt('.sheet')) && (await ctl('fin=1')).fin.receipts.length===2,'data futura recusada');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
log(await pg.evaluate(()=>document.activeElement.id)==='recAddBtn','Escape fecha e devolve o foco ao botão');

// editar
await pg.locator('.rec-row',{hasText:'TEST11'}).click(); await sheet();
log(/Editar recebimento/.test(await txt('.sheet')) && await S('Valor total recebido (R$)').inputValue()==='R$ 123,45' && await S('Data do recebimento').inputValue()===`${Y}-01-31`,'edição carrega valores e data exatos');
await money('Valor total recebido (R$)','20000'); await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(500);
c=await ctl('fin=1');
log(c.fin.receipts.find(r=>r.asset==='TEST11').amountCents===20000 && c.fin.receipts.length===2 && /Recebimento atualizado/.test(await txt('#toast')) && /R\$\s?200,00/.test(await txt('#recBody')),'edição persistida e refletida');

// excluir com confirmação
await pg.locator('.rec-row',{hasText:'MXRF11'}).click(); await sheet();
await pg.getByRole('button',{name:'Excluir'}).click();
log(await pg.isVisible('.fin-confirm') && /Só este registro será removido/.test(await txt('.fin-confirm')) && (await ctl('fin=1')).fin.receipts.length===2,'confirmação aparece e nada é excluído antes');
await pg.getByRole('button',{name:'Voltar'}).click();
log(!await pg.isVisible('.fin-confirm') && (await ctl('fin=1')).fin.receipts.length===2,'voltar cancela');
await pg.getByRole('button',{name:'Excluir'}).click(); await pg.getByRole('button',{name:'Confirmar exclusão'}).click(); await pg.waitForTimeout(500);
log((await ctl('fin=1')).fin.receipts.length===1 && /Recebimento excluído/.test(await txt('#toast')),'exclusão confirmada remove só o registro');

// totais e filtros
for (const r of [
  {id:uid(),asset:'KNRI11',receivedOn:`${Y}-01-15`,amountCents:10000,note:null},
  {id:uid(),asset:'KNRI11',receivedOn:`${Y}-03-31`,amountCents:2550,note:null},
  {id:uid(),asset:'TEST11',receivedOn:`${Y-1}-12-31`,amountCents:7000,note:'ano anterior'},
]) await post('receipts',r);
await pg.reload(); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(400);
await pg.click('.mainnav a[data-page=income]'); await pg.click('#incTabRec'); await pg.waitForTimeout(200);
log(/Total recebido em \d{4}\s*R\$\s?325,50/.test(await txt('#recBody')) && /Registros no ano\s*3/.test(await txt('#recBody')),'total do ano soma 200,00+100,00+25,50: '+(await txt('#recBody')).slice(0,140));
log(/Janeiro de \d{4}\s*R\$\s?300,00/.test(await txt('#recBody')) && /Março de \d{4}\s*R\$\s?25,50/.test(await txt('#recBody')),'totais por mês');
log(/\d{4}: R\$\s?325,50/.test(await txt('.rec-years')) && new RegExp(`${Y-1}: R\\$\\s?70,00`).test(await txt('.rec-years')),'totais por ano (31/12 não vira o ano seguinte)');
await pg.selectOption('#recAsset','KNRI11'); await pg.waitForTimeout(100);
log(/Total recebido em \d{4} · KNRI11\s*R\$\s?125,50/.test(await txt('#recBody')) && !/TEST11/.test(await txt('.rec-month')),'filtro por ativo');
await pg.selectOption('#recAsset',''); await pg.selectOption('#recYear',String(Y-1)); await pg.waitForTimeout(100);
log(/R\$\s?70,00/.test(await txt('#recBody')) && /Dezembro de/.test(await txt('#recBody')) && /31\/12/.test(await txt('.rec-month')),'filtro por ano mostra 31/12 sem deslocar');
await pg.selectOption('#recYear',String(Y));

// ocultar valores cobre lista, gráfico, rótulos e painel
await pg.click('#visBtn'); await pg.waitForTimeout(150);
const vis=await pg.evaluate(()=>{ const t=document.getElementById('incRec').innerText; const labs=[...document.querySelectorAll('#incRec [aria-label],#incRec [title]')].map(e=>(e.getAttribute('aria-label')||'')+(e.title||'')).join(' ');
  return { money:(t.match(/R\$\s?\d/g)||[]), labsMoney:/R\$\s?\d|\d,\d\d/.test(labs), bars:document.querySelectorAll('.rec-bar').length, masked:!!document.querySelector('.rec-masked') }; });
log(vis.money.length===0 && !vis.labsMoney && vis.bars===0 && vis.masked,'valores ocultos: sem R$ numérico, sem rótulos acessíveis com valor, sem barras: '+JSON.stringify(vis));
await pg.locator('.rec-row').first().click(); await sheet();
log(await S('Valor total recebido (R$)').getAttribute('type')==='password','campo de valor vira senha com valores ocultos');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
await pg.click('#visBtn'); await pg.waitForTimeout(100);
log((await pg.$$('.rec-bar')).length===12,'mostrar valores volta o gráfico');

/* ================= METAS ================= */
await pg.click('.mainnav a[data-page=goals]'); await pg.waitForTimeout(150);
log(await txt('#pageTitle')==='Metas' && /Você ainda não definiu metas/.test(await txt('#goalList')) && /Defina o objetivo da sua reserva/.test(await txt('#resOut')),'estados vazios úteis (metas e reserva)');
log(!await pg.isVisible('#goalAddBtn') && await pg.locator('#goalList .fin-empty button').count()===1 && !await pg.isVisible('#refreshBtn') && !await pg.isVisible('.lead-actions'),'Metas vazia: ação única no estado vazio; sem "Atualizar cotações" nem barra de ações vazia');
await pg.click('#goalList .fin-empty button'); await sheet();
log(/ESTIMADA da carteira, que não é valor recebido/.test(await txt('.sheet')),'painel explica patrimônio x renda estimada');
await S('Nome da meta').fill('Meta teste'); await S('Valor-alvo (R$)').fill('5000000');
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(400);
let g=(await ctl('fin=1')).fin.goals;
log(g.length===1 && g[0].targetCents===5000000 && g[0].kind==='patrimonio' && g[0].deadline===null && Number.isInteger(g[0].targetCents),'meta de patrimônio em centavos: '+JSON.stringify(g[0]));
const card=pg.locator('.goal-card').first();
log(/Objetivo\s*R\$\s?50\.000,00/.test(await card.textContent()) && /Patrimônio atual/.test(await card.textContent()) && /Meta de patrimônio/.test(await card.textContent()) && !/Prazo/.test(await card.textContent()) && /patrimônio atual das posições cadastradas/.test(await txt('#goalsMore')) && await card.locator('[role=progressbar]').count()===1,'cartão: objetivo, base e progresso');
await pg.click('#goalAddBtn'); await sheet();
await S('Tipo de meta').selectOption('renda_mensal'); await S('Nome da meta').fill('Renda 5 mil'); await S('Valor-alvo (R$)').fill('500000');
await S('Prazo (opcional)').fill('2099-12-31');
await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(400);
g=(await ctl('fin=1')).fin.goals;
const c2=pg.locator('.goal-card',{hasText:'Renda 5 mil'});
log(g.length===2 && g[0].deadline==='2099-12-31' && /Renda estimada/.test(await c2.textContent()) && /renda mensal <?b?>?estimada/.test(await pg.innerHTML('#goalsMore')) && /não é valor recebido/.test(await txt('#goalsMore')) && /Prazo: 31\/12\/2099/.test(await c2.textContent()),'meta de renda: prazo sem fuso e base explícita');
await c2.getByRole('button',{name:/Editar meta/}).click(); await sheet();
await money('Valor-alvo (R$)','600000'); await pg.click('.sheet button[type=submit]'); await pg.waitForTimeout(400);
const metaEd=(await ctl('fin=1')).fin.goals.find(x=>x.name==='Renda 5 mil');
log(metaEd.targetCents===600000,'editar meta (gravado: '+metaEd.targetCents+', campo: '+await pg.evaluate(()=>document.querySelector('.goal-card')&&document.querySelector('.goal-card').textContent.slice(0,80))+')');
await pg.locator('.goal-card',{hasText:'Meta teste'}).getByRole('button',{name:/Editar meta/}).click(); await sheet();
await pg.getByRole('button',{name:'Excluir'}).click(); await pg.getByRole('button',{name:'Confirmar exclusão'}).click(); await pg.waitForTimeout(400);
log((await ctl('fin=1')).fin.goals.length===1 && await pg.locator('.goal-card').count()===1,'excluir meta com confirmação');

/* ================= RESERVA ================= */
log(await pg.locator('#resLinkList input:checked').count()===0 && /não classifica nada como reserva sozinho/.test(await txt('#resLead')) && /liquidez/i.test(await txt('#resMore')) && !await pg.evaluate(()=>document.getElementById('resMore').open),'nada vinculado automaticamente; aviso de liquidez/adequação');
log(/liquidez, carência, vencimento e marcação a mercado/.test(await txt('#resMore')) && /pode estar baixo quando você precisar/.test(await txt('#resMore')) && !/pode estar baixo/.test(await txt('#resLinkList')),'orientações por tipo de ativo ficam numa seção só, sem repetir em cada posição');
await pg.fill('#resExpense','300000'); await pg.fill('#resMonths','6'); await pg.waitForTimeout(100);
log(/Objetivo\s*R\$\s?18\.000,00/.test(await txt('#resOut')) && /Valor vinculado\s*R\$\s?0,00/.test(await txt('#resOut')) && /Falta\s*R\$\s?18\.000,00/.test(await txt('#resOut')) && /Nenhuma posição vinculada/.test(await txt('#resOut')),'objetivo = 3.000 × 6 = 18.000, vinculado 0, falta 18.000');
await pg.locator('#resLinkList label',{hasText:'Tesouro Selic'}).locator('input').check(); await pg.waitForTimeout(100);
const linked=await txt('#resOut');
log(/Valor vinculado\s*R\$\s?[1-9]/.test(linked) && /\d+% concluído/.test(linked),'vincular posição atualiza valor vinculado e progresso: '+linked.slice(0,120));
await ctl('failFinWrite=1'); await pg.click('#resSave'); await pg.waitForTimeout(400);
log(/servidor não conseguiu|Não foi possível/.test(await txt('#resStatus')) && await pg.inputValue('#resExpense')==='R$ 3.000,00' && (await ctl('fin=1')).fin.reserve===null,'falha ao salvar: mensagem, formulário preservado, nada gravado');
await ctl('failFinWrite=0'); await pg.click('#resSave'); await pg.waitForTimeout(400);
const rs=(await ctl('fin=1')).fin.reserve;
log(rs && rs.monthlyExpenseCents===300000 && rs.months===6 && rs.linkedPositionIds.length===1 && rs.linkedPositionIds[0]==='r1' && /Reserva salva/.test(await txt('#resStatus')),'reserva salva em centavos com vínculo escolhido: '+JSON.stringify(rs));
await pg.fill('#resMonths','0'); await pg.click('#resSave');
log(/de 1 a 60/.test(await txt('#resStatus')) && await pg.getAttribute('#resMonths','aria-invalid')==='true','meses inválidos bloqueados');
await pg.fill('#resMonths','6');

// ocultar valores em metas e reserva
await pg.click('#visBtn'); await pg.waitForTimeout(150);
const hv=await pg.evaluate(()=>({ money:(document.getElementById('pg-goals').innerText.match(/R\$\s?\d/g)||[]), bars:document.querySelectorAll('#pg-goals [role=progressbar]').length, masked:document.querySelectorAll('#pg-goals .progress.masked').length, pct:/\d+% concluído/.test(document.getElementById('pg-goals').innerText), type:document.getElementById('resExpense').type }));
log(hv.money.length===0 && hv.bars===0 && hv.masked>=2 && !hv.pct && hv.type==='password','metas/reserva ocultas: sem R$, sem barras reveladoras nem porcentagem, campo vira senha: '+JSON.stringify(hv));
await pg.click('#visBtn');

// remover reserva
await pg.click('#resRemove'); await sheet(); await pg.locator('.sheet').getByRole('button',{name:'Remover reserva'}).click(); await pg.waitForTimeout(400);
log((await ctl('fin=1')).fin.reserve===null && /Defina o objetivo/.test(await txt('#resOut')),'remover reserva com confirmação volta ao estado vazio');

/* ================= falha de carregamento e isolamento visual ================= */
await ctl('failFinLoad=1');
await pg.reload(); await pg.waitForSelector('#app:not(.hide)'); await pg.waitForTimeout(500);
await pg.click('.mainnav a[data-page=goals]');
log(await pg.isVisible('#goalsLoadErr') && await pg.isDisabled('#goalAddBtn') && await pg.isDisabled('#resSave'),'falha ao carregar: aviso, criação desabilitada (não finge lista vazia)');
await pg.click('.mainnav a[data-page=overview]');
log(await txt('#heroValue')===hero0,'o restante do app segue funcionando');
await ctl('failFinLoad=0'); await pg.click('.mainnav a[data-page=goals]'); await pg.click('#goalsRetry'); await pg.waitForTimeout(500);
log(!await pg.isVisible('#goalsLoadErr') && await pg.locator('.goal-card').count()===1,'tentar de novo carrega as metas');

log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br.close(); srv.kill();
process.exit(fails?1:0);
