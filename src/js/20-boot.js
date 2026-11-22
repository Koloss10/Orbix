/* ---------- старт ---------- */
applyTheme();mnuR();
$('#home-aw').hidden=true;$('#home-eq').hidden=true;SET.brand='orbix';$('#brl').closest('.card').hidden=true;applyTheme();mnuR();
MD.ip=mdInit();pfr();tfilter();favs();feedR();lst();go('ov');accR();boot();
async function boot(){try{await MD.ip}finally{splashEnd()}accR();mnuR();
$('#fp').innerHTML=PK.map(k=>`<option value="${k}">${k}</option>`).join('');{const a=$('#awp'),v=a.value;a.innerHTML=PK.map(k=>`<option value="${k}">${k}</option>`).join('');a.value=PAIRS[v]?v:PAIRS['BTC/USDT']?'BTC/USDT':PK[0]}$('#pl').innerHTML=PK.map(k=>`<option value="${k}">`).join('');if(!PAIRS[MKP])MKP=PK[0];
const saved=ld('zorya3',[]).filter(x=>x&&x.g),ps=[...new Set(saved.map(x=>x.g.pair).filter(p=>PAIRS[p]))];
$('#tops').textContent=MD.mode==='live'?`Завантажую реальні дані ${MD.src}…`:'Біржі недоступні, працюю на демо-даних.';
try{await need('BTC/USDT')}catch(e){}for(const x of saved)if(PAIRS[x.g.pair])try{await need(dk(x.g),hrsFor(x.t0,x.g.tf))}catch(e){}
for(const x of saved){if(PAIRS[x.g.pair]&&ready(dk(x.g))){const b=mk(x.g,x.ex,x.on!==false,{t0:x.t0,sp:x.sp,tn:x.tn,srv:x.srv,srvEx:x.srvEx,man:x.man,cmd:x.cmd,gh:x.gh});b.rid=x.rid;b.pid=x.pid;if(x.demo)b.demo=1}else KEEP.push(x)}
BOOT=1;{const xs=new Set(bots.filter(x=>x.tn).map(x=>x.srvEx||TN.ex||'bybit'));if(bots.some(x=>x.g.fut))xs.add(TN.ex||'bybit');for(const ex of xs)xRules(ex).then(m=>{if(m&&(CUR==='bots'||CUR==='ov'))lst()}).catch(()=>{})}sloc();lst();favs();shareApply();if(CUR==='bd')pv();if(CUR==='mk')mkt();
cloudStart();setTimeout(()=>topJob(0),400);setInterval(()=>topJob(0),60000);
if(MD.mode==='live'){setInterval(poll,15000);setInterval(()=>{if(CUR==='mk')tkRefresh().then(mkt)},30000)}else setInterval(tick,1500)}
/* дані пари довантажились після запиту «наперед» — оновити видимий екран */
function onData(p){upd();if(CUR==='bd')pv();if(CUR==='mk')mkt()}

