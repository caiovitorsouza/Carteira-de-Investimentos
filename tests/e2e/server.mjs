// Servidor de TESTE: serve public/ e simula a API com dados fictícios (nenhum dado real).
// Controle via /__ctl?seed=1&failSave=1&delay=800 ... — ver README.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new URL('../../public/', import.meta.url));
const flags={ failLoad:false, failSave:false, failRefresh:false, delay:0, logged:false, failFinLoad:false, failFinWrite:false, finDelay:0 };
let version=1, saves=0;
const today=new Date(); const y=today.getFullYear(), m=String(today.getMonth()+1).padStart(2,'0');
const nm=today.getMonth()+2>12?`${y+1}-01`:`${y}-${String(today.getMonth()+2).padStart(2,'0')}`;
const SEED=()=>JSON.parse(JSON.stringify(SEED_DATA)).map(p=>p.ticker?{...p,classe:p.kind}:p);
const SEED_DATA=[
 {id:'a1',kind:'fii',ticker:'TEST11',name:'Fundo Teste',logo:'/__test-logo/TEST11.svg',segment:'tijolo_log',q:100,c:100,a:102,noQuote:false,d:0.8,dpag:`${y}-${m}-15T00:00:00.000Z`,quotedAt:new Date(Date.now()-5*60e3).toISOString()},
 {id:'a2',kind:'fii',ticker:'DEMO11',name:'Fundo Demo',logo:'https://icons.brapi.dev/icons/OUTRO11.svg',segment:'papel',q:50,c:10,a:9.5,noQuote:false,d:0.1,dpag:`${y}-${m}-15`,quotedAt:new Date(Date.now()-3*864e5).toISOString()},
 {id:'a3',kind:'fii',ticker:'SEMD11',name:'Sem data',segment:'papel',q:30,c:10,a:10,noQuote:false,d:0.09,dpag:null,quotedAt:null},
 {id:'a4',kind:'fii',ticker:'INVL11',name:'Data inválida',logo:'/__test-logo/INVL11.svg',segment:'papel',q:20,c:10,a:10,noQuote:false,d:0.1,dpag:'2026-02-31',quotedAt:new Date().toISOString()},
 {id:'a5',kind:'acao',ticker:'FUTR3',name:'Outro mês',q:10,c:20,a:21,noQuote:false,d:0,dpag:`${nm}-03`,quotedAt:new Date().toISOString()},
 {id:'a6',kind:'fii',ticker:'PASS11',name:'Mês passado',logo:'https://icons.brapi.dev/icons/BRAPI.svg',segment:'papel',q:10,c:100,a:100,noQuote:false,d:1,dpag:'2026-01-10',quotedAt:new Date().toISOString()},
 {id:'r1',kind:'selic',nome:'Tesouro Selic',ap:1000,dt:'2026-01-02'},
];
// Carteira fictícia com N ativos: classes misturadas, nomes longos, valores grandes, sem cotação e sem nome.
const MANY=(n)=>Array.from({length:n},(_,i)=>{ const k=i%5, id='m'+i, tk=(c)=>`${c}${String.fromCharCode(65+i%26)}${String.fromCharCode(65+(i>>3)%26)}${k===1?'11':'3'}`;
  if(k===0) return {id,kind:'acao',ticker:tk('AC'),name:i%7===0?'Companhia Fictícia de Participações e Empreendimentos Imobiliários Reunidos S.A.':`Empresa Fictícia ${i}`,q:i*37+1,c:12.34+i,a:i%9===0?null:13.1+i,noQuote:i%9===0,d:0,quotedAt:new Date().toISOString()};
  if(k===1) return {id,kind:'fii',ticker:tk('FI'),name:i%6===0?null:`Fundo Fictício ${i}`,segment:'papel',q:i*3+1,c:98+i/10,a:97+i/10,noQuote:false,d:0.9,quotedAt:new Date().toISOString()};
  if(k===2) return {id,kind:'acao',ticker:tk('GR'),name:`Grande Fictícia ${i}`,q:250000+i,c:41.5,a:43.25,noQuote:false,d:0,quotedAt:new Date().toISOString()};
  if(k===3) return {id,kind:'cdb',nome:`CDB Banco Fictício ${i}`,ap:1000+i*250,taxa:110,dt:'2025-03-10'};
  return {id,kind:'selic',nome:'Tesouro Selic',ap:500+i*10,dt:'2025-06-01'}; });
// Recebimentos fictícios: dia 1 e hoje do mês atual, mês anterior inteiro, ano anterior e um ativo fora da carteira.
const RECS=()=>{ const t=new Date(), Y=t.getFullYear(), M=t.getMonth()+1, D=t.getDate(); const p2=(n)=>String(n).padStart(2,'0');
  const pm=M===1?12:M-1, py=M===1?Y-1:Y, dim=new Date(py,pm,0).getDate();
  return [
    {id:'rc1',asset:'TEST11',receivedOn:`${Y}-${p2(M)}-01`,amountCents:7800,note:'rendimento do mês'},
    {id:'rc2',asset:'KNRI11',receivedOn:`${Y}-${p2(M)}-${p2(D)}`,amountCents:4550,note:null},
    {id:'rc3',asset:'TEST11',receivedOn:`${py}-${p2(pm)}-01`,amountCents:7600,note:null},
    {id:'rc4',asset:'DEMO11',receivedOn:`${py}-${p2(pm)}-${p2(Math.min(D,dim))}`,amountCents:500,note:null},
    {id:'rc5',asset:'DEMO11',receivedOn:`${py}-${p2(pm)}-${p2(dim)}`,amountCents:510,note:'fim do mês'},
    {id:'rc6',asset:'TEST11',receivedOn:`${Y-1}-12-15`,amountCents:7000,note:'ano anterior'},
  ]; };
// Lista de interesse fictícia: ativo com cotação na fonte (WISH11), ativo da carteira (TEST11),
// ativo sem cotação com valor manual datado (MANU3) e renda fixa por valor.
const WL=()=>[
  {id:'00000000-0000-4000-8000-0000000000a1',stage:'comprar',asset:'WISH11',kind:'fii',name:'Fundo Desejado',reason:'Diversificar em logística',notes:'Conferir vacância no relatório.',priority:1,targetPriceCents:950,plannedAmountCents:100000,plannedQuantity:null,manualPriceCents:null,manualPriceOn:null},
  {id:'00000000-0000-4000-8000-0000000000a2',stage:'comprar',asset:'TEST11',kind:'fii',name:'Fundo Teste',reason:'Aumentar posição',notes:null,priority:2,targetPriceCents:null,plannedAmountCents:null,plannedQuantity:10,manualPriceCents:null,manualPriceOn:null},
  {id:'00000000-0000-4000-8000-0000000000a3',stage:'acompanhar',asset:'MANU3',kind:'acao',name:null,reason:'Acompanhar resultados',notes:null,priority:null,targetPriceCents:2000,plannedAmountCents:null,plannedQuantity:5,manualPriceCents:2150,manualPriceOn:'2026-10-01'},
  {id:'00000000-0000-4000-8000-0000000000a4',stage:'acompanhar',asset:'Tesouro IPCA+ 2035',kind:'rf',name:null,reason:null,notes:null,priority:3,targetPriceCents:null,plannedAmountCents:50000,plannedQuantity:null,manualPriceCents:null,manualPriceOn:null},
];
let watch=[]; const watchLog=[];
let positions=SEED();
let empty=false;
// dados financeiros fictícios (proventos recebidos, metas, reserva, premissas): um único usuário de teste
let fin={receipts:[],goals:[],reserve:null,simulators:{}}; const finLog=[]; // finLog = cada escrita recebida
const byId=(a,id)=>a.findIndex(x=>x.id===id);
const puts=[]; // corpo de cada PUT recebido
// charset explícito: clientes como o PowerShell 5.1 leem JSON sem charset como Latin-1 ("Data invÃ¡lida")
const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
const body=(req)=>new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch{r({})}})});
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'); const p=u.pathname;
  if(p==='/__ctl'){ for(const [k,v] of u.searchParams){ if(k==='empty') empty=v==='1'; else if(k==='reset'){version=1;saves=0;} else if(k==='seed'){positions=SEED();version=1;saves=0;puts.length=0;fin={receipts:[],goals:[],reserve:null,simulators:{}};finLog.length=0;watch=[];watchLog.length=0;Object.assign(flags,{failLoad:false,failSave:false,failRefresh:false,delay:0,failFinLoad:false,failFinWrite:false,finDelay:0,failWatchLoad:false,failWatchWrite:false,watchDelay:0});} else if(k==='recs'){fin.receipts=v==='1'?RECS():[];} else if(k==='wl'){watch=v==='1'?WL():[];watchLog.length=0;} else if(k==='many'){positions=MANY(Number(v));version=1;saves=0;puts.length=0;} else if(k==='only'){positions=SEED().filter(p=>p.id===v);version=1;saves=0;puts.length=0;} else flags[k]= v==='1'?true:v==='0'?false:Number(v);} return send(res,200,{flags,saves,version,empty,positions:positions.length,puts:u.searchParams.has('puts')?puts:puts.length,data:u.searchParams.has('data')?positions:undefined,fin:u.searchParams.has('fin')?fin:undefined,finLog:u.searchParams.has('fin')?finLog:finLog.length,watch:u.searchParams.has('watch')?watch:watch.length,watchLog:u.searchParams.has('watch')?watchLog:watchLog.length}); }
  // logos fictícios: TEST11 carrega; qualquer outro nome responde 404 (simula falha de carregamento)
  if(p.startsWith('/__test-logo/')){ if(p==='/__test-logo/TEST11.svg'){ res.writeHead(200,{'content-type':'image/svg+xml'}); return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#3a6ea5"/><circle cx="16" cy="16" r="8" fill="#fff"/></svg>'); } res.writeHead(404); return res.end(); }
  if(p.startsWith('/api/')){
    if(flags.delay) await new Promise(r=>setTimeout(r,flags.delay));
    if(p==='/api/auth/me') return flags.failAuth?send(res,500,{error:'falha_teste'}):flags.logged?send(res,200,{user:{email:'t@t.com'}}):send(res,401,{error:'nao_autenticado'});
    if(p==='/api/auth/login'||p==='/api/auth/register'){ const b=await body(req);
      if(b.email==='muitas@teste.com') return send(res,429,{error:'muitas_tentativas'});
      if(b.email==='usado@teste.com'&&p.endsWith('register')) return send(res,409,{error:'email_em_uso'});
      if(b.password==='errada123') return send(res,401,{error:'credenciais_invalidas'});
      if(b.email==='queda@teste.com'){ req.socket.destroy(); return; }
      flags.logged=true; return send(res,200,{ok:true}); }
    if(p==='/api/auth/logout'){flags.logged=false;return send(res,200,{});}
    if(p==='/api/portfolio'&&req.method==='GET'){ if(flags.failLoad) return send(res,500,{error:'x'}); return send(res,200,{version,positions:empty?[]:positions,profile:null,legacy:null,settings:null,hist:[]}); }
    if(p==='/api/portfolio'&&req.method==='PUT'){ const b=await body(req); puts.push({at:Date.now(),version:b.version,fail:flags.failSave,positions:b.positions}); if(flags.failSave) return send(res,500,{error:'x'}); if(b.version!==version) return send(res,409,{error:'conflito'}); version++; saves++; if(!empty) positions=b.positions; return send(res,200,{version}); }
    if(p==='/api/portfolio/refresh'){ if(flags.failRefresh) return send(res,502,{error:'x'}); return send(res,200,{tickers:6,ok:5,failed:1}); }
    if(p==='/api/portfolio/snapshot') return send(res,200,{});
    // cotação fictícia: só WISH11 existe na "fonte"; os demais tickers respondem 404
    if(p.startsWith('/api/market/quote/')){ const t=decodeURIComponent(p.split('/').pop()); return t==='WISH11'?send(res,200,{ticker:t,price:10.25,fetched_at:new Date(Date.now()-20*60e3).toISOString()}):send(res,404,{error:'ticker_nao_encontrado'}); }
    if(p.startsWith('/api/watchlist')){
      if(flags.watchDelay) await new Promise(r=>setTimeout(r,flags.watchDelay));
      const m=req.method, id=p.split('/')[3];
      if(m==='GET'){ if(flags.failWatchLoad) return send(res,500,{error:'x'}); return send(res,200,{items:watch}); }
      const b=(m==='POST'||m==='PUT')?await body(req):{};
      watchLog.push({m,p,at:Date.now(),fail:flags.failWatchWrite,body:b});
      if(flags.failWatchWrite) return send(res,500,{error:'x'});
      if(m==='POST'){ const i=byId(watch,b.id); if(i>=0) return send(res,200,{item:watch[i],created:false}); const row={...b}; if(/^[A-Za-z]{4}\d{1,2}$/.test(row.asset)) row.asset=row.asset.toUpperCase(); watch.push(row); return send(res,201,{item:row,created:true}); }
      if(m==='PUT'){ const i=byId(watch,id); if(i<0) return send(res,404,{error:'nao_encontrado'}); watch[i]={...b,id}; return send(res,200,{item:watch[i]}); }
      if(m==='DELETE'){ const i=byId(watch,id); if(i<0) return send(res,404,{error:'nao_encontrado'}); watch.splice(i,1); return send(res,200,{ok:true}); }
    }
    if(p.startsWith('/api/finance')){
      if(flags.finDelay) await new Promise(r=>setTimeout(r,flags.finDelay));
      const m=req.method, parts=p.split('/').filter(Boolean); // api finance <rec> <id>
      if(m==='GET'&&parts.length===2){ if(flags.failFinLoad) return send(res,500,{error:'x'}); return send(res,200,fin); }
      const b=(m==='POST'||m==='PUT')?await body(req):{};
      finLog.push({m,p,at:Date.now(),fail:flags.failFinWrite,body:b});
      if(flags.failFinWrite) return send(res,500,{error:'x'});
      const kind=parts[2], id=parts[3];
      if(kind==='receipts'||kind==='goals'){
        const list=kind==='receipts'?fin.receipts:fin.goals, key=kind==='receipts'?'receipt':'goal';
        if(m==='POST'){ const i=byId(list,b.id); const row={...b}; if(i>=0) return send(res,200,{[key]:list[i],created:false}); list.unshift(row); return send(res,201,{[key]:row,created:true}); }
        if(m==='PUT'){ const i=byId(list,id); if(i<0) return send(res,404,{error:'nao_encontrado'}); list[i]={...b,id}; return send(res,200,{[key]:list[i]}); }
        if(m==='DELETE'){ const i=byId(list,id); if(i<0) return send(res,404,{error:'nao_encontrado'}); list.splice(i,1); return send(res,200,{ok:true}); }
      }
      if(kind==='reserve'){
        if(m==='PUT'){ fin.reserve={monthlyExpenseCents:b.monthlyExpenseCents,months:b.months,linkedPositionIds:b.linkedPositionIds||[]}; return send(res,200,{reserve:fin.reserve}); }
        if(m==='DELETE'){ if(!fin.reserve) return send(res,404,{error:'nao_encontrado'}); fin.reserve=null; return send(res,200,{ok:true}); }
      }
      if(kind==='simulators'){
        if(m==='PUT'){ fin.simulators[id]=b; return send(res,200,{key:id,data:b}); }
        if(m==='DELETE'){ delete fin.simulators[id]; return send(res,200,{ok:true}); }
      }
      return send(res,404,{error:'nf'});
    }
    return send(res,404,{error:'nf'});
  }
  let f=path.join(ROOT,p==='/'?'index.html':p); if(!fs.existsSync(f)) f=path.join(ROOT,'index.html');
  const ext=path.extname(f); res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[ext]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('up'));
