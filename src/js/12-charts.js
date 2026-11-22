/* ---------- графік у стилі біржового термінала (canvas) ---------- */
function cm(A,k,fn){const c=A._c||(A._c={});return c[k]&&c[k].n===A.length?c[k].v:(c[k]={n:A.length,v:fn()}).v}
function srl(A){return cm(A,'sr',()=>{const o=[],m=Math.max(5,A.length-600);for(let i=m+4;i<A.length-4;i++){let a=1,b=1;for(let j=i-4;j<=i+4;j++){if(A[j].h>A[i].h)a=0;if(A[j].l<A[i].l)b=0}if(a)o.push(A[i].h);if(b)o.push(A[i].l)}o.sort((a,b)=>a-b);const g=[];for(const p of o){const l=g[g.length-1];if(l&&p/l.p<1.006){l.p=(l.p*l.n+p)/(l.n+1);l.n++}else g.push({p,n:1})}return g.filter(c=>c.n>=2).sort((a,b)=>b.n-a.n).slice(0,6)})}
/* ---------- дані для графіків ---------- */
const TZ=()=>new Date().getTimezoneOffset()*6e4,lt=t=>Math.floor((t-TZ())/1e3);
function barsOf(pair,tf){const H=D[pair],A=aggC(H,tf).slice(),lv=MD.live[pair],end=A.length?A[A.length-1].t+tfMs(tf):-1/0;let j=H.length;while(j>0&&H[j-1].t>=end)j--;let tail=H.slice(j);if(lv&&lv.t>H[H.length-1].t&&lv.t>=end)tail=tail.concat(lv);
if(tail.length){let h=-1/0,l=1/0,v=0;for(const c of tail){h=Math.max(h,c.h);l=Math.min(l,c.l);v+=c.v||0}const W=tfMs(tf),off=tfOff(tf);A.push({t:tf===1?tail[0].t:Math.floor((tail[0].t-off)/W)*W+off,o:tail[0].o,h,l,c:tail[tail.length-1].c,v})}return A}
const pfmt=p=>{p=Math.abs(p)||1;const d=p>=1000?2:p>=1?4:Math.min(10,Math.ceil(-Math.log10(p))+4);return{type:'price',precision:d,minMove:+(10**-d).toFixed(d)}};
/* маркери купівлі/продажу з угод бота: f — заповнення {t,p,k:'e'|'x'} */
function tradeMarks(tr,pos,g){const C=TH(),o=[];const add=f=>{if(!f||!f.t)return;const buy=(f.k==='e'||f.k==='m')===(g.d>0);o.push({t:f.t,buy,p:f.p})};(tr||[]).slice(-150).forEach(t=>(t.f||[]).forEach(add));if(pos&&pos.f)pos.f.forEach(add);
return o.map(m=>({t:m.t,position:m.buy?'belowBar':'aboveBar',color:m.buy?C.up:C.dn,shape:m.buy?'arrowUp':'arrowDown',text:m.buy?'B':'S',size:.8}))}
/* ---------- біржовий графік (Lightweight Charts v5, вбудований у файл): market | full | mini ---------- */
const sma=(c,n)=>{const o=[];let s=0;for(let i=0;i<c.length;i++){s+=c[i];if(i>=n)s-=c[i-n];o.push(i>=n-1?s/n:NaN)}return o};
function kdj(A,n=9){let k=50,d=50;const K=[],Q=[],J=[];for(let i=0;i<A.length;i++){let hh=-1/0,ll=1/0;for(let j=Math.max(0,i-n+1);j<=i;j++){if(A[j].h>hh)hh=A[j].h;if(A[j].l<ll)ll=A[j].l}const r=hh>ll?(A[i].c-ll)/(hh-ll)*100:50;k=2/3*k+r/3;d=2/3*d+k/3;K.push(k);Q.push(d);J.push(3*k-2*d)}return[K,Q,J]}
function heikin(A){const o=[];let po=null,pc=0;for(const c of A){const hc=(c.o+c.h+c.l+c.c)/4,ho=po==null?(c.o+c.c)/2:(po+pc)/2;o.push({t:c.t,o:ho,h:Math.max(c.h,ho,hc),l:Math.min(c.l,ho,hc),c:hc,v:c.v});po=ho;pc=hc}return o}
const MTF=[['1m','1м'],['5m','5м'],['15m','15м'],['1h','1г'],['4h','4г'],['1d','1д'],['1w','1т']],IVH={'1h':1,'4h':4,'1d':24,'1w':168},BYIV={'1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1d':'D','1w':'W'};
const MKB={};
async function mkBars(key,iv,lim=1000){const s=sym(pairOf(key));
if(isF(key)){if(MD.fk==='by'){const j=await jget(`${MD.fbase}/v5/market/kline?category=linear&symbol=${s}&interval=${BYIV[iv]}&limit=${lim}`);if(j.retCode)throw new Error(j.retMsg||'Bybit');return(j.result.list||[]).map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).reverse()}
const j=await jget(`${MD.fbase}/fapi/v1/klines?symbol=${s}&interval=${iv}&limit=${lim}`);return j.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]}))}
if(MD.k==='by'){const j=await jget(`${MD.base}/v5/market/kline?category=spot&symbol=${s}&interval=${BYIV[iv]}&limit=${lim}`);if(j.retCode)throw new Error(j.retMsg||'Bybit');return(j.result.list||[]).map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).reverse()}
const j=await jget(`${MD.base}/api/v3/klines?symbol=${s}&interval=${iv}&limit=${lim}`);return j.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]}))}
/* свічки для Ринку: live — будь-який інтервал напряму з біржі, демо — з годинної історії */
function mktData(pair,iv,redraw){if(MD.mode!=='live')return D[pair]?barsOf(pair,IVH[iv]||1):null;
const k=pair+'|'+iv,e=MKB[k];if(e)return e.a;if(!MKB['_'+k]){MKB['_'+k]=1;mkBars(pair,iv).then(a=>{MKB[k]={a};redraw()}).catch(er=>{MKB['_'+k]=0;redraw(er)})}return null}
async function mktPoll(pair,iv){const e=MKB[pair+'|'+iv];if(!e||!e.a.length)return 0;const b=await mkBars(pair,iv,2);for(const c of b){const L=e.a[e.a.length-1];if(c.t===L.t)e.a[e.a.length-1]=c;else if(c.t>L.t)e.a.push(c)}return 1}
function lwChart(el,get,mode='full'){const LC=window.LightweightCharts;if(!LC){el.innerHTML='<p class="dn">Бібліотека графіків не завантажилась.</p>';return()=>{}}
const mkm=mode==='market',full=mode!=='mini',KEY='zch-'+mode,S0=full?ld(KEY,{}):{},BT=[[1,'1г'],[4,'4г'],[12,'12г'],[24,'1д'],[168,'1т']];
const S={tf:0,iv:S0.iv||'1h',type:S0.type||'candle',ov:{ma:1,ema:0,boll:0,lv:1,sr:0,fib:0,...(S0.ov||{})},vol:full?(S0.vol!=null?S0.vol:1):0,sub:{macd:0,rsi:0,kdj:0,...(S0.sub||{})},tool:'',pend:null,sig:'',pl:[],tl:[],subS:[],fr:0,pair:''};
const save=()=>{if(full)sv(KEY,{iv:S.iv,type:S.type,ov:S.ov,vol:S.vol,sub:S.sub})};
const B=(a,l,t)=>`<button class="b tg" ${a} title="${t||l}">${l}</button>`;
el.classList.add('xw');
el.innerHTML=(mkm?'<div class="xh"></div>':'')+(full?`<div class="cx nw">${mkm?MTF.map(([k,l])=>B(`data-iv="${k}"`,l)).join(''):BT.map(([k,l])=>B(`data-t="${k}"`,l)).join('')}<span style="flex:1"></span><select class="xsel" aria-label="Тип графіка"><option value="candle">Свічки</option><option value="ha">Heikin Ashi</option><option value="line">Лінія</option><option value="area">Область</option></select>${B('data-fs="1" aria-label="На весь екран"','⛶','На весь екран')}</div>`:`<div class="cx nw">${B('data-v="1"','Обсяг','Показати/сховати обсяг')}</div>`)
+`<div class="lwc ${full?'full':'mini'}"><div class="lg"></div></div>`
+(full?`<div class="cx nw" style="margin-top:8px">${B('data-o="ma"','MA')}${B('data-o="ema"','EMA')}${B('data-o="boll"','BOLL')}${B('data-v="1"','VOL','Обсяг')}${B('data-s="macd"','MACD')}${B('data-s="rsi"','RSI')}${B('data-s="kdj"','KDJ')}${mkm?'':B('data-o="lv"','Сітка')+B('data-o="sr"','S/R')+B('data-o="fib"','Fib')}</div>
<div class="cx nw">${B('data-dr="h"','― Рівень','Горизонтальна лінія: торкніться графіка')}${B('data-dr="t"','╱ Тренд','Трендова лінія: дві точки на графіку')}${B('data-dr="x"','Очистити','Прибрати малювання')}<span style="flex:1"></span>${B('data-z="1" aria-label="До останньої свічки й автомасштаб"','⇥','До останньої свічки й автомасштаб ціни')}</div>`:'');
const box=el.querySelector('.lwc'),lg=box.querySelector('.lg'),xh=el.querySelector('.xh'),C0=TH();
const ch=LC.createChart(box,{autoSize:true,layout:{background:{type:'solid',color:'transparent'},textColor:C0.mu,fontFamily:'JetBrains Mono, monospace',fontSize:11,panes:{separatorColor:C0.ln}},grid:{vertLines:{color:C0.ln},horzLines:{color:C0.ln}},rightPriceScale:{borderColor:C0.ln},timeScale:{borderColor:C0.ln,timeVisible:true,secondsVisible:false,rightOffset:4},crosshair:{mode:0},localization:{locale:'uk-UA'}});
const L1=(o={})=>ch.addSeries(LC.LineSeries,{lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,...o},o._p||0);
let main=null,mrk=null;
function mkMain(){if(main){ch.removeSeries(main);S.pl=[]}const C=TH(),t=S.type;
main=t==='line'?ch.addSeries(LC.LineSeries,{color:C.ac,lineWidth:2},0):t==='area'?ch.addSeries(LC.AreaSeries,{lineColor:C.ac,topColor:C.ac+'55',bottomColor:C.ac+'05',lineWidth:2},0):ch.addSeries(LC.CandlestickSeries,{borderVisible:false},0);
mrk=LC.createSeriesMarkers(main,[]);S.sig=''}
mkMain();
const vs=ch.addSeries(LC.HistogramSeries,{priceScaleId:'vol',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false},0);ch.priceScale('vol').applyOptions({scaleMargins:{top:.8,bottom:0}});
const IND={ma7:L1(),ma25:L1(),ma99:L1(),e50:L1(),e200:L1(),bu:L1(),bm:L1({lineStyle:2}),bl:L1()};
function subs(){S.subS.forEach(x=>ch.removeSeries(x.s));S.subS=[];let p=1;const C=TH();
const add=(k,def,o)=>{const s=ch.addSeries(def,{priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:false,lineWidth:1,...o},p);S.subS.push({k,s});return s};
if(S.sub.macd){add('mh',LC.HistogramSeries,{});add('md',LC.LineSeries,{color:C.ac});add('ms',LC.LineSeries,{color:C.warn});p++}
if(S.sub.rsi){const r=add('rsi',LC.LineSeries,{color:C.ac2});r.createPriceLine({price:70,color:C.mu,lineStyle:2,lineWidth:1,axisLabelVisible:false});r.createPriceLine({price:30,color:C.mu,lineStyle:2,lineWidth:1,axisLabelVisible:false});p++}
if(S.sub.kdj){add('kk',LC.LineSeries,{color:C.ac});add('kd',LC.LineSeries,{color:C.warn});add('kj',LC.LineSeries,{color:C.ac2});p++}
const n=p-1,ps=ch.panes();if(ps[0])ps[0].setStretchFactor(3);for(let i=1;i<ps.length;i++)ps[i].setStretchFactor(1);
if(full)box.style.height=`calc(min(62vh,560px) + ${n*120}px)`;S.sig=''}
const btn=()=>{const q=(s,f)=>el.querySelectorAll(s).forEach(b=>b.setAttribute('aria-pressed',!!f(b)));
q('[data-iv]',b=>b.dataset.iv===S.iv);q('[data-t]',b=>+b.dataset.t===S.tf);q('[data-o]',b=>S.ov[b.dataset.o]);q('[data-s]',b=>S.sub[b.dataset.s]);q('[data-v]',()=>S.vol);q('[data-dr]',b=>b.dataset.dr===S.tool);q('[data-fs]',()=>el.classList.contains('xfs'));
el.querySelectorAll('[data-iv]').forEach(b=>b.hidden=MD.mode!=='live'&&!IVH[b.dataset.iv]);const s=el.querySelector('.xsel');if(s)s.value=S.type};
const DK=()=>'zdraw:'+S.pair,drw=()=>ld(DK(),[]);
let A=[],Bv=[];const tfl2=()=>mkm?(MTF.find(x=>x[0]===S.iv)||[0,S.iv])[1]:tfl(S.tf);
const leg=c=>{if(!c)return;const g=(c.c/c.o-1)*100,am=c.l?(c.h/c.l-1)*100:0;lg.innerHTML=`<span style="color:var(--tx)">${S.pair} · ${tfl2()}</span>${MD.mode==='live'?' · '+mkLbl(S.key):' · демо'}${S.tool?` · <span style="color:var(--ac)">${S.tool==='h'?'торкніться рівня':S.pend?'друга точка':'перша точка'}</span>`:''}<br>O ${px(c.o)} H ${px(c.h)} L ${px(c.l)} C <span class="${cls(g)}">${px(c.c)} (${f(g,2)}%)</span> A ${am.toFixed(2)}%${c.v!=null&&S.vol?' V '+n2(c.v,0):''}`};
ch.subscribeCrosshairMove(p=>{if(!p||p.time==null){leg(Bv[Bv.length-1]);return}let i=-1,lo=0,hi=Bv.length-1;const tt=p.time;while(lo<=hi){const m=(lo+hi)>>1,x=lt(Bv[m].t);if(x===tt){i=m;break}if(x<tt)lo=m+1;else hi=m-1}if(i>=0)leg(Bv[i])});
ch.subscribeClick(p=>{if(!S.tool||!p||!p.point||p.time==null)return;const pr=main.coordinateToPrice(p.point.y);if(pr==null||!isFinite(pr))return;const t=p.time*1e3+TZ(),L=drw();
if(S.tool==='h'){L.push({k:'h',p:pr});S.tool=''}else if(!S.pend){S.pend={t,p:pr}}else{L.push({k:'t',a:S.pend,b:{t,p:pr}});S.pend=null;S.tool=''}sv(DK(),L);btn();draw()});
const snap=(t)=>{let lo=0,hi=A.length-1;if(!A.length||t<A[0].t)return null;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m].t<=t)lo=m;else hi=m-1}return lt(A[lo].t)};
function hdr(){if(!xh)return;let c,o,h,l,q;const tk=MD.mode==='live'&&(isF(S.key)?MD.ftk:MD.tk)[sym(S.pair)];
if(tk){c=tk.c;o=tk.o;h=tk.h;l=tk.l;q=tk.q}else{const H=D[S.key||S.pair];if(!H)return;const z=H.slice(-24);c=lastC(S.key||S.pair).c;o=z[0].o;h=Math.max(...z.map(x=>x.h));l=Math.min(...z.map(x=>x.l));q=z.reduce((a,x)=>a+x.v*x.c,0)}
const g=o?(c/o-1)*100:0;xh.innerHTML=`<div><b class="xp">${esc(S.pair)}</b> <span class="mu" style="font-size:11px">${isF(S.key)?'Perp':'Spot'}</span><div class="mono ${cls(g)}" style="font-size:22px">${px(c)}</div></div><div class="xs"><span>24г зміна<b class="${cls(g)}">${f(g,2)}%</b></span><span>24г макс.<b>${h!=null?px(h):'—'}</b></span><span>24г мін.<b>${l!=null?px(l):'—'}</b></span><span>Обсяг 24г, USDT<b>${q!=null?n2(q,0):'—'}</b></span></div>`}
function draw(err){if(!el.isConnected)return;const d=get();if(!d||!d.pair||!PAIRS[d.pair])return;const C=TH(),dkey=d.key||d.pair;S.key=dkey;
if(!full&&d.tf)S.tf=d.tf;if(!mkm&&!S.tf)S.tf=d.tf||1;if(mkm&&MD.mode!=='live'&&!IVH[S.iv])S.iv='1h';
if(S.pair!==d.pair){S.pair=d.pair;S.pend=null}hdr();
const raw=mkm?mktData(dkey,S.iv,draw):(ready(dkey)?barsOf(dkey,S.tf):null);
if(!raw||!raw.length){lg.innerHTML=err?`<span class="dn">Не вдалося завантажити: ${esc(err.message)}</span>`:'Завантажую…';return}
ch.applyOptions({layout:{textColor:C.mu,panes:{separatorColor:C.ln}},grid:{vertLines:{color:C.ln},horzLines:{color:C.ln}},rightPriceScale:{borderColor:C.ln},timeScale:{borderColor:C.ln}});
if(S.type==='line')main.applyOptions({color:C.ac});else if(S.type==='area')main.applyOptions({lineColor:C.ac,topColor:C.ac+'55',bottomColor:C.ac+'05'});else main.applyOptions({upColor:C.up,downColor:C.dn,wickUpColor:C.up,wickDownColor:C.dn});
A=raw;Bv=S.type==='ha'?heikin(A):A;const key=d.pair+'|'+(mkm?S.iv:S.tf),sig=key+'|'+S.type+'|'+A.length+'|'+A[0].t+'|'+MD.mode;
const T=c=>lt(c.t),bar=S.type==='line'||S.type==='area'?c=>({time:T(c),value:c.c}):c=>({time:T(c),open:c.o,high:c.h,low:c.l,close:c.c}),vb=c=>({time:T(c),value:c.v||0,color:(c.c>=c.o?C.up:C.dn)+'59'});
const ln=v=>v.map((y,i)=>isFinite(y)?{time:T(A[i]),value:y}:{time:T(A[i])});
if(sig!==S.sig){if(S.sig.split('|').slice(0,2).join('|')!==key)S.fr=1;S.sig=sig;main.applyOptions({priceFormat:pfmt(A[A.length-1].c)});main.setData(Bv.map(bar));vs.setData(A.map(vb))}
else{main.update(bar(Bv[Bv.length-1]));vs.update(vb(A[A.length-1]))}
const cl0=A.map(c=>c.c);
if(full){const on=(s,v,data,col)=>{s.applyOptions({visible:!!v,color:col});if(v)s.setData(data())};
on(IND.ma7,S.ov.ma,()=>ln(sma(cl0,7)),C.warn);on(IND.ma25,S.ov.ma,()=>ln(sma(cl0,25)),C.ac2);on(IND.ma99,S.ov.ma,()=>ln(sma(cl0,99)),C.ac);
on(IND.e50,S.ov.ema,()=>ln(ema(cl0,50)),C.up);on(IND.e200,S.ov.ema,()=>ln(ema(cl0,200)),C.dn);
const BB=S.ov.boll?bbands(cl0,20,2):null;on(IND.bu,S.ov.boll,()=>ln(BB[1]),C.mu);on(IND.bl,S.ov.boll,()=>ln(BB[0]),C.mu);on(IND.bm,S.ov.boll,()=>ln(sma(cl0,20)),C.mu);
for(const x of S.subS){if(x.k==='mh'){const f2=ema(cl0,12),s2=ema(cl0,26),m=f2.map((v,i)=>v-s2[i]),g=ema(m,9);x.s.setData(m.map((v,i)=>({time:T(A[i]),value:v-g[i],color:(v-g[i]>=0?C.up:C.dn)+'99'})));S.subS.find(y=>y.k==='md').s.setData(ln(m));S.subS.find(y=>y.k==='ms').s.setData(ln(g))}
if(x.k==='rsi')x.s.setData(ln(rsi(cl0,14)));if(x.k==='kk'){const K=kdj(A);x.s.setData(ln(K[0]));S.subS.find(y=>y.k==='kd').s.setData(ln(K[1]));S.subS.find(y=>y.k==='kj').s.setData(ln(K[2]))}}}
else Object.values(IND).forEach(s=>s.applyOptions({visible:false}));
vs.applyOptions({visible:!!S.vol});
S.pl.forEach(l=>main.removePriceLine(l));S.pl=[];const pl=(p,col,t,st)=>{if(isFinite(p)&&p>0)S.pl.push(main.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:st==null?2:st,axisLabelVisible:true,title:t}))};
if(!mkm&&full&&S.ov.sr)srl(A).forEach(c=>pl(c.p,C.warn,'S/R',1));
if(!mkm&&full&&S.ov.fib){const V=A.slice(-150);let hi=-1/0,lo=1/0,hj=0,lj=0;V.forEach((c,i)=>{if(c.h>hi){hi=c.h;hj=i}if(c.l<lo){lo=c.l;lj=i}});[0,.236,.382,.5,.618,.786,1].forEach(r=>pl(lj<hj?hi-(hi-lo)*r:lo+(hi-lo)*r,C.ac2,'Fib '+r,1))}
if((!full||S.ov.lv)&&d.lv)d.lv().forEach(l=>pl(l.p,l.c||C.mu,l.t,2));
S.tl.forEach(s=>ch.removeSeries(s));S.tl=[];if(full)for(const w of drw()){if(w.k==='h')pl(w.p,C.ac,'✎',0);else{const a=snap(w.a.t),b=snap(w.b.t);if(a==null||b==null||a===b)continue;const P=[{time:a,value:w.a.p},{time:b,value:w.b.p}].sort((x,y)=>x.time-y.time);const s=L1({color:C.ac,lineWidth:2});s.setData(P);S.tl.push(s)}}
const M=d.mk?d.mk():[];if(S.fr){S.fr=0;const n=A.length,w=full?120:90;let to=n+3;if(M.length){const lm=Math.max(...M.map(m=>m.t));if(lm<A[Math.max(0,n-w)].t){let j=A.findIndex(c=>c.t>lm);if(j<0)j=n;to=Math.min(n+3,j+Math.round(w/3))}}ch.timeScale().setVisibleLogicalRange({from:Math.max(0,to-w),to});ch.priceScale('right').applyOptions({autoScale:true})}
if(M.length){const o=[];for(const m of M){const t=snap(m.t);if(t!=null)o.push({time:t,position:m.position,color:m.color,shape:m.shape,text:m.text,size:m.size})}o.sort((a,b)=>a.time-b.time);mrk.setMarkers(o)}else mrk.setMarkers([]);
leg(Bv[Bv.length-1])}
el.onclick=e=>{const b=e.target.closest('button');if(!b||!el.contains(b))return;const q=b.dataset;
if(q.iv){S.iv=q.iv;S.sig=''}else if(q.t){S.tf=+q.t;S.sig=''}else if(q.o)S.ov[q.o]=!S.ov[q.o];else if(q.v)S.vol=S.vol?0:1;else if(q.s){S.sub[q.s]=!S.sub[q.s];subs()}
else if(q.dr){if(q.dr==='x'){sv(DK(),[]);S.tool='';S.pend=null}else{S.tool=S.tool===q.dr?'':q.dr;S.pend=null}}
else if(q.z){ch.timeScale().scrollToRealTime();ch.priceScale('right').applyOptions({autoScale:true})}else if(q.fs){el.classList.toggle('xfs');document.body.style.overflow=el.classList.contains('xfs')?'hidden':''}else return;save();btn();draw()};
el.onchange=e=>{if(e.target.classList.contains('xsel')){S.type=e.target.value;mkMain();save();draw()}};
el.onkeydown=e=>{if(e.key==='Escape'&&el.classList.contains('xfs')){el.classList.remove('xfs');document.body.style.overflow='';btn()}};
el._d=draw;el._tf=v=>{if(v&&v!==S.tf){S.tf=v;S.sig=''}};el._poll=async()=>{if(mkm&&MD.mode==='live'&&S.pair&&await mktPoll(S.pair,S.iv))draw()};el.classList.add('chv');subs();btn();draw();return draw}

function lines(g,pos,pair){const C=TH(),last=lastC(pair).c,A=lv(g,pos?pos.first:last,fltOf(g)),n=pos?pos.n:0,avg=pos?pos.cost/pos.q:A.avg,L=g.lev||1,o=[];
A.L.forEach((l,k)=>o.push({p:l.p,c:k<n?C.ac:C.mu,t:'#'+(k+1),d:k>=n}));
/* трейлінг: TP лише вмикає трейлінг (угода не закривається на TP); після активації (pos.ta) — лінія стопа трейлінгу від максимуму */
const tr=+g.trail>0,ta=tr&&pos&&pos.ta&&pos.peak>0;
o.push({p:avg,c:C.tx,t:'середня',d:1},{p:avg*(1+g.d*g.tp),c:ta?C.mu:C.up,t:ta?'TP досягнуто':tr?'TP → трейлінг':'TP',d:ta?1:0},{p:avg*(1-g.d*g.sl),c:C.dn,t:'SL'});
if(ta)o.push({p:pos.peak*(1-g.d*g.trail),c:C.up,t:'трейлінг-стоп'});
if(L>1)o.push({p:avg*(1-g.d*Math.max(1/L-.005,0)),c:C.ac2,t:'ліквідація'});return o}

