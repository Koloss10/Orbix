/* ---------- ринкові дані: реальні свічки з бірж, демо як запасний варіант ---------- */
const H1=36e5,SYN={};
function synth(k){if(SYN[k])return SYN[k];const P=PAIRS[pairOf(k)],R=rng(P.s);P.c=P.a=P.p;const a=Array.from({length:N},()=>nextC(P,R)),b=Math.floor(Date.now()/H1)*H1-N*H1;a.forEach((c,i)=>c.t=b+i*H1);return SYN[k]=a}
const DT={},MD={xflt:{},flt:{},flterr:'',mode:'init',src:'',base:'',tk:{},live:{},load:{},err:'',fut:0,fsrc:'',fbase:'',fk:'',ftk:{},fset:null,fr:{},ferr:''};
const D=new Proxy(DT,{get(t,k){if(typeof k!=='string'||!PAIRS[pairOf(k)])return t[k];if(t[k])return t[k];if(MD.mode==='demo')return t[k]=synth(k);need(k).then(()=>onData(k)).catch(()=>{});return synth(k)}});
const ready=p=>MD.mode==='demo'||!!DT[p];
const hist=p=>{const a=D[p];if(!a)throw new Error('невідома пара '+p);return a};
const SRCS=[{n:'Binance',b:'https://api.binance.com',k:'bn'},{n:'Binance',b:'https://data-api.binance.vision',k:'bn'},{n:'Bybit',b:'https://api.bybit.com',k:'by'}];
/* ф'ючерси USDⓈ-M / linear: свічки, mark price, funding */
const FSRCS=[{n:'Binance Futures',b:'https://fapi.binance.com',k:'bn'},{n:'Bybit',b:'https://api.bybit.com',k:'by'}];
async function jget(u,ms=15000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}
const sym=p=>p.replace('/','');
/* ключ даних: 'BTC/USDT' — спот, 'BTC/USDT@F' — ф'ючерс (якщо ф'ючерсні дані доступні для пари) */
const FK='@F',isF=k=>typeof k==='string'&&k.endsWith(FK),pairOf=k=>isF(k)?k.slice(0,-FK.length):k;
const dk=g=>g&&g.fut&&MD.fut&&MD.fset&&MD.fset.has(g.pair)?g.pair+FK:g&&g.pair;
const mkLbl=k=>isF(k)?'ф\'ючерси '+MD.fsrc:'спот '+(MD.src||'');
const withMark=(c,m)=>{if(m){c.ml=+m[3];c.mh=+m[2]}return c};
/* свічки 1г у порядку зростання; lim до 1000; end — час відкриття останньої потрібної свічки */
async function kl(k,{end,start,lim=1000}={}){const s=sym(pairOf(k)),bc=r=>{const c={t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]};if(r.length>9&&isFinite(+r[9]))c.bv=+r[9];if(r.length>9&&isFinite(+r[8]))c.nt=+r[8];return c};
if(isF(k)){if(MD.fk==='by'){const q=`category=linear&symbol=${s}&interval=60&limit=${lim}${end?'&end='+end:''}${start?'&start='+start:''}`;
const[j,m]=await Promise.all([jget(`${MD.fbase}/v5/market/kline?${q}`),jget(`${MD.fbase}/v5/market/mark-price-kline?${q}`).catch(()=>null)]);if(j.retCode)throw new Error(j.retMsg||'Bybit');
const mm=new Map((m&&m.result&&m.result.list||[]).map(r=>[+r[0],r]));return(j.result.list||[]).map(r=>withMark(bc(r),mm.get(+r[0]))).reverse()}
const q=`symbol=${s}&interval=1h&limit=${lim}${end?'&endTime='+end:''}${start?'&startTime='+start:''}`;
const[j,m]=await Promise.all([jget(`${MD.fbase}/fapi/v1/klines?${q}`),jget(`${MD.fbase}/fapi/v1/markPriceKlines?${q}`).catch(()=>null)]);
const mm=new Map((m||[]).map(r=>[+r[0],r]));return j.map(r=>withMark(bc(r),mm.get(+r[0])))}
if(MD.k==='by'){const j=await jget(`${MD.base}/v5/market/kline?category=spot&symbol=${s}&interval=60&limit=${lim}${end?'&end='+end:''}${start?'&start='+start:''}`);if(j.retCode)throw new Error(j.retMsg||'Bybit');return(j.result.list||[]).map(bc).reverse()}
const j=await jget(`${MD.base}/api/v3/klines?symbol=${s}&interval=1h&limit=${lim}${end?'&endTime='+end:''}${start?'&startTime='+start:''}`);return j.map(bc)}
/* історія funding rate пари (події кожні 8 год) */
const frOf=p=>MD.fr&&MD.fr[p]||null;
async function frLoad(p){if(!MD.fut)return;const key='fr:'+MD.fk+':'+p,s=sym(p),now=Date.now();let F=MD.fr[p]||(await IDB.get(key))||[];
const from=F.length?F[F.length-1].t+1:now-420*864e5,seen=new Set(F.map(x=>x.t)),add=a=>{for(const x of a)if(isFinite(x.r)&&!seen.has(x.t)){F.push(x);seen.add(x.t)}};
if(MD.fk==='by'){let end=now;for(let g=0;g<15;g++){const j=await jget(`${MD.fbase}/v5/market/funding/history?category=linear&symbol=${s}&limit=200&endTime=${end}`);const L=(j.result&&j.result.list||[]).map(r=>({t:+r.fundingRateTimestamp,r:+r.fundingRate}));add(L.filter(x=>x.t>=from));if(L.length<200||L[L.length-1].t<=from)break;end=L[L.length-1].t-1}}
else{let st=from;for(let g=0;g<15;g++){const j=await jget(`${MD.fbase}/fapi/v1/fundingRate?symbol=${s}&startTime=${st}&limit=1000`);const L=j.map(r=>({t:+r.fundingTime,r:+r.fundingRate}));add(L);if(L.length<1000)break;st=L[L.length-1].t+1}}
F.sort((a,b)=>a.t-b.t);MD.fr[p]=F;IDB.set(key,F);return F}
const IDB=(()=>{let db=null;const open=()=>db||(db=new Promise((res,rej)=>{const r=indexedDB.open('orbix-md',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
return{get:async k=>{try{const d=await open();return await new Promise(r=>{const q=d.transaction('k').objectStore('k').get(k);q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null)})}catch(e){return null}},
set:async(k,v)=>{try{const d=await open();d.transaction('k','readwrite').objectStore('k').put(v,k)}catch(e){}}}})();
const pack1=a=>({t:a.map(c=>c.t),o:a.map(c=>c.o),h:a.map(c=>c.h),l:a.map(c=>c.l),c:a.map(c=>c.c),v:a.map(c=>c.v),ml:a.map(c=>c.ml),mh:a.map(c=>c.mh),bv:a.map(c=>c.bv),nt:a.map(c=>c.nt)});
const unpack1=s=>s&&s.t?s.t.map((t,i)=>{const c={t,o:s.o[i],h:s.h[i],l:s.l[i],c:s.c[i],v:s.v[i]};if(s.ml&&s.ml[i]!=null){c.ml=s.ml[i];c.mh=s.mh[i]}if(s.bv&&s.bv[i]!=null)c.bv=s.bv[i];if(s.nt&&s.nt[i]!=null)c.nt=s.nt[i];return c}):[];
/* розділяє закриті свічки й поточну (незакриту) */
function split(p,a){const now=Date.now();if(a.length&&a[a.length-1].t+H1>now)MD.live[p]=a.pop();return a}
async function load1(p,hours){const key=(isF(p)?'f'+MD.fk:MD.k)+':'+p;let a=DT[p]?DT[p].slice():unpack1(await IDB.get(key));
if(a.length){for(let g=0;g<40;g++){const b=split(p,await kl(p,{start:a[a.length-1].t+H1}));const nw=b.filter(c=>c.t>a[a.length-1].t);a.push(...nw);if(b.length<999||!nw.length)break}}
else a=split(p,await kl(p));
for(let g=0;g<40&&a.length&&a.length<hours;g++){const b=(await kl(p,{end:a[0].t-H1})).filter(c=>c.t<a[0].t);if(!b.length)break;a=b.concat(a);if(b.length<999)break}
if(a.length<60)throw new Error('замало історії для '+p);
if(isF(p))try{await frLoad(pairOf(p))}catch(e){}
DT[p]=a;IDB.set(key,pack1(a.length>30000?a.slice(-30000):a));return a}
function need(p,hours=DEPTH){if(MD.mode==='init')return MD.ip.then(()=>need(p,hours));if(MD.mode!=='live')return Promise.resolve();if(!PAIRS[pairOf(p)])return Promise.reject(new Error('невідома пара '+p));
const h=DT[p];if(h&&(h.length>=hours||h._full))return Promise.resolve();const q=MD.load[p];if(q&&q.h>=hours)return q;
const pr=(q||Promise.resolve()).catch(()=>{}).then(()=>load1(p,hours)).then(a=>{if(a.length<hours)a._full=1}).finally(()=>{if(MD.load[p]===pr)delete MD.load[p]});pr.h=hours;return MD.load[p]=pr}
const needAll=async(ps,hours)=>{for(const p of ps)await need(p,hours)};
/* скільки годин історії потрібно, щоб відтворити бота від запуску (з запасом на індикатори) */
const hrsFor=(t0,tf)=>Math.min(30000,Math.max(DEPTH,Math.ceil((Date.now()-(+t0||Date.now()))/36e5)+300*(tf||1)));
function withData(p,el,fn,hours=DEPTH){const h=DT[p];if(MD.mode==='demo'||(h&&(h.length>=hours||h._full)))return fn();
if(el)el.innerHTML=`<p class="mu">Завантажую історію ${esc(pairOf(p))} (${mkLbl(p)})…</p>`;need(p,hours).then(fn).catch(e=>{if(el)el.innerHTML=`<p class="dn">Не вдалося завантажити дані ${esc(pairOf(p))}: ${esc(e.message)}</p>`})}
const tkSpot=async b=>{if(MD.k==='by'){const j=await jget(b+'/v5/market/tickers?category=spot',10000);if(j.retCode)throw new Error(j.retMsg);return j.result.list.map(r=>[r.symbol,+r.lastPrice,+r.prevPrice24h,+r.turnover24h,+r.highPrice24h,+r.lowPrice24h])}
const j=await jget(b+'/api/v3/ticker/24hr?type=MINI',10000);return j.map(r=>[r.symbol,+r.lastPrice,+r.openPrice,+r.quoteVolume,+r.highPrice,+r.lowPrice])};
const tkFut=async(b,k)=>{if(k==='by'){const j=await jget(b+'/v5/market/tickers?category=linear',10000);if(j.retCode)throw new Error(j.retMsg);return j.result.list.map(r=>[r.symbol,+r.lastPrice,+r.prevPrice24h,+r.turnover24h,+r.highPrice24h,+r.lowPrice24h,+r.fundingRate])}
const[j,pi]=await Promise.all([jget(b+'/fapi/v1/ticker/24hr',10000),jget(b+'/fapi/v1/premiumIndex',10000).catch(()=>[])]),fm=new Map((pi||[]).map(r=>[r.symbol,+r.lastFundingRate]));return j.map(r=>[r.symbol,+r.lastPrice,+r.openPrice,+r.quoteVolume,+r.highPrice,+r.lowPrice,fm.get(r.symbol)])};
const tkMap=L=>{const m={};for(const[k,c,o,q,h,l,fr]of L)m[k]={c,o,q,h,l,fr};return m};
async function mdInit(){for(const s of SRCS){try{MD.k=s.k;const m=tkMap(await tkSpot(s.b)),ok=PK.filter(p=>m[sym(p)]&&m[sym(p)].c>0);if(ok.length<5)throw new Error('мало пар');
MD.mode='live';MD.src=s.n;MD.base=s.b;MD.tk=m;PK=ok;for(const k of Object.keys(PAIRS))if(!ok.includes(k))delete PAIRS[k];await futInit();await fltInit();return}catch(e){MD.err=e.message}}
MD.mode='demo'}
async function futInit(){for(const s of FSRCS){try{const m=tkMap(await tkFut(s.b,s.k)),set=new Set(PK.filter(p=>m[sym(p)]&&m[sym(p)].c>0));if(set.size<3)throw new Error('мало ф\'ючерсних пар');
MD.fut=1;MD.fsrc=s.n;MD.fbase=s.b;MD.fk=s.k;MD.ftk=m;MD.fset=set;return}catch(e){MD.ferr=e.message}}MD.fut=0}
/* ---------- правила бірж для пар: крок ціни, крок кількості, мінімальний ордер, макс. плече ----------
   Spot: Binance exchangeInfo / Bybit instruments-info (spot). Futures: Binance fapi exchangeInfo / Bybit linear.
   Ключ — той самий ключ даних ('BTC/USDT' або 'BTC/USDT@F'). Кеш у IndexedDB на добу. */
const fnum=x=>{const v=+x;return isFinite(v)&&v>0?v:0};
function fBn(L){const o={};for(const x of L){const F={};for(const f of x.filters||[])F[f.filterType]=f;const pf=F.PRICE_FILTER||{},ls=F.LOT_SIZE||{},mn=F.NOTIONAL||F.MIN_NOTIONAL||{};
o[x.symbol]={tick:fnum(pf.tickSize),step:fnum(ls.stepSize),minQty:fnum(ls.minQty),minN:fnum(mn.minNotional||mn.notional)}}return o}
function fBy(L,lin){const o={};for(const x of L){const pf=x.priceFilter||{},ls=x.lotSizeFilter||{},lf=x.leverageFilter||{};
o[x.symbol]=lin?{tick:fnum(pf.tickSize),step:fnum(ls.qtyStep),minQty:fnum(ls.minOrderQty),minN:fnum(ls.minNotionalValue),maxLev:fnum(lf.maxLeverage)}:{tick:fnum(pf.tickSize),step:fnum(ls.basePrecision),minQty:fnum(ls.minOrderQty),minN:fnum(ls.minOrderAmt)}}return o}
async function fltLoad(fut){const k=fut?'f'+MD.fk:MD.k,key='flt:'+k,c=await IDB.get(key);if(c&&Date.now()-c.at<864e5)return c.m;let m;
if(fut){if(MD.fk==='by'){const j=await jget(MD.fbase+'/v5/market/instruments-info?category=linear&limit=1000');m=fBy(j.result.list||[],1)}else{const j=await jget(MD.fbase+'/fapi/v1/exchangeInfo');m=fBn(j.symbols||[])}}
else{if(MD.k==='by'){const j=await jget(MD.base+'/v5/market/instruments-info?category=spot');m=fBy(j.result.list||[],0)}else{const j=await jget(MD.base+'/api/v3/exchangeInfo?symbols='+encodeURIComponent(JSON.stringify(PK.map(sym))));m=fBn(j.symbols||[])}}
IDB.set(key,{at:Date.now(),m});return m}
async function fltInit(){if(MD.mode!=='live')return;try{const m=await fltLoad(0);for(const p of PK)if(m[sym(p)])MD.flt[p]=m[sym(p)]}catch(e){MD.flterr=e.message}
if(MD.fut)try{const m=await fltLoad(1);for(const p of PK)if(m[sym(p)]&&MD.fset.has(p))MD.flt[p+FK]=m[sym(p)]}catch(e){MD.flterr=e.message}}
const fltOf=g=>g&&MD.flt?MD.flt[dk(g)]||null:null;
/* правила ф'ючерсів демо-бірж, на яких торгують боти з «Тестнет» (Bybit Demo — правила Bybit linear, Binance Testnet —
   правила USDⓈ-M): крок кількості для попередження про округлення. Публічні дані, кеш на добу; помилка — без попередження. */
const XRU={bybit:['https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000',j=>fBy((j.result&&j.result.list)||[],1)],binance:['https://fapi.binance.com/fapi/v1/exchangeInfo',j=>fBn(j.symbols||[])]};
async function xRules(ex){if(MD.xflt[ex])return MD.xflt[ex];const R=XRU[ex];if(!R)return null;const key='flt:x'+ex,c=await IDB.get(key).catch(()=>null);
if(c&&Date.now()-c.at<864e5)return MD.xflt[ex]=c.m;try{const m=R[1](await jget(R[0]));if(Object.keys(m).length){IDB.set(key,{at:Date.now(),m});MD.xflt[ex]=m}}catch(e){}return MD.xflt[ex]||null}
async function tkRefresh(){if(MD.mode!=='live')return;try{Object.assign(MD.tk,tkMap(await tkSpot(MD.base)))}catch(e){}if(MD.fut)try{Object.assign(MD.ftk,tkMap(await tkFut(MD.fbase,MD.fk)))}catch(e){}}
/* остання ціна за ключем даних: поточна свічка або остання закрита */
const lastC=p=>MD.live[p]||D[p][D[p].length-1];
const listed=(p,e)=>PK.indexOf(p)<EXS[e][1];
const maxLev=(p,e)=>{const i=PK.indexOf(p),F=MD.flt&&MD.flt[p+FK];return Math.min(F&&F.maxLev?F.maxLev:i<2?125:i<10?75:i<30?25:10,EXS[e][0])};
