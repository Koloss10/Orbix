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
const DEF={tf:1,d:1,fut:1,lev:1,sg:['rsi','bb'],k:2,rp:14,rm:35,bn:20,bk:2,cn:20,cv:100,base:100,orders:5,step:.015,smul:1,mult:1.3,tp:.01,s1:0,tp2:.02,be:0,trail:0,sl:.04,cd:0,maxd:0,rv:0,xs:'',xmin:0,fm:0,wk:0,wn:0,wb:.6,lq:0,lqt:.003,lqn:2,lqd:.03,ak:0,lk:0,htf:0,hte:50,live:0,fee:.001,slip:.0005};
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
/* реінвест: множник розміру нової угоди = 1 + частка прибутку / маржа сітки (не менше 1). Спільна для рушія й ліміту ризику (runner/risk.js) */
function reinvestFactor(g,cum){if(!(g.rv>0)||!(cum>0))return 1;const M=g.base*(g.mult===1?g.orders:(g.mult**g.orders-1)/(g.mult-1));return M>0?1+g.rv*cum/M:1}
/* Нейтральний бот (g.d = 0): напрям обирається на вході — сигнали й фільтри рахуються для Long і для Short,
   вхід лише туди, куди сходяться; суперечливі сигнали — без входу. Напрям угоди — pos.d; gOf дає налаштування угоди. */
const dOf=(g,p)=>p&&p.d||g.d||1;
const gOf=(g,p)=>!g.d&&p&&p.d?{...g,d:p.d}:g;
function entry(A,g){if(!g.d){const L=entry(A,{...g,d:1}),S=entry(A,{...g,d:-1}),o=L.map((v,i)=>v&&!S[i]?1:S[i]&&!v?-1:0);
return L.x?withX(o,L.x.map((v,i)=>v?-1:S.x[i]?1:0)):o}
const S=g.sg.map(k=>SIG[k](A,g)),n=A.length,o=new Array(n).fill(false),f=PAIRS[g.pair],
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
class Bot{constructor(g,fr,flt){this.g=g;this.F=flt!==undefined?flt:(typeof fltOf==='function'?fltOf(g):null);this.pos=null;this.tr=[];this.cd=0;this.cum=0;this.nd=0;this.ft=g.ftk!=null?g.ftk:g.fee;this.fmk=g.fmk!=null?g.fmk:g.fee;
this.fr=fr!==undefined?fr:(g.fut&&typeof frOf==='function'?frOf(g.pair):null)}
/* реінвест: множник розміру нової угоди — частка g.rv накопиченого прибутку додається до маржі сітки (без зменшення після збитків) */
bf(){return reinvestFactor(this.g,this.cum)}
/* кількість за сумою й ціною з урахуванням кроку, мін. кількості й мін. ордера; 0 — біржа не прийме ордер */
qty(s,px){const F=this.F;if(!F)return s/px;const q=rnd(s/px,F.step,'floor');return q>0&&q>=(F.minQty||0)&&q*px>=(F.minN||0)-1e-9?q:0}
lp(x,up){const F=this.F;return F&&F.tick?rnd(x,F.tick,up?'ceil':'floor'):x}
eqv(r){const g=this.g,p=this.pos;if(!p)return this.cum;const v=p.q*r.c;return this.cum+p.real+dOf(g,p)*(v-p.cost)-this.ft*v}
fund(r){const p=this.pos,F=this.fr;if(!p||!F||!F.length||r.t==null)return;const W=tfMs(this.g.tf||1);let k=lbT(F,r.t);
for(;k<F.length&&F[k].t<r.t+W;k++){const px=F[k].t-r.t<6e4?r.o:r.c,a=dOf(this.g,p)*F[k].r*p.q*px*(this.g.frx!=null?this.g.frx:1);p.real-=a;p.fd+=a}}
step(i,r,en,h=i,xs=false){const g=this.g,p=this.pos,d=p?dOf(g,p):g.d||(en<0?-1:1),L=g.lev||1,fv=x=>d>0?r.h>=x:r.l<=x,ad=x=>d>0?r.l<=x:r.h>=x,adm=x=>d>0?(r.ml!=null?r.ml:r.l)<=x:(r.mh!=null?r.mh:r.h)>=x;
if(!p){if(en&&i>=this.cd&&!(g.maxd>0&&this.nd>=g.maxd)){const bf=this.bf(),q0=this.qty(g.base*L*bf,r.c);if(!q0)return;const s0=q0*r.c;this.pos={q:q0,bf,cost:s0,n:1,last:r.c,first:r.c,peak:r.c,real:-this.ft*s0,fd:0,t1:0,f:[{t:r.t,p:r.c,k:'e'}],...(g.d?{}:{d})}}return}
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
if(!x&&(xs===true||xs===-d)&&this.pos&&d*(r.c-p.cost/p.q)/(p.cost/p.q)>=(g.xmin||0)){x=r.c;tk=1;p.xsig=1}
if(x){let pnl;if(lq)pnl=p.real-p.cost/L;else{const v=p.q*x;pnl=p.real+d*(v-p.cost)-(tk?this.ft:this.fmk)*v}this.cum+=pnl;
this.tr.push({i:h,ts:r.t,pnl,n:p.n,...(p.d?{d:p.d}:{}),liq:lq,sl:stop&&!lq,...(p.xsig?{xs:1}:{}),fd:p.fd,f:p.f.concat({t:r.t,p:x,k:'x'})});this.pos=null;this.nd++;this.cd=i+g.cd+1}}}
function run(A,e,g,off=0,keep=0,dep=0){const b=new Bot(g),tf=g.tf||1,M=dep?g.base*ladder(g):0,eq=keep?[]:null;let pk=0,dd=0,v=0,broke=0;for(let i=0;i<A.length;i++){const ok=!dep||dep+v>=M;if(!ok)broke=1;b.step(i,A[i],ok?e[i]:false,off+i*tf,e.x&&e.x[i]);v=b.eqv(A[i]);if(v>pk)pk=v;if(v-pk<dd)dd=v-pk;if(keep)eq.push(v)}return{b,dd,last:v,eq,broke,pk}}
function summ(R,dep){const tr=R.b.tr;let w=0,gp=0,gl=0,o=0;for(const t of tr){if(t.pnl>0){w++;gp+=t.pnl}else gl-=t.pnl;o+=t.n}const n=tr.length,s=R.eq?Math.ceil(R.eq.length/240):1;
return{n,wr:n?w/n*100:0,pnl:R.last,real:R.b.cum,unr:R.last-R.b.cum,dd:R.dd,ddp:R.dd/dep*100,roi:R.last/dep*100,pf:gl?gp/gl:gp?Infinity:0,avg:n?R.b.cum/n:0,ao:n?o/n:0,liq:tr.filter(t=>t.liq).length,fund:tr.reduce((a,t)=>a+(t.fd||0),0)+(R.b.pos?R.b.pos.fd||0:0),broke:R.broke,cur:R.eq?R.eq.filter((_,i)=>i%s===0):[]}}
const ladder=g=>{let u=0;for(let k=0;k<g.orders;k++)u+=g.mult**k;return u};
function bt(g,per,dep,keep=1){normG(g);const tf=g.tf||1,A=aggC(hist(dk(g)),tf),k=Math.min(A.length,Math.floor(per/tf)),e=entry(A,g);return run(A.slice(-k),e.slice(-k),g,(A.length-k)*tf,keep,dep)}
function lv(g,p0,F){if(!g.d)g={...g,d:1};const L=[];let p=p0,q=0,c=0;const B=new Bot(g,null,F===undefined?null:F);for(let k=0;k<g.orders;k++){if(k)p=B.lp(p*(1-g.d*g.step*g.smul**(k-1)),g.d<0);const qq=B.qty(g.base*(g.lev||1)*g.mult**k,p);if(!qq)break;const s=qq*p;L.push({p,s});q+=qq;c+=s}const avg=c/q,Lv=g.lev||1;return{L,avg,tp:avg*(1+g.d*g.tp),sl:avg*(1-g.d*g.sl),liq:Lv>1?avg*(1-g.d*Math.max(1/Lv-.005,0)):0}}
const SC=[{n:'Різкий обвал −20% за годину',d:()=>0,v:.004,j:-.2},{n:'Повільне падіння −35% за 30 днів',d:()=>-.35/720,v:.0004,j:0},{n:'Обвал −40% за добу',d:i=>i<=24?-.4/24:0,v:.001,j:0},{n:'Різкий стрибок +20% за годину',d:()=>0,v:.004,j:.2},{n:'Pump +40% за 30 днів',d:()=>.4/720,v:.0004,j:0},{n:'Бічний ринок, висока волатильність',d:()=>0,v:.02,j:0},{n:'Волатильність ×3',d:()=>0,v:.018,j:0}];
function stress(g){const tf=g.tf||1,g2={...g,slip:.02};return SC.map(s=>{const R=rng(99);let c=100;const cs=[];for(let i=0;i<tf;i++)cs.push({o:100,h:100,l:100,c:100});for(let i=1;i<=720;i++){const r=(i===1?s.j:0)+s.d(i)+s.v*gs(R),n=c*(1+r),w=Math.abs(s.v*gs(R))*.6;cs.push({o:c,h:Math.max(c,n)*(1+w),l:Math.min(c,n)*(1-w),c:n});c=n}
const A=agg(cs,tf),b=new Bot(g2,null,(F=>F?{minN:F.minN}:null)(fltOf(g)));let mn=0,dca=0;A.forEach((r,i)=>{b.step(i,r,i===0);mn=Math.min(mn,b.eqv(r));if(b.pos)dca=Math.max(dca,b.pos.n)});dca=Math.max(dca,...b.tr.map(t=>t.n));
return{n:s.n,mn,dca,end:b.eqv(A[A.length-1]),liq:b.tr.some(t=>t.liq),sl:b.tr.filter(t=>t.sl).length,k:b.tr.length}})}
const STR=[['Mean reversion: RSI + Bollinger',['rsi','bb'],2],['Осцилятори: RSI, CCI, Stochastic (2 з 3)',['rsi','cci','stoch'],2],['Тренд + відкат: EMA, RSI, MACD',['ema','rsi','macd'],3],['Патерн + рівень підтримки',['pat','lvl'],2],['Fibonacci + RSI',['fib','rsi'],2],['TA-консенсус + Bollinger',['ta','bb'],2],['MACD + Stochastic',['macd','stoch'],2],
['SuperTrend + RSI',['st','rsi'],2],['Keltner + RSI',['kc','rsi'],2],['Parabolic SAR + MACD',['psar','macd'],2],['Hull MA + Stochastic',['hma','stoch'],2],['% зміни ціни + Bollinger',['pc','bb'],2]];
const pick=(R,a)=>a[R()*a.length|0];
/* Авто-майстер. Історія періоду ділиться на навчання (0–50 %), відбір (50–70 %) і перевірку (70–100 %, лише показ у evalC).
   1) широкий пошук: таймфрейм × стратегія × напрям × випадкові параметри — оцінка на навчанні;
   2) доведення: найкращі кандидати — сусідні значення по одному параметру;
   3) фільтри й вихід за сигналом: кожен варіант лишається, лише якщо покращує оцінку на навчанні;
   4) відбір за навчанням і відбором разом (темп на годину, обидва мають бути в плюсі), перевірку підбір не бачить. */
const AMG={orders:[3,4,5,6,7,8],mult:[1,1.1,1.2,1.3,1.5,1.7],step:[.006,.008,.012,.016,.022,.03,.04],smul:[1,1.2,1.5],tp:[.004,.005,.008,.012,.018,.025],sl:[.03,.04,.06,.08,.1,.12],trail:[0,.005,.01]};
const amSc=s=>s.roi+2*s.ddp-(s.liq?500:0)-(s.broke?500:0)-(s.pf<1?20:0);
function amBase(c,g){const lev=g.lev,U=ladder(g),mnN=minN(c),base=c.amt>0?c.amt/U:Math.max(10,Math.ceil(mnN/(c.fut===0?1:lev)*1.05));return base<5||base*(c.fut===0?1:lev)<mnN?0:base}
function amRun(o,g,a,b){const dep=o.c.amt>0?o.c.amt:2*g.base*ladder(g),s=summ(run(o.cs.slice(a,b),o.e.slice(a,b),g,o.off+a*g.tf,0,dep),dep);return s}
/* на навчанні (половина періоду) щонайменше 10 угод: інакше на перевірці (30 %) їх майже не буде */
function amEval(o,g){const s=amRun(o,g,0,o.t1);return s.n<10?null:{g,s,sc:amSc(s)}}
/* стійкість: темп і на навчанні, і на відборі (гірший з двох); відбір у мінусі чи з 1–2 угодами — кандидат відкидається.
   Фільтри оцінюються саме так: їхня користь — у зміні ринку, якої навчання може не містити */
function amRob(o){const h=o.t1>>1,a=amRun(o,o.g,0,h),b=amRun(o,o.g,h,o.t1),v=amRun(o,o.g,o.t1,o.tr),T=o.g.tf;o.v=v;o.ok=v.n>=3&&v.pnl>0&&a.pnl>0&&b.pnl>0;o.rob=!o.ok?-1e9+amSc(v):Math.min(amSc(a)/(h*T),amSc(b)/((o.t1-h)*T),amSc(v)/((o.tr-o.t1)*T))*1e3}
function amMut(R,g,c,LV){const k=pick(R,Object.keys(AMG).concat(LV.length>1?['lev']:[])),L=k==='lev'?LV:AMG[k],i=L.indexOf(g[k]),j=i<0?R()*L.length|0:Math.max(0,Math.min(L.length-1,i+(R()<.5?-1:1)));
const n={...g,[k]:L[j]};n.base=amBase(c,n);return n.base?n:null}
function amFlt(g){const V=[],H=g.tf<4?4:g.tf<24?24:g.tf<168?168:0;if(H)V.push({htf:H,hte:50});V.push({wk:2.5,wn:0,wb:.6},{ak:2},{lk:2},{xs:g.sg[0]});return V}
/* напрями пошуку: c.dr = 1 / −1 — лише він, 9 — лише нейтральний, 0 — Long і Short (на споті лише Long) */
const amDirs=c=>c.dr===9?(c.fut===0?[]:[0]):c.dr?[c.dr]:c.fut===0?[1]:[1,-1];
function auto(c,salt=0){const H=hist(dk(c)),R=rng((c.amt|0)*7+c.pair.length*7919+salt),cand=[],mxL=c.fut===0?1:maxLev(c.pair,c.ex),LV=c.lev?[Math.min(c.lev,mxL)]:[1,2,3].filter(x=>x<=mxL);
for(const tf of c.tf?[c.tf]:[1,4,12,24,168]){const A=aggC(H,tf),k=Math.floor(c.per/tf);if(k<60||k>A.length)continue;const t1=Math.floor(k*.5),tr=Math.floor(k*.7),cs=A.slice(-k),off=(A.length-k)*tf;
for(const [name,sg,kk] of STR)for(const d of amDirs(c)){const g0=normG({...DEF,pair:c.pair,ex:c.ex,sg,k:kk,d,tf,rm:pick(R,[30,35,40]),fut:c.fut,name}),o={c,A,cs,off,t1,tr,k,e:entry(A,g0).slice(-k)};let best=null;
for(let j=0;j<8;j++){const g={...g0,orders:3+(R()*6|0),mult:pick(R,AMG.mult),lev:pick(R,LV),step:pick(R,AMG.step.slice(1,6)),smul:pick(R,AMG.smul),tp:pick(R,AMG.tp.slice(1,5)),sl:pick(R,AMG.sl.slice(1,5)),trail:pick(R,AMG.trail)};g.base=amBase(c,g);if(!g.base)continue;
const r=amEval(o,g);if(r&&(!best||r.sc>best.sc))best=r}if(best)cand.push({...o,...best})}}
cand.sort((a,b)=>b.sc-a.sc);const top=cand.slice(0,12);
for(const o of top){for(let j=0;j<14;j++){const g=amMut(R,o.g,c,LV);if(!g)continue;const r=amEval(o,g);if(r&&r.sc>o.sc){o.g=g;o.s=r.s;o.sc=r.sc}}
amRob(o);for(const f of amFlt(o.g)){const g={...o.g,...f},e=entry(o.A,g).slice(-o.k),q={...o,e},r=amEval(q,g);if(!r)continue;Object.assign(q,r);amRob(q);if(q.rob>o.rob+1){o.g=g;o.e=e;o.s=r.s;o.sc=r.sc;o.v=q.v;o.ok=q.ok;o.rob=q.rob}}}
top.sort((a,b)=>b.rob-a.rob);const good=top.filter(o=>o.ok),seen={},out=[];for(const o of good.length?good:top.slice(0,1)){const key=o.g.name+o.g.tf+o.g.d;if(seen[key])continue;seen[key]=1;out.push({g:o.g,cs:o.cs,e:o.e,tr:o.tr,off:o.off,sc:o.rob});if(out.length==3)break}return out}
function evalC(o,c){const g=o.g,M=g.base*ladder(g),d0=c.amt>0?c.amt:2*M,Rf=run(o.cs,o.e,g,o.off,1,d0),Rt=run(o.cs.slice(o.tr),o.e.slice(o.tr),g,o.off+o.tr*g.tf,0,d0),sx=stress(g),worst=Math.min(...sx.map(x=>x.mn)),sf0=summ(Rf,d0),reserve=Math.max(1.5*-sf0.dd,-worst),need=M+reserve,dep=c.amt>0?c.amt:need,sf=summ(Rf,dep),st=summ(Rt,dep);
return{g,sf,st,sx,M,dep,reserve,need,fund:PAIRS[g.pair].f}}



