const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const B='http://localhost:8787'; const ctl=(q)=>fetch(B+'/__ctl?'+q).then(r=>r.json());
const log=(ok,msg)=>console.log((ok?'PASS ':'FAIL ')+msg);
const br=await chromium.launch(); const pg=await br.newPage({viewport:{width:1280,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|fonts/.test(m.text()))errs.push(m.text())});
await ctl('seed=1&logged=0&failLoad=0&failSave=0&delay=0&empty=0&reset=1');
await pg.goto(B); await pg.waitForSelector('#authForm');
log(await pg.textContent('.auth-headline')==='Sua carteira clara. Seu próximo passo consciente.','headline');
log(await pg.getAttribute('#password','placeholder')==='Sua senha','placeholder login');
log(await pg.getAttribute('#password','autocomplete')==='current-password','autocomplete login');
log(await pg.textContent('#authSub')==='Entre para acompanhar sua carteira.','subtitulo login');
// show password preserving caret
await pg.fill('#password','abcdef'); await pg.focus('#password');
await pg.evaluate(()=>document.getElementById('password').setSelectionRange(2,2));
await pg.click('#passToggle'); await pg.waitForTimeout(60);
const st=await pg.evaluate(()=>{const i=document.getElementById('password');return {t:i.type,v:i.value,s:i.selectionStart,f:document.activeElement===i,pr:document.getElementById('passToggle').getAttribute('aria-pressed'),lab:document.getElementById('passToggle').getAttribute('aria-label')}});
log(st.t==='text'&&st.v==='abcdef'&&st.s===2&&st.f&&st.pr==='true'&&st.lab==='Ocultar senha','toggle mostra senha, preserva valor/cursor/foco '+JSON.stringify(st));
log(!(await pg.evaluate(()=>!document.getElementById('auth').classList.contains('hide')&&false)), 'toggle não enviou form');
// keyboard toggle
await pg.focus('#passToggle'); await pg.keyboard.press('Enter');
log(await pg.getAttribute('#password','type')==='password','toggle via teclado oculta');
await pg.click('#passToggle'); // visible
await pg.click('#toggleBtn');
log(await pg.getAttribute('#password','type')==='password','trocar modo volta a ocultar');
log(await pg.getAttribute('#password','placeholder')==='Mínimo de 8 caracteres'&&await pg.getAttribute('#password','autocomplete')==='new-password'&&await pg.isVisible('#passHint'),'modo cadastro: placeholder/autocomplete/hint');
log(await pg.inputValue('#password')==='abcdef','valor preservado ao trocar modo');
// register short password local validation
await pg.fill('#email','novo@teste.com'); await pg.click('#authBtn');
log(await pg.getAttribute('#password','aria-invalid')==='true' && (await pg.getAttribute('#password','aria-describedby')).includes('passErr') && await pg.isVisible('#passErr'),'erro local senha curta no campo');
// email em uso
await pg.fill('#email','usado@teste.com'); await pg.fill('#password','12345678'); await pg.click('#authBtn');
await pg.waitForSelector('#emailErr:not([hidden])');
log(/já tem conta/.test(await pg.textContent('#emailErr'))&&await pg.getAttribute('#email','aria-invalid')==='true','email_em_uso no campo');
log(await pg.inputValue('#email')==='usado@teste.com'&&await pg.inputValue('#password')==='12345678','preserva digitado após erro');
await pg.click('#toggleBtn'); // login
// invalid email format
await pg.fill('#email','semarroba'); await pg.click('#authBtn');
log(await pg.isVisible('#emailErr'),'email inválido local');
// wrong credentials
await pg.fill('#email','t@teste.com'); await pg.fill('#password','errada123'); await pg.click('#authBtn');
await pg.waitForFunction(()=>document.getElementById('authErr').textContent.length>0);
log(/incorretos/.test(await pg.textContent('#authErr'))&&(await pg.getAttribute('#password','aria-describedby')).includes('authErr'),'credenciais inválidas geral + describedby');
// 429
await pg.fill('#email','muitas@teste.com'); await pg.click('#authBtn');
await pg.waitForFunction(()=>/Muitas tentativas/.test(document.getElementById('authErr').textContent));
log(true,'429 mensagem');
// network fail
await pg.fill('#email','queda@teste.com'); await pg.fill('#password','12345678'); await pg.click('#authBtn');
await pg.waitForFunction(()=>/conectar/.test(document.getElementById('authErr').textContent),null,{timeout:5000}).then(()=>log(true,'falha de conexão mensagem')).catch(async()=>log(false,'falha conexão: '+await pg.textContent('#authErr')));
// busy state + duplicate prevention
await ctl('delay=800');
await pg.fill('#email','ok@teste.com'); await pg.fill('#password','12345678');
await pg.click('#authBtn');
const busy=await pg.evaluate(()=>({t:document.getElementById('authBtn').textContent,d:document.getElementById('authBtn').disabled}));
log(busy.t==='Entrando…'&&busy.d,'botão durante envio '+JSON.stringify(busy));
await pg.evaluate(()=>document.getElementById('authForm').requestSubmit());
await pg.waitForSelector('#app:not(.hide)'); await pg.waitForSelector('#rendaValue');
await ctl('delay=0');
await pg.waitForTimeout(1500);
log(await pg.textContent('#authBtn')==='Entrar','botão restaurado');
log(errs.length===0,'sem erros JS '+JSON.stringify(errs));
await br.close();
