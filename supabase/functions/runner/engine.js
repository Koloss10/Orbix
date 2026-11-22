// ЗГЕНЕРОВАНО tools/build.js з src/js/01-config-pairs.js, 02-market-data.js, 03-indicators.js, 04-engine.js, 05-walkforward.js, 06-quality.js — не редагуйте вручну.
// Торговий рушій Orbix для сервера (той самий код, що й у браузері).

const VARIANT=2;

const N=26208,DEPTH=9000,PAIRS={},EXS={Binance:[125,100],Bybit:[100,100],OKX:[100,95],Bitget:[125,92],'Gate.io':[100,100],KuCoin:[100,90],MEXC:[200,100],BingX:[150,96],HTX:[100,85],BitMEX:[100,30]};
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gs(R){let u=0;for(let i=0;i<6;i++)u+=R();return(u-3)*1.414}
function nextC(P,R){const o=P.c;if(R()<1/400)P.m=gs(R)*.0004;if(R()<1/3000)P.a*=1+gs(R)*.07;P.a*=1+P.v*.3*gs(R)+(P.m||0);const c=o*(1+P.v*gs(R)+.04*(P.a-o)/o),w=Math.abs(P.v*gs(R))*.6;P.c=c;const v=(P.vb||(P.vb=2e6/P.p))*(0.6+Math.abs(c/o-1)/P.v*0.9+Math.abs(gs(R))*0.5);return{o,h:Math.max(o,c)*(1+w),l:Math.min(o,c)*(1-w),c,v}}
[['BTC',60000,.006],['ETH',3000,.008],['SOL',150,.011],['BNB',580,.007],['XRP',.55,.01],['DOGE',.12,.014],['ADA',.45,.011],['AVAX',35,.012],['LINK',14,.011],['TON',6,.012],['DOT',7,.011],['LTC',80,.009]].forEach(([k,p,v],i)=>PAIRS[k+'/USDT']={p,v,s:i+1,f:95-i*3});
{const R=rng(7);'UNI,ETC,FIL,NEAR,APT,ARB,OP,INJ,SUI,SEI,TIA,RUNE,AAVE,MKR,SNX,CRV,LDO,ATOM,XLM,ALGO,VET,HBAR,ICP,EGLD,FTM,SAND,MANA,AXS,GALA,APE,CHZ,ENJ,FLOW,KAVA,ZIL,ONE,QTUM,IOTA,NEO,EOS,XTZ,THETA,GRT,1INCH,COMP,YFI,SUSHI,BAT,ZRX,KSM,WAVES,DASH,ZEC,XMR,BCH,BSV,TRX,SHIB,PEPE,FLOKI,BONK,WIF,JUP,PYTH,STRK,DYM,ORDI,WLD,RNDR,FET,AGIX,OCEAN,STX,IMX,GMX,DYDX,PENDLE,ENS,LRC,ANKR,CELO,ROSE,MINA,CFX,BLUR,JTO,MEME,ETHFI'.split(',').forEach((k,i)=>PAIRS[k+'/USDT']={p:+(10**(R()*4-1.5)).toPrecision(3),v:.007+R()*.02,s:i+100,f:Math.round(25+R()*50)})}
let PK=Object.keys(PAIRS);
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
function agg(cs,k){if(k===1)return cs;const o=[];for(let i=0;i+k<=cs.length;i+=k){let h=-1/0,l=1/0,v=0,bv=0,nb=0,nt=0,nn=0;for(let j=i;j<i+k;j++){if(cs[j].h>h)h=cs[j].h;if(cs[j].l<l)l=cs[j].l;v+=cs[j].v||0;if(cs[j].bv!=null){bv+=cs[j].bv;nb++}if(cs[j].nt!=null){nt+=cs[j].nt;nn++}}const x={t:cs[i].t,o:cs[i].o,h,l,c:cs[i+k-1].c,v};if(nb===k)x.bv=bv;if(nn===k)x.nt=nt;o.push(x)}return o}
/* свічки старших таймфреймів вирівняні за UTC, як на біржах (тиждень — з понеділка 00:00 UTC);
   неповна перша група й ще не закрита остання відкидаються */
const tfOff=tf=>tf===168?4*864e5:0,tfMs=tf=>tf*36e5;
function aggT(cs,tf){if(tf===1)return cs;const o=[],W=tfMs(tf),off=tfOff(tf);let cur=null,key=null;
for(const c of cs){const k=Math.floor((c.t-off)/W);if(k!==key){if(cur)o.push(cur);key=k;cur={t:k*W+off,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v||0,_s:c.t};if(c.bv!=null)cur.bv=c.bv;else cur._nb=1;if(c.nt!=null)cur.nt=c.nt;else cur._nn=1;if(c.ml!=null){cur.ml=c.ml;cur.mh=c.mh}}else{if(c.h>cur.h)cur.h=c.h;if(c.l<cur.l)cur.l=c.l;cur.c=c.c;cur.v+=c.v||0;if(c.bv!=null&&!cur._nb)cur.bv+=c.bv;else{cur._nb=1;delete cur.bv}if(c.nt!=null&&!cur._nn)cur.nt+=c.nt;else{cur._nn=1;delete cur.nt}if(c.ml!=null){cur.ml=cur.ml==null?c.ml:Math.min(cur.ml,c.ml);cur.mh=cur.mh==null?c.mh:Math.max(cur.mh,c.mh)}}}
if(cur)o.push(cur);if(o.length&&o[0]._s!==o[0].t)o.shift();const L=cs[cs.length-1];if(o.length&&L&&L.t+36e5<o[o.length-1].t+W)o.pop();return o}
/* чи щойно закрилась свічка таймфрейму tf (за останньою годинною свічкою) */
const closedTf=(cs,tf)=>{const L=cs[cs.length-1];return!!L&&(tf===1||(L.t+36e5-tfOff(tf))%tfMs(tf)===0)};
const aggC=(a,k)=>{if(k===1)return a;const c=a._g||(a._g={}),e=c[k];if(e&&e.n===a.length&&e.t===a[0].t)return e.A;const A=a.length&&a[0].t!=null?aggT(a,k):agg(a,k);c[k]={n:a.length,t:a.length?a[0].t:0,A};return A};
const memo=(A,k,f)=>{const c=A._m||(A._m={}),e=c[k];if(e&&e.n===A.length)return e.v;return(c[k]={n:A.length,v:f()}).v};
const cl=A=>A.map(x=>x.c);
function ema(c,n){const a=2/(n+1),o=[c[0]];for(let i=1;i<c.length;i++)o.push(o[i-1]+a*(c[i]-o[i-1]));return o}
function rsi(c,n){const o=[50],a=1/n;let u=0,d=0;for(let i=1;i<c.length;i++){const x=c[i]-c[i-1];u=u*(1-a)+Math.max(x,0)*a;d=d*(1-a)+Math.max(-x,0)*a;o.push(d?100-100/(1+u/d):100)}return o}
function bbands(c,n,k){const L=[],U=[];for(let i=0;i<c.length;i++){if(i<n-1){L.push(-1/0);U.push(1/0);continue}let m=0;for(let j=i-n+1;j<=i;j++)m+=c[j];m/=n;let v=0;for(let j=i-n+1;j<=i;j++)v+=(c[j]-m)**2;const sd=Math.sqrt(v/(n-1));L.push(m-k*sd);U.push(m+k*sd)}return[L,U]}
function cci(A,n){const t=A.map(x=>(x.h+x.l+x.c)/3),o=[];for(let i=0;i<t.length;i++){if(i<n-1){o.push(0);continue}let m=0;for(let j=i-n+1;j<=i;j++)m+=t[j];m/=n;let md=0;for(let j=i-n+1;j<=i;j++)md+=Math.abs(t[j]-m);md/=n;o.push(md?(t[i]-m)/(.015*md):0)}return o}
function stoch(A,n=14){return A.map((_,i)=>{if(i<n-1)return 50;let hh=-1/0,ll=1/0;for(let j=i-n+1;j<=i;j++){hh=Math.max(hh,A[j].h);ll=Math.min(ll,A[j].l)}return hh>ll?(A[i].c-ll)/(hh-ll)*100:50})}
/* ATR (Wilder), WMA/HMA, SuperTrend, Parabolic SAR — класичні формули */
function atr(A,n){const o=[];let a=0;for(let i=0;i<A.length;i++){const x=A[i],tr=i?Math.max(x.h-x.l,Math.abs(x.h-A[i-1].c),Math.abs(x.l-A[i-1].c)):x.h-x.l;a=i<n?(a*i+tr)/(i+1):(a*(n-1)+tr)/n;o.push(a)}return o}
function wma(c,n){const o=[],d=n*(n+1)/2;for(let i=0;i<c.length;i++){if(i<n-1){o.push(c[i]);continue}let s=0;for(let j=0;j<n;j++)s+=c[i-j]*(n-j);o.push(s/d)}return o}
function hma(c,n){const a=wma(c,Math.max(1,Math.round(n/2))),b=wma(c,n);return wma(a.map((x,i)=>2*x-b[i]),Math.max(1,Math.round(Math.sqrt(n))))}
function supertrend(A,n=10,m=3){const T=atr(A,n),o=[];let up=0,dn=0,dir=1;for(let i=0;i<A.length;i++){const x=A[i],mid=(x.h+x.l)/2,bu=mid+m*T[i],bl=mid-m*T[i];
if(!i){up=bu;dn=bl;o.push(1);continue}const pc=A[i-1].c;up=bu<up||pc>up?bu:up;dn=bl>dn||pc<dn?bl:dn;if(dir>0&&x.c<dn)dir=-1;else if(dir<0&&x.c>up)dir=1;o.push(dir)}return o}
function psar(A,st=.02,mx=.2){const o=[1];if(!A.length)return[];let up=true,sar=A[0].l,ep=A[0].h,af=st;
for(let i=1;i<A.length;i++){const x=A[i],p=A[i-1];sar=sar+af*(ep-sar);if(up){sar=Math.min(sar,p.l,i>1?A[i-2].l:p.l);if(x.l<sar){up=false;sar=ep;ep=x.l;af=st}else if(x.h>ep){ep=x.h;af=Math.min(mx,af+st)}}
else{sar=Math.max(sar,p.h,i>1?A[i-2].h:p.h);if(x.h>sar){up=true;sar=ep;ep=x.h;af=st}else if(x.l<ep){ep=x.l;af=Math.min(mx,af+st)}}o.push(up?1:-1)}return o}
function macdH(c){const f=ema(c,12),s=ema(c,26),m=f.map((x,i)=>x-s[i]),g=ema(m,9);return m.map((x,i)=>x-g[i])}
const SIG={
rsi:(A,g)=>memo(A,'r'+g.rp,()=>rsi(cl(A),g.rp)).map(x=>x<g.rm?1:x>100-g.rm?-1:0),
bb:(A,g)=>{const B=memo(A,'b'+g.bn+'_'+g.bk,()=>bbands(cl(A),g.bn,g.bk));return A.map((x,i)=>x.c<B[0][i]?1:x.c>B[1][i]?-1:0)},
cci:(A,g)=>memo(A,'c'+g.cn,()=>cci(A,g.cn)).map(x=>x<-g.cv?1:x>g.cv?-1:0),
macd:A=>{const M=memo(A,'m',()=>macdH(cl(A)));return M.map((x,i)=>i&&x<0&&x>M[i-1]?1:i&&x>0&&x<M[i-1]?-1:0)},
stoch:A=>memo(A,'s',()=>stoch(A)).map(x=>x<20?1:x>80?-1:0),
ema:A=>{const E=memo(A,'e100',()=>ema(cl(A),100));return A.map((x,i)=>x.c>E[i]?1:-1)},
pat:A=>A.map((x,i)=>{if(!i)return 0;const p=A[i-1],b=Math.abs(x.c-x.o),r=x.h-x.l||1e-9,lo=Math.min(x.o,x.c)-x.l,up=x.h-Math.max(x.o,x.c);
if(p.c<p.o&&x.c>x.o&&x.c>=p.o&&x.o<=p.c)return 1;if(p.c>p.o&&x.c<x.o&&x.c<=p.o&&x.o>=p.c)return -1;
if(lo>2*b&&up<b&&b/r>.05)return 1;if(up>2*b&&lo<b&&b/r>.05)return -1;return 0}),
fib:A=>memo(A,'fib',()=>A.map((x,i)=>{const n=50;if(i<n)return 0;let hi=-1/0,lo=1/0,hj=0,lj=0;for(let j=i-n;j<i;j++){if(A[j].h>hi){hi=A[j].h;hj=j}if(A[j].l<lo){lo=A[j].l;lj=j}}const rg=hi-lo;if(rg<=0)return 0;const t=lj<hj?hi-rg*.618:lo+rg*.618;return Math.abs(x.c-t)/x.c<.004?(lj<hj?1:-1):0})),
lvl:A=>memo(A,'lvl',()=>A.map((x,i)=>{const n=100;if(i<n)return 0;let hi=-1/0,lo=1/0;for(let j=i-n;j<i;j++){hi=Math.max(hi,A[j].h);lo=Math.min(lo,A[j].l)}return x.c<=lo*1.005?1:x.c>=hi*.995?-1:0})),
st:A=>memo(A,'st',()=>supertrend(A,10,3)),
kc:A=>{const E=memo(A,'e20',()=>ema(cl(A),20)),T=memo(A,'atr10',()=>atr(A,10));return A.map((x,i)=>x.c<E[i]-2*T[i]?1:x.c>E[i]+2*T[i]?-1:0)},
psar:A=>memo(A,'psar',()=>psar(A)),
hma:A=>{const H=memo(A,'h50',()=>hma(cl(A),50));return A.map((x,i)=>i&&H[i]>H[i-1]?1:i&&H[i]<H[i-1]?-1:0)},
pc:A=>A.map((x,i)=>{if(i<24)return 0;const r=x.c/A[i-24].c-1;return r<=-.03?1:r>=.03?-1:0}),
ta:A=>{const c=cl(A),R=memo(A,'r14',()=>rsi(c,14)),S=memo(A,'s',()=>stoch(A)),C=memo(A,'c20',()=>cci(A,20)),M=memo(A,'m',()=>macdH(c)),E1=memo(A,'e20',()=>ema(c,20)),E2=memo(A,'e50',()=>ema(c,50));
return A.map((x,i)=>{const v=(R[i]<30?1:R[i]>70?-1:0)+(S[i]<20?1:S[i]>80?-1:0)+(C[i]<-100?1:C[i]>100?-1:0)+(M[i]>0?1:-1)+(x.c>E1[i]?1:-1)+(E1[i]>E2[i]?1:-1);return v>=3?1:v<=-3?-1:0})}};
const SGN={rsi:'RSI',bb:'Bollinger',cci:'CCI',macd:'MACD',stoch:'Stochastic',ema:'EMA-тренд',pat:'Свічкові патерни',fib:'Fibonacci 0.618',lvl:'Рівні підтримки й опору',ta:'TA-рейтинг',st:'SuperTrend',kc:'Keltner Channel',psar:'Parabolic SAR',hma:'Hull MA',pc:'% зміни ціни'};
const DEF={tf:1,d:1,fut:1,lev:1,sg:['rsi','bb'],k:2,rp:14,rm:35,bn:20,bk:2,cn:20,cv:100,base:100,orders:5,step:.015,smul:1,mult:1.3,tp:.01,s1:0,tp2:.02,be:0,trail:0,sl:.04,cd:0,maxd:0,rv:0,xs:'',xmin:0,fo:0,pu:0,fw:0,fm:0,wk:0,wn:0,wb:.6,lq:0,lqt:.003,lqn:2,lqd:.03,ak:0,lk:0,htf:0,hte:50,live:0,fee:.001,slip:.0005};
/* Фільтр китів (сплеск об'єму): свічка i — «кит», якщо її об'єм ≥ wk × середнього за попередні WHL свічок,
   оборот (об'єм × ціна) ≥ wn USDT і переважають покупці (Long) чи продавці (Short): частка taker-buy об'єму
   ≥ wb (Long) або ≤ 1 − wb (Short). Якщо біржа не дає taker-buy об'єму (Bybit, демо-дані), напрям — за кольором свічки.
   Вхід дозволено, якщо кит був на одній з останніх WHW свічок (включно з поточною). wk = 0 — фільтр вимкнено. */
const WHL=20,WHW=3;
function whale(A,g){const n=A.length,o=new Array(n).fill(false),k=+g.wk||0;if(!(k>0))return o.fill(true);const wn=+g.wn||0,wb=g.wb==null?.6:+g.wb,d=g.d<0?-1:1;let s=0;const hit=new Array(n).fill(false);
for(let i=0;i<n;i++){const c=A[i],v=+c.v||0;if(i>=WHL){const avg=s/WHL;if(avg>0&&v>=k*avg&&v*c.c>=wn){let ok;if(c.bv!=null&&v>0){const sh=c.bv/v;ok=d>0?sh>=wb-1e-12:sh<=1-wb+1e-12}else ok=d>0?c.c>c.o:c.c<c.o;hit[i]=ok}}
s+=v;if(i>=WHL)s-=+A[i-WHL].v||0;let w=false;for(let j=Math.max(0,i-WHW+1);j<=i;j++)if(hit[j]){w=true;break}o[i]=w}return o}
/* ---------- ліквідність, сплеск активності, каскад ліквідацій (лише закриті свічки, без зазирання вперед) ----------
   Свінг-мінімум на свічці j: l[j] строго найменший серед j−SWP…j+SWP; відомий лише після закриття свічки j+SWP.
   Зона ліквідності — скупчення ≥ lqn свінгів за останні LQL свічок у межах допуску lqt; рівень — крайній свінг
   скупчення (за ним стоять стопи). Зона знята, якщо після останнього свінгу ціна вже пройшла рівень.
   Вхід дозволено, якщо умова фільтра виконалась на одній з останніх FLW свічок (як у фільтра китів). */
const SWP=3,LQL=100,FLW=3,AVN=20;
function swings(A){const n=A.length,lo=[],hi=[];for(let j=SWP;j+SWP<n;j++){let L=true,H=true;
for(let q=j-SWP;q<=j+SWP&&(L||H);q++){if(q===j)continue;if(A[q].l<=A[j].l)L=false;if(A[q].h>=A[j].h)H=false}
if(L)lo.push({j,at:j+SWP,p:A[j].l});if(H)hi.push({j,at:j+SWP,p:A[j].h})}return{lo,hi}}
/* незняті зони на момент свічки i: side 'lo' — зони мінімумів (стопи під ними), 'hi' — максимумів; upto — до якої свічки
   включно перевіряти, що рівень ще не пройдено (i−1 — для розвороту на свічці i, i — для руху до ліквідності) */
function liqZones(A,i,sw,g,side,upto){const tol=+g.lqt>0?+g.lqt:.003,need=Math.max(2,Math.round(+g.lqn||2)),src=side==='lo'?sw.lo:sw.hi;
const P=src.filter(s=>s.at<=i&&s.j>=i-LQL).sort((a,b)=>a.p-b.p),Z=[];
for(let s=0;s<P.length;){let e=s;while(e+1<P.length&&P[e+1].p<=P[s].p*(1+tol))e++;
if(e-s+1>=need){const grp=P.slice(s,e+1),lvl=side==='lo'?grp[0].p:grp[grp.length-1].p,jl=Math.max(...grp.map(x=>x.j));let ok=true;
for(let q=jl+1;q<=upto;q++)if(side==='lo'?A[q].l<lvl:A[q].h>lvl){ok=false;break}if(ok)Z.push({lvl,j:jl,n:grp.length});s=e+1}else s++}return Z}
const winOf=(hit,n)=>{const o=new Array(n).fill(false);for(let i=0;i<n;i++)for(let j=Math.max(0,i-FLW+1);j<=i;j++)if(hit[j]){o[i]=true;break}return o};
/* 1. Ліквідність: lq 1 — розворот після зняття стопів, 2 — рух до ліквідності */
function liq(A,g){const n=A.length,m=Math.round(+g.lq||0);if(!m)return new Array(n).fill(true);const sw=swings(A),d=g.d<0?-1:1,hit=new Array(n).fill(false),dist=+g.lqd>0?+g.lqd:.03;
for(let i=SWP*2;i<n;i++){const c=A[i];
if(m===1){const Z=liqZones(A,i,sw,g,d>0?'lo':'hi',i-1);hit[i]=Z.some(z=>d>0?c.l<z.lvl&&c.c>z.lvl:c.h>z.lvl&&c.c<z.lvl)}
else{const Z=liqZones(A,i,sw,g,d>0?'hi':'lo',i);hit[i]=Z.some(z=>d>0?z.lvl>c.c&&z.lvl/c.c-1<=dist+1e-12:z.lvl<c.c&&1-z.lvl/c.c<=dist+1e-12)}}
return winOf(hit,n)}
/* 2. Сплеск активності, проти свічки: розмах ≥ ak× середнього за AVN свічок і кількість угод (без неї — об'єм) ≥ ak× середнього;
   після червоної свічки — Long, після зеленої — Short */
function act(A,g){const n=A.length,k=+g.ak||0;if(!(k>0))return new Array(n).fill(true);const d=g.d<0?-1:1,hit=new Array(n).fill(false);
for(let i=AVN;i<n;i++){let r=0,v=0,t=0,tn=0;for(let q=i-AVN;q<i;q++){r+=A[q].h-A[q].l;v+=+A[q].v||0;if(A[q].nt!=null){t+=A[q].nt;tn++}}
const c=A[i],useT=tn===AVN&&c.nt!=null,act=useT?c.nt>=k*t/AVN-1e-9:(+c.v||0)>=k*v/AVN-1e-9;
hit[i]=r>0&&c.h-c.l>=k*r/AVN-1e-12&&act&&(d>0?c.c<c.o:c.c>c.o)}return winOf(hit,n)}
/* 3. Каскад ліквідацій через свічки: новий мінімум за AVN свічок, об'єм ≥ lk× середнього, закриття у верхній половині
   розмаху (довга нижня тінь — ліквідації викуплено) — Long; дзеркально — Short */
function casc(A,g){const n=A.length,k=+g.lk||0;if(!(k>0))return new Array(n).fill(true);const d=g.d<0?-1:1,hit=new Array(n).fill(false);
for(let i=AVN;i<n;i++){let v=0,lo=Infinity,hi=-Infinity;for(let q=i-AVN;q<i;q++){v+=+A[q].v||0;if(A[q].l<lo)lo=A[q].l;if(A[q].h>hi)hi=A[q].h}
const c=A[i],rg=c.h-c.l;if(!(rg>0)||!((+c.v||0)>=k*v/AVN-1e-9))continue;const pos=(c.c-c.l)/rg;
hit[i]=d>0?c.l<lo&&pos>=.5:c.h>hi&&pos<=.5}return winOf(hit,n)}
/* 4. Тренд старшого таймфрейму: htf — старший таймфрейм у годинах (4, 12, 24, 168), hte — період EMA за його свічками.
   Свічки старшого ТФ складаються з закритих свічок бота; свічка старшого ТФ враховується лише тоді, коли закрилась
   остання свічка бота в ній (без зазирання вперед). Неповна перша група відкидається. Long — закриття останньої
   закритої свічки старшого ТФ не нижче EMA (тренд не спадний), Short — не вище. Поки EMA не набрала hte свічок — вхід заборонено. */
const htfNeed=g=>{const H=+g.htf||0;return H>0?Math.ceil((Math.max(2,Math.round(+g.hte||50))+2)*H/(+g.tf||1)):0};
function htf(A,g){const n=A.length,H=+g.htf||0,o=new Array(n).fill(false);if(!(H>0))return o.fill(true);
const W=tfMs(H),off=tfOff(H),Wb=tfMs(+g.tf||1),p=Math.max(2,Math.round(+g.hte||50)),d=g.d<0?-1:1,a=2/(p+1);if(W<=Wb)return o.fill(true);
let key=null,full=false,ema=null,cnt=0,last=null;
for(let i=0;i<n;i++){const t=A[i].t,k=Math.floor((t-off)/W);if(k!==key){key=k;full=t===k*W+off}
if(full&&t+Wb===(k+1)*W+off){const c=A[i].c;cnt++;ema=cnt===1?c:ema+(c-ema)*a;last=c;full=false}
o[i]=cnt>=p&&(d>0?last>=ema-1e-12:last<=ema+1e-12)}return o}
/* масив входів із додатковим масивом виходів за сигналом (.x); зріз зберігає .x — без нього e.slice() у бектестах втратив би виходи */
function withX(o,X){Object.defineProperty(o,'x',{value:X});Object.defineProperty(o,'slice',{value:function(a,b){return withX(Array.prototype.slice.call(this,a,b),this.x.slice(a,b))}});return o}
const hasXs=g=>typeof g.xs==='string'&&Object.prototype.hasOwnProperty.call(SIG,g.xs);
/* вихід за сигналом: протилежний сигнал обраного індикатора на закритій свічці (для Long — «Short»-сигнал, і навпаки) */
function exitArr(A,g,w){const S=SIG[g.xs](A,g),W=Math.max(w,g.xs==='ema'||g.xs==='lvl'?100:g.xs==='fib'?50:60),o=new Array(A.length).fill(false);for(let i=W;i<A.length;i++)o[i]=S[i]===-g.d;return o}
function entry(A,g){const S=g.sg.map(k=>SIG[k](A,g)),n=A.length,o=new Array(n).fill(false),f=PAIRS[g.pair],
w=Math.max(g.rp,g.bn,g.cn,30,g.sg.includes('ema')?100:0,g.sg.includes('lvl')?100:0,g.sg.includes('fib')?50:0,g.sg.includes('hma')||g.sg.includes('kc')||g.sg.includes('st')?60:0),k=Math.min(g.k||S.length,S.length);
if(!S.length||(g.fm&&f&&f.f<g.fm))return o;const WH=+g.wk>0?whale(A,g):null,FL=[+g.lq>0?liq(A,g):null,+g.ak>0?act(A,g):null,+g.lk>0?casc(A,g):null,+g.htf>0?htf(A,g):null].filter(Boolean);
for(let i=Math.max(w,WH?WHL:0,FL.length?AVN:0);i<n;i++){let c=0;for(const s of S)if(s[i]===g.d)c++;o[i]=c>=k&&(!WH||WH[i])&&FL.every(F=>F[i])}return hasXs(g)?withX(o,exitArr(A,g,w)):o}
/* Комісії: ftk — тейкер (ринковий вхід, стоп, трейлінг, ліквідація), fmk — мейкер (лімітні DCA і TP).
   Funding: події fr={t,r}; при r>0 Long платить, Short отримує, сума = r·кількість·ціна.
   g.frx — множник funding для перевірки якості (за замовчуванням 1; 0 — без funding, 2 — подвоєний).
   Ліквідація перевіряється за mark price (ml/mh свічки), якщо вона є, інакше за ціною угод. */
/* округлення під правила біржі: кількість — вниз до кроку, ціна лімітного ордера — у бік гіршого виконання */
const decs=x=>{const s=String(x);if(s.includes('e-'))return+s.split('e-')[1];const i=s.indexOf('.');return i<0?0:s.length-i-1};
const rnd=(v,st,m)=>st>0?+(Math[m](v/st+(m==='floor'?1e-9:-1e-9))*st).toFixed(decs(st)):v;
const normG=g=>{if(g.ftk==null){g.ftk=g.fut?.0005:.001;g.fmk=g.fut?.0002:.001}return g};
const lbT=(F,t)=>{let lo=0,hi=F.length;while(lo<hi){const m=(lo+hi)>>1;if(F[m].t<t)lo=m+1;else hi=m}return lo};
/* реінвест: множник розміру нової угоди = 1 + частка прибутку / маржа сітки (не менше 1). Спільна для рушія й ліміту ризику (runner/risk.js) */
function reinvestFactor(g,cum){if(!(g.rv>0)||!(cum>0))return 1;const M=g.base*(g.mult===1?g.orders:(g.mult**g.orders-1)/(g.mult-1));return M>0?1+g.rv*cum/M:1}
class Bot{constructor(g,fr,flt){this.g=g;this.F=flt!==undefined?flt:(typeof fltOf==='function'?fltOf(g):null);this.pos=null;this.tr=[];this.cd=0;this.cum=0;this.nd=0;this.pe=null;this.ft=g.ftk!=null?g.ftk:g.fee;this.fmk=g.fmk!=null?g.fmk:g.fee;
this.fr=fr!==undefined?fr:(g.fut&&typeof frOf==='function'?frOf(g.pair):null)}
/* реінвест: множник розміру нової угоди — частка g.rv накопиченого прибутку додається до маржі сітки (без зменшення після збитків) */
bf(){return reinvestFactor(this.g,this.cum)}
/* ручне керування угодою (як у Veles): 'close' — закрити за ринком за ціною px (комісія тейкера);
   'add' — позапланова докупівля на n USDT маржі за ціною px (драбина сітки не зсувається). Повертає подію або null. */
manual(k,px,t,n=0){const g=this.g,d=g.d,p=this.pos,L=g.lev||1;if(!p||!(px>0)||!isFinite(px))return null;
if(k==='close'){const v=p.q*px,pnl=p.real+d*(v-p.cost)-this.ft*v;this.cum+=pnl;this.tr.push({i:-1,ts:t,pnl,n:p.n,liq:false,sl:false,mn:1,fd:p.fd,f:p.f.concat({t,p:px,k:'x'})});this.pos=null;this.nd++;return{kind:'close',pnl,price:px,t,mn:1}}
if(k==='add'&&n>0&&isFinite(n)){const q=this.qty(n*L,px);if(!q)return null;const s=q*px;p.q+=q;p.cost+=s;p.real-=this.ft*s;p.f.push({t,p:px,k:'m'});return{kind:'madd',notional:s,price:px,t}}return null}
/* підхопити позицію, що вже є на біржі (як «Include a position on the exchange in a trade» у Veles): модель починає угоду
   з цієї кількості й ціни входу біржі (без комісії входу — її вже сплачено), як з першого ордера; далі — звичайна драбина й вихід */
adopt(px,q,t){if(this.pos||this.pe||!(px>0)||!(q>0)||!isFinite(px*q))return null;const s=q*px;
this.pos={q,bf:1,cost:s,n:1,last:px,first:px,peak:px,real:0,fd:0,t1:0,ad:1,f:[{t,p:px,k:'e'}]};return{kind:'adopt',notional:s,price:px,t}}
/* кількість за сумою й ціною з урахуванням кроку, мін. кількості й мін. ордера; 0 — біржа не прийме ордер */
qty(s,px){const F=this.F;if(!F)return s/px;const q=rnd(s/px,F.step,'floor');return q>0&&q>=(F.minQty||0)&&q*px>=(F.minN||0)-1e-9?q:0}
lp(x,up){const F=this.F;return F&&F.tick?rnd(x,F.tick,up?'ceil':'floor'):x}
eqv(r){const g=this.g,p=this.pos;if(!p)return this.cum;const v=p.q*r.c;return this.cum+p.real+g.d*(v-p.cost)-this.ft*v}
fund(r){const p=this.pos,F=this.fr;if(!p||!F||!F.length||r.t==null)return;const W=tfMs(this.g.tf||1);let k=lbT(F,r.t);
for(;k<F.length&&F[k].t<r.t+W;k++){const px=F[k].t-r.t<6e4?r.o:r.c,a=this.g.d*F[k].r*p.q*px*(this.g.frx!=null?this.g.frx:1);p.real-=a;p.fd+=a}}
step(i,r,en,h=i,xs=false){const g=this.g,d=g.d,p=this.pos,L=g.lev||1,fv=x=>d>0?r.h>=x:r.l<=x,ad=x=>d>0?r.l<=x:r.h>=x,adm=x=>d>0?(r.ml!=null?r.ml:r.l)<=x:(r.mh!=null?r.mh:r.h)>=x;
/* вхід лімітним ордером з відступом g.fo (як «Indent of the first order» у Veles): на сигналі ставиться відкладений вхід pe
   за ціною закриття ∓ fo; виконується з наступної свічки, щойно ціна торкнеться рівня (комісія мейкера). Скасовується, якщо ціна
   відійшла від ціни сигналу на g.pu у протилежний бік («підтягування сітки») або минуло g.fw свічок; бот чекає новий сигнал.
   Якщо свічка торкнулась і рівня входу, і рівня скасування — вхід (порядок усередині свічки невідомий). */
if(!p){const pe=this.pe;if(pe){if(ad(pe.px)){const s0=pe.q*pe.px;this.pos={q:pe.q,bf:pe.bf,cost:s0,n:1,last:pe.px,first:pe.px,peak:pe.px,real:-this.fmk*s0,fd:0,t1:0,pt:pe.t,f:[{t:r.t,p:pe.px,k:'e'}]};this.pe=null;return}
if((g.pu>0&&(d>0?r.h>=pe.ref*(1+g.pu):r.l<=pe.ref*(1-g.pu)))||(g.fw>0&&i-pe.i>=g.fw))this.pe=null;else return}
if(en&&i>=this.cd&&!(g.maxd>0&&this.nd>=g.maxd)){const bf=this.bf();
if(g.fo>0){const px=this.lp(r.c*(1-d*g.fo),d<0),q=this.qty(g.base*L*bf,px);if(q)this.pe={px,q,bf,ref:r.c,i,t:r.t};return}
const q0=this.qty(g.base*L*bf,r.c);if(!q0)return;const s0=q0*r.c;this.pos={q:q0,bf,cost:s0,n:1,last:r.c,first:r.c,peak:r.c,real:-this.ft*s0,fd:0,t1:0,f:[{t:r.t,p:r.c,k:'e'}]}}return}
this.fund(r);
let avg,x=0,lq=0,slp,lqp,stop=0,filled=0,tk=0;
/* активний трейлінг-стоп, якщо свічка відкрилась по прибутковий бік від нього: шлях до докупівлі чи SL, що лежать далі,
   неминуче проходить через стоп, тож він спрацьовує першим (так закриває й біржа) */
const tst=g.trail&&p.ta&&(d>0?r.o>p.peak*(1-g.trail):r.o<p.peak*(1+g.trail))?p.peak*(1-d*g.trail):0;
for(;;){avg=p.cost/p.q;slp=p.t1&&p.be?p.be:avg*(1-d*g.sl);lqp=L>1?avg*(1-d*Math.max(1/L-.005,0)):0;
const lqF=lqp&&(d>0?lqp>slp:lqp<slp),lim=lqF?lqp:slp;
const nx=!p.t1&&!p.dx&&p.n<g.orders?this.lp(p.last*(1-d*g.step*g.smul**(p.n-1)),d<0):0;
if(tst&&!filled&&(d>0?tst>lim:tst<lim)&&!(nx&&(d>0?nx>=tst:nx<=tst))&&ad(tst))break; // вихід за трейлінгом нижче
if(nx&&(d>0?nx>lim:nx<lim)&&ad(nx)){const qn=this.qty(g.base*L*(p.bf||1)*g.mult**p.n,nx);if(!qn){p.dx=1;continue}const s=qn*nx;p.q+=qn;p.cost+=s;p.real-=this.fmk*s;p.n++;p.last=nx;p.f.push({t:r.t,p:nx,k:'e'});filled=1;continue}
const hitL=lqp&&adm(lqp),hitS=ad(slp);
if(lqF?hitL:(!hitS&&hitL)){x=lqp;lq=1;stop=1}else if(hitS){x=slp*(1-d*(g.slip||0));stop=1;tk=1}break}
if(!stop&&!filled){const t=this.lp(p.t1?p.a1*(1+d*g.tp2):avg*(1+d*g.tp),d>0);
if(g.s1>0&&!p.t1){if(fv(t)){const sh=this.F?rnd(p.q*g.s1,this.F.step,'floor')/p.q:g.s1;if(sh<=0||sh>=1){x=t}else{const v=p.q*sh*t,c=p.cost*sh;p.real+=d*(v-c)-this.fmk*v;p.q*=1-sh;p.cost*=1-sh;p.t1=1;p.f.push({t:r.t,p:t,k:'x'});p.a1=avg;p.be=g.be==1?avg:g.be==2?t:0}}}
/* трейлінг: активується при досягненні TP і далі діє на кожній свічці; стоп рахується від піку
   попередніх свічок, бо порядок high/low усередині свічки невідомий. У свічці активації пік — сам рівень
   активації (як activePrice на біржі), а не екстремум свічки: невідомо, чи ціна дійшла до екстремуму раніше,
   ніж відкотилась на відстань трейлінгу. Якщо свічка закрилась за стопом від рівня активації, біржа вже закрила б
   позицію не гірше за цей стоп — вихід за ним. */
else if(g.trail){if(p.ta){const st=p.peak*(1-d*g.trail);if(ad(st)){x=st;tk=1}else p.peak=d>0?Math.max(p.peak,r.h):Math.min(p.peak,r.l)}else if(fv(t)){p.ta=1;p.peak=t;const st=t*(1-d*g.trail);if(d>0?r.c<=st:r.c>=st){x=st;tk=1}}}
else if(fv(t))x=t}
if(!x&&xs&&this.pos&&d*(r.c-p.cost/p.q)/(p.cost/p.q)>=(g.xmin||0)){x=r.c;tk=1;p.xsig=1}
if(x){let pnl;if(lq)pnl=p.real-p.cost/L;else{const v=p.q*x;pnl=p.real+d*(v-p.cost)-(tk?this.ft:this.fmk)*v}this.cum+=pnl;
this.tr.push({i:h,ts:r.t,pnl,n:p.n,liq:lq,sl:stop&&!lq,...(p.xsig?{xs:1}:{}),fd:p.fd,f:p.f.concat({t:r.t,p:x,k:'x'})});this.pos=null;this.nd++;this.cd=i+g.cd+1}}}
function run(A,e,g,off=0,keep=0,dep=0){const b=new Bot(g),tf=g.tf||1,M=dep?g.base*ladder(g):0,eq=keep?[]:null;let pk=0,dd=0,v=0,broke=0;for(let i=0;i<A.length;i++){const ok=!dep||dep+v>=M;if(!ok)broke=1;b.step(i,A[i],e[i]&&ok,off+i*tf,e.x&&e.x[i]);v=b.eqv(A[i]);if(v>pk)pk=v;if(v-pk<dd)dd=v-pk;if(keep)eq.push(v)}return{b,dd,last:v,eq,broke,pk}}
function summ(R,dep){const tr=R.b.tr;let w=0,gp=0,gl=0,o=0;for(const t of tr){if(t.pnl>0){w++;gp+=t.pnl}else gl-=t.pnl;o+=t.n}const n=tr.length,s=R.eq?Math.ceil(R.eq.length/240):1;
return{n,wr:n?w/n*100:0,pnl:R.last,real:R.b.cum,unr:R.last-R.b.cum,dd:R.dd,ddp:R.dd/dep*100,roi:R.last/dep*100,pf:gl?gp/gl:gp?Infinity:0,avg:n?R.b.cum/n:0,ao:n?o/n:0,liq:tr.filter(t=>t.liq).length,fund:tr.reduce((a,t)=>a+(t.fd||0),0)+(R.b.pos?R.b.pos.fd||0:0),broke:R.broke,cur:R.eq?R.eq.filter((_,i)=>i%s===0):[]}}
const ladder=g=>{let u=0;for(let k=0;k<g.orders;k++)u+=g.mult**k;return u};
function bt(g,per,dep,keep=1){normG(g);const tf=g.tf||1,A=aggC(hist(dk(g)),tf),k=Math.min(A.length,Math.floor(per/tf)),e=entry(A,g);return run(A.slice(-k),e.slice(-k),g,(A.length-k)*tf,keep,dep)}
function lv(g,p0,F){const L=[];let p=p0,q=0,c=0;const B=new Bot(g,null,F===undefined?null:F);for(let k=0;k<g.orders;k++){if(k)p=B.lp(p*(1-g.d*g.step*g.smul**(k-1)),g.d<0);const qq=B.qty(g.base*(g.lev||1)*g.mult**k,p);if(!qq)break;const s=qq*p;L.push({p,s});q+=qq;c+=s}const avg=c/q,Lv=g.lev||1;return{L,avg,tp:avg*(1+g.d*g.tp),sl:avg*(1-g.d*g.sl),liq:Lv>1?avg*(1-g.d*Math.max(1/Lv-.005,0)):0}}
const SC=[{n:'Різкий обвал −20% за годину',d:()=>0,v:.004,j:-.2},{n:'Повільне падіння −35% за 30 днів',d:()=>-.35/720,v:.0004,j:0},{n:'Обвал −40% за добу',d:i=>i<=24?-.4/24:0,v:.001,j:0},{n:'Різкий стрибок +20% за годину',d:()=>0,v:.004,j:.2},{n:'Pump +40% за 30 днів',d:()=>.4/720,v:.0004,j:0},{n:'Бічний ринок, висока волатильність',d:()=>0,v:.02,j:0},{n:'Волатильність ×3',d:()=>0,v:.018,j:0}];
function stress(g){const tf=g.tf||1,g2={...g,slip:.02};return SC.map(s=>{const R=rng(99);let c=100;const cs=[];for(let i=0;i<tf;i++)cs.push({o:100,h:100,l:100,c:100});for(let i=1;i<=720;i++){const r=(i===1?s.j:0)+s.d(i)+s.v*gs(R),n=c*(1+r),w=Math.abs(s.v*gs(R))*.6;cs.push({o:c,h:Math.max(c,n)*(1+w),l:Math.min(c,n)*(1-w),c:n});c=n}
const A=agg(cs,tf),b=new Bot(g2,null,(F=>F?{minN:F.minN}:null)(fltOf(g)));let mn=0,dca=0;A.forEach((r,i)=>{b.step(i,r,i===0);mn=Math.min(mn,b.eqv(r));if(b.pos)dca=Math.max(dca,b.pos.n)});dca=Math.max(dca,...b.tr.map(t=>t.n));
return{n:s.n,mn,dca,end:b.eqv(A[A.length-1]),liq:b.tr.some(t=>t.liq),sl:b.tr.filter(t=>t.sl).length,k:b.tr.length}})}
const STR=[['Mean reversion: RSI + Bollinger',['rsi','bb'],2],['Осцилятори: RSI, CCI, Stochastic (2 з 3)',['rsi','cci','stoch'],2],['Тренд + відкат: EMA, RSI, MACD',['ema','rsi','macd'],3],['Патерн + рівень підтримки',['pat','lvl'],2],['Fibonacci + RSI',['fib','rsi'],2],['TA-консенсус + Bollinger',['ta','bb'],2],['MACD + Stochastic',['macd','stoch'],2]];
const pick=(R,a)=>a[R()*a.length|0];
function auto(c,salt=0){const H=hist(dk(c)),R=rng((c.amt|0)*7+c.pair.length*7919+salt),out=[],mxL=c.fut===0?1:maxLev(c.pair,c.ex),LV=c.lev?[Math.min(c.lev,mxL)]:[1,2,3].filter(x=>x<=mxL);
for(const tf of c.tf?[c.tf]:[1,4,12,24,168]){const A=aggC(H,tf),k=Math.floor(c.per/tf);if(k<60||k>A.length)continue;const tr=Math.floor(k*.7),cs=A.slice(-k),off=(A.length-k)*tf;
for(const [name,sg,kk] of STR)for(const d of c.dr?[c.dr]:[1,-1]){if(d<0&&c.fut===0)continue;const g0=normG({...DEF,pair:c.pair,ex:c.ex,sg,k:kk,d,tf,rm:pick(R,[30,35,40]),fut:c.fut,name}),e=entry(A,g0).slice(-k);
for(let j=0;j<8;j++){const orders=3+(R()*6|0),mult=pick(R,[1,1.1,1.2,1.3,1.5,1.7]),lev=pick(R,LV),U=ladder({orders,mult}),mnN=minN(c),base=c.amt>0?c.amt/U:Math.max(10,Math.ceil(mnN/(c.fut===0?1:lev)*1.05));if(base<5||base*(c.fut===0?1:lev)<mnN)continue;
const g={...g0,orders,mult,lev,base,step:pick(R,[.008,.012,.016,.022,.03]),smul:pick(R,[1,1.2,1.5]),tp:pick(R,[.005,.008,.012,.018]),sl:pick(R,[.04,.06,.08,.1]),trail:pick(R,[0,.005,.01])},
dep=c.amt>0?c.amt:2*base*U,Rn=run(cs.slice(0,tr),e.slice(0,tr),g,off,0,dep),s=summ(Rn,dep);if(s.n<8)continue;out.push({g,cs,e,tr,off,sc:s.roi+2*s.ddp-(s.liq?500:0)-(s.broke?500:0)})}}}
out.sort((a,b)=>b.sc-a.sc);const seen={},top=[];for(const o of out){const key=o.g.name+o.g.tf+o.g.d;if(seen[key])continue;seen[key]=1;top.push(o);if(top.length==3)break}return top}
function evalC(o,c){const g=o.g,M=g.base*ladder(g),d0=c.amt>0?c.amt:2*M,Rf=run(o.cs,o.e,g,o.off,1,d0),Rt=run(o.cs.slice(o.tr),o.e.slice(o.tr),g,o.off+o.tr*g.tf,0,d0),sx=stress(g),worst=Math.min(...sx.map(x=>x.mn)),sf0=summ(Rf,d0),reserve=Math.max(1.5*-sf0.dd,-worst),need=M+reserve,dep=c.amt>0?c.amt:need,sf=summ(Rf,dep),st=summ(Rt,dep);
return{g,sf,st,sx,M,dep,reserve,need,fund:PAIRS[g.pair].f}}



/* ---------- Walk-forward: перевірка самого процесу підбору ----------
   Період ділиться на кроки. На кожному кроці параметри підбираються на вікні навчання (1/3 періоду),
   а найкраща конфігурація перевіряється на наступному вікні, якого підбір не бачив; потім усе зсувається.
   Тестові вікна йдуть одне за одним без перекриття й разом покривають останні 2/3 періоду. */
const minN=c=>{const F=fltOf({pair:c.pair,fut:c.fut});return F&&F.minN||5};
function sampleG(R,g0,c,LV){const orders=3+(R()*6|0),mult=pick(R,[1,1.1,1.2,1.3,1.5,1.7]),lev=pick(R,LV),U=ladder({orders,mult}),mnN=minN(c),base=c.amt>0?c.amt/U:Math.max(10,Math.ceil(mnN/(c.fut===0?1:lev)*1.05));if(base<5||base*(c.fut===0?1:lev)<mnN)return null;
return{g:{...g0,orders,mult,lev,base,step:pick(R,[.008,.012,.016,.022,.03]),smul:pick(R,[1,1.2,1.5]),tp:pick(R,[.005,.008,.012,.018]),sl:pick(R,[.04,.06,.08,.1]),trail:pick(R,[0,.005,.01])},dep:c.amt>0?c.amt:2*base*U}}
/* найкраща конфігурація на вікні [tS, tE): використовуються лише свічки, що закрились до tE */
function searchWin(c,tS,tE,salt,o={}){const H=hist(dk(c)),R=rng((c.amt|0)*7+c.pair.length*7919+salt*101+13),mxL=c.fut===0?1:maxLev(c.pair,c.ex),LV=c.lev?[Math.min(c.lev,mxL)]:[1,2,3].filter(x=>x<=mxL);let top=null;
for(const tf of c.tf?[c.tf]:[1,4,12,24,168]){const A=aggC(H,tf),W=tfMs(tf),i0=lbT(A,tS);let i1=i0;while(i1<A.length&&A[i1].t+W<=tE)i1++;if(i1-i0<60)continue;
for(const[name,sg,kk]of STR)for(const d of c.dr?[c.dr]:[1,-1]){if(d<0&&c.fut===0)continue;const g0=normG({...DEF,pair:c.pair,ex:c.ex,sg,k:kk,d,tf,rm:pick(R,[30,35,40]),fut:c.fut,name}),e=entry(A,g0);
for(let j=0;j<(o.ns||8);j++){const q=sampleG(R,g0,c,LV);if(!q)continue;const Rn=run(A.slice(i0,i1),e.slice(i0,i1),q.g,0,0,q.dep),s=summ(Rn,q.dep);if(s.n<(o.mn||5))continue;
const sc=s.roi+2*s.ddp-(s.liq?500:0)-(s.broke?500:0);if(!top||sc>top.sc)top={g:q.g,dep:q.dep,sc,s}}}}return top}
/* межі кроків walk-forward */
function wfPlan(c,o={}){const H=hist(dk(c));if(!H.length)return null;const folds=o.folds||8,end=H[H.length-1].t+H1,start=Math.max(H[0].t,end-c.per*H1),span=Math.floor((end-start)/H1),trH=Math.floor(span/3),teH=Math.floor((span-trH)/folds);
if(teH<24)return null;const P=[];for(let f=0;f<folds;f++){const trS=start+f*teH*H1,trE=trS+trH*H1,teE=f===folds-1?end:trE+teH*H1;P.push({f,trS,trE,teE})}return{P,trH,teH,folds}}
/* один крок: підбір на навчанні, перевірка на тесті */
function wfFold(c,p,o={}){const b=searchWin(c,p.trS,p.trE,p.f,o);if(!b)return{...p,none:1,pnl:0,roi:0,n:0,dd:0,ddp:0};
const H=hist(dk(c)),g=b.g,A=aggC(H,g.tf),W=tfMs(g.tf),j0=lbT(A,p.trE);let j1=j0;while(j1<A.length&&A[j1].t+W<=p.teE)j1++;
const e=entry(A,g),s=summ(run(A.slice(j0,j1),e.slice(j0,j1),g,0,0,b.dep),b.dep);
return{...p,g,dep:b.dep,is:{roi:b.s.roi,n:b.s.n,ddp:b.s.ddp},pnl:s.pnl,roi:s.roi,n:s.n,dd:s.dd,ddp:s.ddp,liq:s.liq}}
/* підсумок: частка прибуткових тестів, сумарна дохідність тестів, WFE = темп тестів / темп навчання */
function wfSum(F,plan){const D2=F.filter(x=>!x.none),n=D2.length,pos=D2.filter(x=>x.pnl>0).length,oos=D2.reduce((a,x)=>a+x.roi,0);
const hrs=x=>(x.teE-x.trE)/H1,isR=n?D2.reduce((a,x)=>a+x.is.roi,0)/n/plan.trH:0,ooR=n?D2.reduce((a,x)=>a+x.roi/hrs(x),0)/n:0,wfe=isR>0?ooR/isR:null;
const worst=n?Math.min(...D2.map(x=>x.roi)):0,liq=D2.reduce((a,x)=>a+(x.liq||0),0);
const verdict=n<3?'мало':oos>0&&pos/n>=.6&&wfe!=null&&wfe>=.5&&!liq?'стабільна':oos<=0||pos/n<.4?'нестабільна':'сумнівна';
return{F,n,pos,folds:F.length,oos,wfe,worst,liq,verdict,trH:plan.trH,teH:plan.teH}}
function wfo(c,o={}){const plan=wfPlan(c,o);if(!plan)return null;return wfSum(plan.P.map(p=>wfFold(c,p,o)),plan)}


/* ---------- Якість стратегії: витрати, ринкові режими, стабільність ----------
   Та сама конфігурація проганяється кілька разів:
   - з витратами бектесту (комісії біржі, funding, прослизання стопу);
   - без витрат — валовий результат, щоб побачити, скільки забирають витрати;
   - з подвоєними витратами: комісії ×2, ще 0,1 % прослизання на кожне ринкове виконання (вхід, стоп, трейлінг),
     прослизання стопу щонайменше 0,2 %, funding ×2;
   - окремо на вікнах (30 днів, для коротких періодів — 7 днів), кожне вікно — новий бот із нуля.
     Вікно класифікується за ринком: ріст / падіння / бічний (зміна ціни за вікно) і висока / звичайна волатильність;
   - окремо на першій і другій половині періоду (чи не зникає перевага з часом).
   Висновок: стабільна / сумнівна / нестабільна / збиткова / мало угод, з переліком причин. */
const QREG={up:'ріст',dn:'падіння',fl:'бічний'};
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?n%2?b[n>>1]:(b[n/2-1]+b[n/2])/2:0};
/* ринок на відрізку свічок: зміна ціни, денна волатильність, режим (поріг тренду ±8 % за 30 днів, масштаб √часу) */
function qMarket(A,tf,W){const r=[];for(let i=1;i<A.length;i++)r.push(Math.log(A[i].c/A[i-1].c));const m=r.reduce((a,x)=>a+x,0)/(r.length||1),
sd=Math.sqrt(r.reduce((a,x)=>a+(x-m)**2,0)/(r.length||1)),vol=sd*Math.sqrt(24/tf),ret=A.length?A[A.length-1].c/A[0].o-1:0,thr=.08*Math.sqrt(W/720);
return{ret,vol,reg:ret>thr?'up':ret<-thr?'dn':'fl'}}
/* A — свічки таймфрейму бота, e — сигнали входу для них, k — скільки останніх свічок аналізувати */
function qualityA(A,e,g,dep,k=A.length){normG(g);const tf=g.tf||1,off=A.length-k,cs=A.slice(off),es=e.slice(off),hrs=k*tf;
const R=(gg,a=0,b=cs.length)=>summ(run(cs.slice(a,b),es.slice(a,b),gg,(off+a)*tf,0,dep),dep);
const base=R(g),gross=R({...g,ftk:0,fmk:0,slip:0,frx:0}),hard=R({...g,ftk:g.ftk*2+.001,fmk:g.fmk*2,slip:Math.max(.002,(g.slip||0)*2),frx:2});
const cost=gross.pnl-base.pnl,costShare=gross.pnl>0?cost/gross.pnl:null;
/* вікна */
const W=hrs>=2160?720:hrs>=336?168:0,wn=W?Math.round(W/tf):0,wins=[];
if(wn>=10)for(let a=cs.length-Math.floor(cs.length/wn)*wn;a+wn<=cs.length;a+=wn){const s=R(g,a,a+wn),mk=qMarket(cs.slice(a,a+wn),tf,W);wins.push({t:cs[a].t,n:s.n,pnl:s.pnl,roi:s.roi,liq:s.liq,...mk})}
const vm=median(wins.map(w=>w.vol));wins.forEach(w=>w.hv=w.vol>vm*1.25);
const act=wins.filter(w=>w.n>0||Math.abs(w.pnl)>1e-9),pos=act.filter(w=>w.pnl>0).length,posShare=act.length?pos/act.length:null,
tot=act.reduce((a,w)=>a+w.pnl,0),best=act.length?Math.max(...act.map(w=>w.pnl)):0,conc=tot>0&&act.length>=4?best/tot:null;
const reg={};for(const w of wins){const o=reg[w.reg]||(reg[w.reg]={n:0,pos:0,pnl:0,tr:0});o.n++;o.pnl+=w.pnl;o.tr+=w.n;if(w.pnl>0)o.pos++}
const hv=wins.filter(w=>w.hv),lv=wins.filter(w=>!w.hv),vol={hi:{n:hv.length,pnl:hv.reduce((a,w)=>a+w.pnl,0)},lo:{n:lv.length,pnl:lv.reduce((a,w)=>a+w.pnl,0)}};
/* половини періоду: дохідність за 30 днів */
const hm=cs.length>>1,h1=R(g,0,hm),h2=R(g,hm),m30=s=>s.roi/(hm*tf/720),h1m=m30(h1),h2m=m30(h2);
/* причини */
const F=[],add=(t,sev)=>F.push({t,sev});
if(base.liq)add(`Ліквідацій: ${base.liq}`,1);
/* частка витрат окремою причиною не є: якщо витрати забирають понад половину валового прибутку, подвоєні вже дають збиток */
if(base.pnl>0&&hard.pnl<=0)add('Збиткова при подвоєних витратах (комісії, прослизання, funding)',1);
if(posShare!=null&&act.length>=3&&posShare<.5)add(`Прибуткових лише ${pos} з ${act.length} вікон`,1);
if(conc!=null&&conc>.6)add(`${Math.round(conc*100)} % прибутку дало одне вікно`,0);
for(const[r,o]of Object.entries(reg))if(o.n>=2&&o.tr>0&&o.pnl<0)add(`Збиткова на ринку «${QREG[r]}» (${o.n} вікон, ${o.pnl.toFixed(2).replace('-','−')} USDT)`,0);
if(h1.n>=3&&h2.n>=1&&h1m>0&&h2m<=0)add('Друга половина періоду збиткова: перевага зникає',1);
const verdict=base.pnl<=0?'збиткова':base.n<10?'мало угод':F.some(x=>x.sev)?'нестабільна':F.length?'сумнівна':'стабільна';
return{base,gross,hard,cost,costShare,W,wins,act:act.length,pos,posShare,conc,reg,vol,h1,h2,h1m,h2m,flags:F,verdict,hrs}}
function quality(g,per,dep){normG(g);const A=aggC(hist(dk(g)),g.tf||1);return qualityA(A,entry(A,g),g,dep,Math.min(A.length,Math.floor(per/(g.tf||1))))}
/* walk-forward підбору для пари з тими самими таймфреймом, напрямком і плечем; mine — ці параметри на тестових вікнах */
function qualityWF(g,ex,per,o={folds:6,ns:4}){normG(g);const c={pair:g.pair,ex,fut:g.fut,per,amt:g.base*ladder(g),tf:g.tf||1,dr:g.d,lev:g.lev||1},w=wfo(c,o);if(!w)return null;
const tS=w.F[0].trE,A=aggC(hist(dk(g)),g.tf||1),e=entry(A,g),j0=lbT(A,tS),dep=g.base*ladder(g),s=summ(run(A.slice(j0),e.slice(j0),g,0,0,dep),dep);
return{...w,mine:s.roi,dep}}

export { Bot, entry, aggT, aggC, normG, tfMs, tfOff, DEF, rnd, lbT, lv, htfNeed, reinvestFactor };
