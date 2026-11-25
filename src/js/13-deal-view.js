/* ---------- вигляд угоди на картці бота: статус і головне віконце (драбина з кільцем, табло, графік-фон) ----------
   dealPlan — чистий розрахунок за тими самими правилами, що й рушій (Bot.step): наступні докупівлі від ціни останнього
   виконання, кроки step·smul^k і суми base·lev·bf·mult^k; докупівля досяжна, лише поки лежить до SL і ліквідації від
   поточної середньої; SL на картці — кінцевий, після останньої досяжної докупівлі (як стоп на біржі, mirror.js slStop). */
const VWS=[['ladder','Драбина'],['board','Табло'],['chart','Графік']];
const vwOk=v=>VWS.some(([k])=>k===v)?v:'ladder';
function dealPlan(g,p,px){const d=g.d<0?-1:1,L=g.lev||1,ft=g.ftk!=null?g.ftk:g.fee||0,bf=p.bf||1,avg=p.cost/p.q;
const pnl0=p.real+d*(p.q*px-p.cost)-ft*p.q*px,pnl=Math.abs(pnl0)<.005?0:pnl0,margin=p.cost/L;
const done=(p.f||[]).filter(e=>e.k==='e').map((e,i)=>({k:i+1,p:e.p}));
const lim=a=>{const s=a*(1-d*g.sl),q=L>1?a*(1-d*Math.max(1/L-.005,0)):0;return q&&(d>0?q>s:q<s)?q:s};
const rest=[];let q=p.q,cost=p.cost,prev=p.last||avg;
if(!p.t1&&!p.dx)for(let k=p.n;k<(g.orders||1);k++){const pr=prev*(1-d*g.step*(g.smul||1)**(k-1)),n=g.base*L*bf*(g.mult||1)**k;
const ok=!rest.some(r=>!r.ok)&&(d>0?pr>lim(cost/q):pr<lim(cost/q));if(ok){q+=n/pr;cost+=n}rest.push({k:k+1,p:pr,m:n/L,ok});prev=pr}
const fin=cost/q,sl=p.t1&&p.be?p.be:g.sl>0?fin*(1-d*g.sl):0,liq=L>1?fin*(1-d*Math.max(1/L-.005,0)):0;
const trail=p.ta&&g.trail>0&&p.peak>0;
const tp=trail?p.peak*(1-d*g.trail):p.t1&&p.a1?p.a1*(1+d*(g.tp2||g.tp)):avg*(1+d*g.tp);
const next=rest.find(r=>r.ok)||null,tot=(g.base||0)*bf*Array.from({length:g.orders||1},(_,k)=>(g.mult||1)**k).reduce((a,b)=>a+b,0);
return{d,px,pnl,roe:margin>0?pnl/margin:0,avg,tp,tpKind:trail?'trail':'tp',sl,liq,done,rest,next,n:p.n,orders:g.orders||1,used:margin,tot,
tpGain:p.real+d*(p.q*tp-p.cost)-ft*p.q*tp}}
/* статус бота як у Veles: помилка → зупинено → в угоді → очікує сигнал */
function botSt(x){const p=x.b.pos;if(typeof srvErr==='function'&&srvErr(x))return['err','Помилка'];if(!x.on)return['stop','Зупинено'];
if(p)return['deal','В угоді'];if(x.g.maxd>0&&(x.b.nd||0)>=x.g.maxd)return['stop','Зупинено'];if(x.srvSa)return['stop','Зупинено'];return['wait','Очікує сигнал']}
const dpx=v=>n2(v,v<1?5:v<100?3:2);
const dpc=(a,b)=>{const r=(a/b-1)*100;return(r>0?'+':r<0?'−':'')+n2(Math.abs(r),Math.abs(r)<10?2:1)+' %'};
const dcol=v=>v>=0?'var(--up)':'var(--dn)';
/* ціль праворуч: TP / трейлінг; ліворуч — наступний ордер, без нього — SL */
const dTgt=P=>P.tpKind==='trail'?'Трейлінг':'TP';
const dLeft=P=>P.next?{t:'Ордер '+P.next.k,to:'ордера '+P.next.k,p:P.next.p,c:'var(--warn)'}:P.sl?{t:'SL',to:'SL',p:P.sl,c:'var(--dn)'}:null;
/* С — кільце PnL і драбина всіх рівнів (прибутковий бік завжди праворуч) */
function dvLadder(x,P){const C=2*Math.PI*42,lt=dLeft(P),pr=P.pnl>=0?Math.min(1,Math.abs(P.px-P.avg)/Math.max(1e-12,Math.abs(P.tp-P.avg))):lt?Math.min(1,Math.abs(P.px-P.avg)/Math.max(1e-12,Math.abs(lt.p-P.avg))):0;
const vs=[P.px,P.tp,P.avg,...P.done.map(o=>o.p),...P.rest.filter(o=>o.ok).map(o=>o.p),...(P.sl?[P.sl]:[])].map(v=>P.d*v),lo=Math.min(...vs),hi=Math.max(...vs),X=v=>14+(P.d*v-lo)/Math.max(1e-12,hi-lo)*292;
let s=`<line x1="14" x2="306" y1="26" y2="26" stroke-width="2" style="stroke:var(--ln)"/><rect y="22" height="8" rx="4" x="${Math.min(X(P.px),X(P.avg))}" width="${Math.abs(X(P.px)-X(P.avg))}" style="fill:${dcol(P.pnl)}"/>`;
const dot=(v,t,fill,st)=>`<circle cx="${X(v)}" cy="26" r="5.5" style="fill:${fill};stroke:${st};stroke-width:1.6"/>${t?`<text x="${X(v)}" y="50" text-anchor="middle" class="dvt">${t}</text>`:''}`;
if(P.sl)s+=dot(P.sl,'SL','var(--pan2)','var(--dn)');
P.done.forEach(o=>s+=dot(o.p,o.k,'var(--mu)','var(--mu)'));P.rest.filter(o=>o.ok).forEach(o=>s+=dot(o.p,o.k,'var(--pan2)',o===P.next?'var(--warn)':'var(--mu)'));
s+=`<line x1="${X(P.avg)}" x2="${X(P.avg)}" y1="16" y2="36" stroke-dasharray="2 2" style="stroke:var(--tx)"/>`+dot(P.tp,dTgt(P),'var(--pan2)','var(--up)');
s+=`<polygon points="${X(P.px)-6},6 ${X(P.px)+6},6 ${X(P.px)},15" style="fill:var(--tx)"/>`;
return`<div class="dvr"><svg viewBox="0 0 100 100" width="86" height="86" role="img" aria-label="PnL позиції"><circle cx="50" cy="50" r="42" fill="none" stroke-width="8" style="stroke:var(--ln)"/><circle cx="50" cy="50" r="42" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 50 50)" stroke-dasharray="${C*Math.max(.02,pr)} ${C}" style="stroke:${dcol(P.pnl)}"/><text x="50" y="50" text-anchor="middle" class="dvv" style="fill:${dcol(P.pnl)}">${f(P.pnl)}</text><text x="50" y="66" text-anchor="middle" class="dvt">${f(P.roe*100,1)} %</text></svg>
<div class="dvs"><div>Ціна <b class="mono">${dpx(P.px)}</b></div><div>Вхід <b class="mono">${dpx(P.avg)}</b></div><div>До ${dTgt(P)} <b class="mono" style="color:var(--up)">${dpc(P.tp,P.px)}</b></div>${lt?`<div>До ${lt.to} <b class="mono" style="color:${lt.c}">${dpc(lt.p,P.px)}</b></div>`:''}</div></div>
<svg class="dvl" viewBox="0 0 320 58" width="100%" role="img" aria-label="Рівні угоди: SL, ордери, вхід, TP і поточна ціна">${s}</svg>`}
/* Н — табло */
function dvBoard(x,P){const lt=dLeft(P),ar=x._lpx&&x._lpx!==P.px?(P.px>x._lpx?'↗':'↘'):'';
const cell=(k,v,s,c)=>`<div class="dbc"><div class="dbk">${k}</div><div class="dbv mono"${c?` style="color:${c}"`:''}>${v}</div><div class="dbs mono">${s}</div></div>`;
return`<div class="dvb">${cell('PnL',f(P.pnl)+(ar?` <span style="color:${P.px>x._lpx===P.d>0?'var(--up)':'var(--dn)'}">${ar}</span>`:''),f(P.roe*100,1)+' % на маржу',dcol(P.pnl))}${cell('Ціна',dpx(P.px),'вхід '+dpx(P.avg))}
${cell('До '+dTgt(P),dpc(P.tp,P.px),dpx(P.tp)+' · '+f(P.tpGain)+' USDT','var(--up)')}${lt?cell('До '+lt.to,dpc(lt.p,P.px),dpx(lt.p)+(P.next?' · '+n2(P.next.m,0)+' USDT':''),lt.c):cell('Ордери',P.n+' з '+P.orders,'усі виконано')}</div>`}
/* З — графік-фон: закриття свічок від початку угоди (не менше 24), рівні TP, вхід, наступний ордер / SL */
function dvChart(x,P){let A=[];try{A=aggC(D[dk(x.g)]||[],x.g.tf||1)}catch(e){}const t0=x.b.pos.f&&x.b.pos.f[0]?x.b.pos.f[0].t:0;
let i0=A.findIndex(c=>c.t>=t0);if(i0<0)i0=A.length;i0=Math.max(0,Math.min(i0-2,A.length-24));const cs=A.slice(i0).map(c=>c.c).slice(-60).concat(P.px),lt=dLeft(P);
const all=[...cs,P.tp,P.avg,...(lt?[lt.p]:[])],lo=Math.min(...all),hi=Math.max(...all),pad=(hi-lo)*.08||hi*.002,Y=v=>10+(hi+pad-v)/(hi-lo+2*pad)*120,X=i=>i*(340/Math.max(1,cs.length-1));
const pts=cs.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' '),c=dcol(P.pnl);
const line=(v,t,col,da)=>`<line x1="0" x2="340" y1="${Y(v)}" y2="${Y(v)}" stroke-dasharray="${da}" style="stroke:${col}"/><text x="6" y="${Y(v)-4}" class="dvt" style="fill:${col}">${t} ${dpx(v)}</text>`;
return`<div class="dvc"><svg viewBox="0 0 340 140" width="100%" preserveAspectRatio="none" role="img" aria-label="Графік ціни з рівнями угоди"><polygon points="0,140 ${pts} 340,140" style="fill:color-mix(in srgb,${c} 14%,transparent)"/>${line(P.tp,dTgt(P),'var(--up)','5 4')}${line(P.avg,'вхід','var(--mu)','2 3')}${lt?line(lt.p,lt.t.toLowerCase(),lt.c,'5 4'):''}<polyline points="${pts}" fill="none" stroke-width="2" style="stroke:${c}"/><circle cx="340" cy="${Y(P.px)}" r="4.5" style="fill:${c}"/></svg>
<div class="dvcp"><b class="mono" style="color:${c}">${f(P.pnl)} USDT</b><span class="mono" style="color:${c}">${f(P.roe*100,1)} % · ${dpx(P.px)}</span></div></div>
<div class="dvch"><span>До ${dTgt(P)} <b class="mono">${dpc(P.tp,P.px)}</b></span>${lt?`<span>До ${lt.to} <b class="mono">${dpc(lt.p,P.px)}</b></span>`:''}<span>Ордери <b class="mono">${P.n} з ${P.orders}</b></span></div>`}
/* головне віконце угоди; без позиції — порожньо */
function dealView(x){const p=x.b.pos;if(!p||!(p.q>0))return'';let c=null;try{c=lastC(dk(x.g))}catch(e){}const px=c&&c.c>0?c.c:p.last;if(!(px>0))return'';
const P=dealPlan(x.g,p,px),v=vwOk(x.vw),h=v==='board'?dvBoard(x,P):v==='chart'?dvChart(x,P):dvLadder(x,P);x._lpx=px;return h}
/* вибір вигляду в меню «⋯» картки */
const vwSel=x=>`<div class="vws" role="group" aria-label="Вигляд угоди на картці"><span class="mu">Вигляд угоди:</span>${VWS.map(([k,t])=>`<button class="b sm tg" data-a="vw" data-v="${k}" data-id="${x.id}" aria-pressed="${vwOk(x.vw)===k}">${t}</button>`).join('')}</div>`;
