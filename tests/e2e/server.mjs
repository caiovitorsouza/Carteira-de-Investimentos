// Servidor de TESTE: serve public/ e simula a API com dados fictícios (nenhum dado real).
// Controle via /__ctl?seed=1&failSave=1&delay=800 ... — ver README.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new URL('../../public/', import.meta.url));
const flags={ failLoad:false, failSave:false, failRefresh:false, delay:0, logged:false, failFinLoad:false, failFinWrite:false, finDelay:0 };
let version=1, saves=0;
const today=new Date(); const y=today.getFullYear(), m=String(today.getMonth()+1).padStart(2,'0');
const nm=today.getMonth()+2>12?`${y+1}-01`:`${y}-${String(today.getMonth()+2).padStart(2,'0')}`;
const SEED=()=>JSON.parse(JSON.stringify(SEED_DATA));
const SEED_DATA=[
 {id:'a1',kind:'fii',ticker:'TEST11',name:'Fundo Teste',segment:'tijolo_log',q:100,c:100,a:102,noQuote:false,d:0.8,dpag:`${y}-${m}-15T00:00:00.000Z`,quotedAt:new Date(Date.now()-5*60e3).toISOString()},
 {id:'a2',kind:'fii',ticker:'DEMO11',name:'Fundo Demo',segment:'papel',q:50,c:10,a:9.5,noQuote:false,d:0.1,dpag:`${y}-${m}-15`,quotedAt:new Date(Date.now()-3*864e5).toISOString()},
 {id:'a3',kind:'fii',ticker:'SEMD11',name:'Sem data',segment:'papel',q:30,c:10,a:10,noQuote:false,d:0.09,dpag:null,quotedAt:null},
 {id:'a4',kind:'fii',ticker:'INVL11',name:'Data inválida',segment:'papel',q:20,c:10,a:10,noQuote:false,d:0.1,dpag:'2026-02-31',quotedAt:new Date().toISOString()},
 {id:'a5',kind:'acao',ticker:'FUTR3',name:'Outro mês',q:10,c:20,a:21,noQuote:false,d:0,dpag:`${nm}-03`,quotedAt:new Date().toISOString()},
 {id:'a6',kind:'fii',ticker:'PASS11',name:'Mês passado',segment:'papel',q:10,c:100,a:100,noQuote:false,d:1,dpag:'2026-01-10',quotedAt:new Date().toISOString()},
 {id:'r1',kind:'selic',nome:'Tesouro Selic',ap:1000,dt:'2026-01-02'},
];
let positions=SEED();
let empty=false;
// dados financeiros fictícios (proventos recebidos, metas, reserva, premissas): um único usuário de teste
let fin={receipts:[],goals:[],reserve:null,simulators:{}}; const finLog=[]; // finLog = cada escrita recebida
const byId=(a,id)=>a.findIndex(x=>x.id===id);
const puts=[]; // corpo de cada PUT recebido
const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));};
const body=(req)=>new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch{r({})}})});
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'); const p=u.pathname;
  if(p==='/__ctl'){ for(const [k,v] of u.searchParams){ if(k==='empty') empty=v==='1'; else if(k==='reset'){version=1;saves=0;} else if(k==='seed'){positions=SEED();version=1;saves=0;puts.length=0;fin={receipts:[],goals:[],reserve:null,simulators:{}};finLog.length=0;Object.assign(flags,{failLoad:false,failSave:false,failRefresh:false,delay:0,failFinLoad:false,failFinWrite:false,finDelay:0});} else if(k==='only'){positions=SEED().filter(p=>p.id===v);version=1;saves=0;puts.length=0;} else flags[k]= v==='1'?true:v==='0'?false:Number(v);} return send(res,200,{flags,saves,version,empty,positions:positions.length,puts:u.searchParams.has('puts')?puts:puts.length,data:u.searchParams.has('data')?positions:undefined,fin:u.searchParams.has('fin')?fin:undefined,finLog:u.searchParams.has('fin')?finLog:finLog.length}); }
  if(p.startsWith('/api/')){
    if(flags.delay) await new Promise(r=>setTimeout(r,flags.delay));
    if(p==='/api/auth/me') return flags.logged?send(res,200,{user:{email:'t@t.com'}}):send(res,401,{error:'nao_autenticado'});
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
  const ext=path.extname(f); res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[ext]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('up'));
