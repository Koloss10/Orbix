/* ---------- paper-боти ---------- */
let bots=[],uid=0;
/* Paper-бот торгує лише з моменту запуску (t0). Стан не вигадується з минулого: після перезавантаження
   він детерміновано відтворюється прогоном закритих свічок від t0 з урахуванням пауз (sp — інтервали роботи). */
const clk=p=>{const H=DT[p];return Math.max(Date.now(),H&&H.length?H[H.length-1].t+36e5:0)};
const actAt=(x,t)=>(x.sp||[]).some(([a,b])=>t>a&&(b==null||t<=b));
function advance(x,live){if(x.srv&&(live||x.srvSt))return;const g=x.g,tf=g.tf||1,H=D[dk(g)];if(!H||!H.length)return;const A=aggC(H,tf),W=tfMs(tf);if(!A.length)return;
if(A[0].t>x.t0)x.trunc=1;let i=A.length;while(i>0&&A[i-1].t+W>x.lt)i--;if(i>=A.length)return;const V=[...(x.gh||[]),{u:Infinity,g}],EC=[];let vi=-1,e=null;
for(;i<A.length;i++){const c=A[i],ct=c.t+W;x.lt=ct;{let v=0;while(ct>V[v].u)v++;if(v!==vi){vi=v;x.b.g=V[v].g;e=EC[v]||(EC[v]=entry(A,V[v].g))}}if(!actAt(x,ct))continue;const n0=x.b.tr.length,p0=x.b.pos,o0=p0?p0.n:0,c0=p0?p0.cost:0;
x.b.step(Math.floor(c.t/W),c,e[i],undefined,e.x&&e.x[i]);const v=x.b.eqv(c);x.pk=Math.max(x.pk,v);x.dd=Math.min(x.dd,v-x.pk);if(!live)continue;const t=x.b.tr,p=x.b.pos;
if(t.length>n0){const l=t[t.length-1];notify(l.sl||l.liq?'sl':'close',x,{pnl:l.pnl,liq:l.liq});tnMirror(x,'close')}else if(!p0&&p){notify('open',x,{price:c.c});tnMirror(x,'open',p.cost)}else if(p0&&p&&p.n>o0){notify('dca',x,{price:p.last,n:p.n});tnMirror(x,'dca',p.cost-c0)}}}
/* історія налаштувань бота (редагування): [{u — час зміни, до якого діяла ця версія, g}] у порядку часу */
const ghOk=a=>Array.isArray(a)?a.filter(v=>v&&v.g&&typeof v.g==='object'&&isFinite(v.u)).map(v=>({u:+v.u,g:normG({...DEF,...v.g})})).sort((p,q)=>p.u-q.u).slice(-50):[];
function mk(g,ex,on=true,m={}){g=normG({...DEF,...g});const t0=+m.t0||clk(dk(g)),sp=Array.isArray(m.sp)?m.sp:on?[[t0,null]]:[];
const x={id:++uid,g,ex,on,b:new Bot(g),pk:0,dd:0,t0,lt:t0,sp,tn:!!m.tn&&!!g.fut,srv:!!m.srv,srvEx:m.srvEx||null,gh:ghOk(m.gh)};advance(x,0);bots.push(x);return x}
function setOn(x,on){if(!!x.on===!!on)return;const t=clk(dk(x.g));x.on=!!on;if(on)x.sp.push([t,null]);else{const l=x.sp[x.sp.length-1];if(l&&l[1]==null)l[1]=t}}
const bv=x=>x.b.eqv(lastC(dk(x.g)));
let BOOT=0,KEEP=[];const sloc=()=>{if(BOOT)sv('zorya3',bots.map(({g,ex,on,rid,pid,t0,sp,tn,srv,srvEx,demo,gh})=>({g,ex,on,rid,pid,t0,sp,tn,srv,srvEx,...(demo?{demo:1}:{}),...(gh&&gh.length?{gh}:{})})).concat(KEEP))},sbots=()=>{sloc();cloudQ()};
/* модель перевіряє трейлінг лише на закритих свічках: ціна вже за стопом — пояснити, коли угоду буде закрито */
function candleEnd(tf,now=Date.now()){const W=tfMs(tf||1),o=tf==168?4*864e5:0;return Math.floor((now-o)/W)*W+o+W} // тиждень біржі — з понеділка 00:00 UTC
function trHint(x,p){const c=lastC(dk(x.g)),px=c&&+c.c,st=p.peak*(1-x.g.d*x.g.trail);if(!(px>0)||(x.g.d>0?px>st:px<st))return'';
const e=new Date(candleEnd(x.g.tf)),hm=e.toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}),day=e.toDateString()===new Date().toDateString()?'':e.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'})+' ';
return`<p class="rndw" style="margin:0">Ціна вже за трейлінг-стопом (зараз ${n2(px,px<1?5:2)}). Модель перевіряє лише закриті свічки, тож угоду буде закрито за стопом після закриття свічки ${tfl(x.g.tf)} — ${day}о ${hm}.${x.tn&&(x.srvEx||'bybit')!=='binance'?' На Bybit Demo трейлінг біржі стежить за ціною безперервно, тож там позиція може закритися раніше.':''}</p>`}
/* фандінг (лише ф'ючерси): рушій веде суму fd у позиції й угодах; fd > 0 — сплачено, у звіті показуємо зі знаком гаманця (−fd) */
const fdOf=t=>-(+(t&&t.fd)||0);
const fdBot=x=>x.g.fut?x.b.tr.reduce((a,t)=>a+fdOf(t),0)+(x.b.pos?fdOf(x.b.pos):0):0;
/* наступне нарахування — за фактичним розкладом пари (інтервал між двома останніми подіями історії; 8 / 4 / 1 год) */
function frNext(pair,now=Date.now()){const F=typeof frOf==='function'&&frOf(pair);if(!F||!F.length)return 0;const l=F[F.length-1].t,I=F.length>1?F[F.length-1].t-F[F.length-2].t:288e5;if(!(I>=36e5&&I<=864e5))return 0;let t=l;while(t<=now)t+=I;return t}
function frRate(pair){const T=MD.ftk&&MD.ftk[sym(pair)];return T&&isFinite(T.fr)?T.fr:null}
const durTxt=ms=>{const m=Math.max(1,Math.round(ms/6e4)),h=Math.floor(m/60);return h?`${h} год ${m%60} хв`:`${m} хв`};
function fdLine(x,p){if(!x.g.fut)return'';const tot=fdBot(x);if(!p&&!tot)return'';const r=frRate(x.g.pair),nx=p?frNext(x.g.pair):0;
const pay=r==null?'':r===0?'':(r>0)===(x.g.d>0)?' — позиція платить':' — позиція отримує';
return`<p class="mu" style="margin:0">Фандінг: ${p?`угода <b class="mono ${cls(fdOf(p))}">${f(fdOf(p))}</b> USDT · `:''}усього <b class="mono ${cls(tot)}">${f(tot)}</b> USDT${p&&r!=null?` · ставка ${n2(r*100,4)} %${pay}`:''}${nx?` · наступне через ${durTxt(nx-Date.now())}`:''}</p>`}
function bcard(x){const p=x.b.pos,v=bv(x),s=x.b.tr,w=s.filter(t=>t.pnl>0).length;
return`<div class="bc ${x.on?'on':'off'}" data-bot="${x.id}"${typeof srvErr==='function'&&srvErr(x)?' style="--st:var(--dn);opacity:1"':''}><div class="bh"><b>${x.g.pair}</b><span class="mu">${dir(x.g)} · ${tfl(x.g.tf)} · ${x.g.lev}× · ${x.ex} · з ${tm(x.t0)}</span><span class="st" style="margin-left:auto">${typeof srvErr==='function'&&srvErr(x)?'Помилка':x.on?'Працює':'Пауза'}</span></div>${!s.length&&!p?`<p class="mu bwait">${x.on?'Чекає на сигнал':'На паузі'} · перевірка після закриття свічки ${tfl(x.g.tf)}</p>`:''}${x.trunc?'<p class="mu" style="margin:0">Історії бракує, щоб відтворити бота з самого запуску: показано з найранішої доступної свічки.</p>':''}
${srvLine(x)}${p&&p.ta&&+x.g.trail>0&&p.peak>0?`<p class="mu" style="margin:0">Тейк-профіт досягнуто — працює трейлінг: угода закриється, коли ціна відкотиться на ${n2(x.g.trail*100,2).replace(/,?0+$/,'')} % від ${x.g.d>0?'максимуму':'мінімуму'} ${n2(p.peak,p.peak<1?5:2)} (≈ ${n2(p.peak*(1-x.g.d*x.g.trail),p.peak<1?5:2)}).</p>${trHint(x,p)}`:''}${fdLine(x,p)}${typeof errLine==='function'?errLine(x):''}${x.g.maxd>0?`<p class="mu" style="margin:0">Угод: ${x.b.nd||0} з ${x.g.maxd}${(x.b.nd||0)>=x.g.maxd&&!p?' — ліміт досягнуто, нових угод бот не відкриватиме':(x.b.nd||0)>=x.g.maxd?' — ліміт досягнуто, поточна угода буде остання':''}</p>`:''}${x.tn?((ex,r)=>r&&(r.worst>=.1||r.zero)?`<p class="rndw" style="margin:0">${rndText(r,ex,1)}</p>`:'')(x.srvEx||(typeof TN!=='undefined'&&TN.ex)||'bybit',rndInfo(x.g,x.srvEx||(typeof TN!=='undefined'&&TN.ex)||'bybit')):''}<div class="bm"><div>PnL з відкритою<b class="${cls(v)}">${f(v)}</b></div><div>Угод / win<b>${s.length} / ${s.length?Math.round(w/s.length*100):0}%</b></div><div>Позиція<b>${p?p.n+' з '+x.g.orders+' орд.':'немає'}</b></div><div>Просадка<b class="${cls(x.dd)}">${f(x.dd,0)}</b></div></div>
<div class="ac"><button class="b sm ${x.on?'':'p'}" data-a="t" data-id="${x.id}">${x.on?'Пауза':'Запустити'}</button><button class="b sm" data-a="g" data-id="${x.id}">Графік</button><button class="b sm" data-a="j" data-id="${x.id}">Угоди</button><button class="b sm" data-a="ed" data-id="${x.id}">Редагувати</button>${x.srv&&x.rid?`<button class="b sm" data-a="ai" data-id="${x.id}">Запитати AI</button>`:''}${CLOUD.u?`<button class="b sm tg" data-a="srv" data-id="${x.id}" aria-pressed="${!!x.srv}" title="Бот торгує на сервері, навіть коли застосунок закритий">${x.srv?'Сервер 24/7: увімк.':'Сервер 24/7'}</button>`:''}${x.g.fut&&CLOUD.u&&TN.c?`<button class="b sm tg" data-a="tn" data-id="${x.id}" aria-pressed="${!!x.tn}" title="Дублювати угоди бота ордерами на демо-рахунку біржі (Bybit Demo або Binance Testnet)">${x.tn?'Тестнет: увімк.':'Тестнет'}</button>`:''}<button class="b sm bmore" data-a="m" data-id="${x.id}" aria-expanded="false" aria-label="Ще дії" title="Ще дії">⋯</button></div><div class="ac bmo" hidden>${typeof srvCmdBtns==='function'?srvCmdBtns(x):''}<button class="b sm" data-a="c" data-id="${x.id}">Клонувати</button><button class="b sm d" data-a="x" data-id="${x.id}">Видалити бота</button></div><div class="gr" id="gr${x.id}" hidden></div><div class="gr" id="jr${x.id}" hidden></div></div>`}
function lstTo(el,list){if(!el)return;const on=list.filter(x=>x.on),off=list.filter(x=>!x.on);el.innerHTML=list.length?(on.length?`<h3>Працюють · ${on.length}</h3>`+on.map(bcard).join(''):'')+(off.length?`<h3>На паузі · ${off.length}</h3>`+off.map(bcard).join(''):''):'<p class="mu">Ботів ще немає. Запустіть топового бота, скористайтеся Авто-майстром або створіть свого.</p>'}
function lst(){lstTo($('#bl'),bots);const q=($('#bq')&&$('#bq').value||'').trim().toUpperCase();lstTo($('#bl2'),q?bots.filter(x=>x.g.pair.includes(q)):bots);upd()}
const jrn=x=>x.b.tr.length?x.b.tr.slice(-10).reverse().map(t=>`<div class="tr"><span>${tm(t.ts)}, ордерів ${t.n}${t.man?', вручну':t.cx?', скасовано':t.xs?', сигнал':t.liq?', ліквідація':t.sl?', SL':''}</span><span class="mono ${cls(t.pnl)}">${f(t.pnl)}</span></div>`).join(''):'<p class="mu">Угод ще немає.</p>';
function upd(){let pnl=0,all=[];
bots.forEach(x=>{const v=bv(x);pnl+=v;all.push(...x.b.tr);const c=$$(`[data-bot="${x.id}"]`);for(const el of c){const p=x.b.pos,s=x.b.tr,w=s.filter(t=>t.pnl>0).length,b=el.querySelectorAll('.bm b');if(b.length>=4){b[0].textContent=f(v);b[0].className=cls(v);b[1].textContent=`${s.length} / ${s.length?Math.round(w/s.length*100):0}%`;b[2].textContent=p?p.n+' з '+x.g.orders+' орд.':'немає';b[3].textContent=f(x.dd,0)}}
const j=$('#jr'+x.id);if(j&&!j.hidden)j.innerHTML=jrn(x)});
all.sort((a,b)=>a.i-b.i);let e=0;const cur=all.map(t=>e+=t.pnl);if($('#ch'))$('#ch').innerHTML=chart(cur);
hero(pnl,cur,all);$$('.chv').forEach(c=>{if(c.offsetParent)c._d()});if($('#v-st')&&!$('#v-st').hidden)sta()}
/* верх головної: стан, PnL з анімацією лічби, кільце win-rate, крива капіталу */
const HERO={v:null,raf:0};
function heroNum(el,to){const from=HERO.v==null?0:HERO.v;HERO.v=to;cancelAnimationFrame(HERO.raf);const t0=performance.now(),D=from===to?0:700;
const st=t=>{const k=D?Math.min(1,(t-t0)/D):1,e=1-Math.pow(1-k,3),v=from+(to-from)*e;el.textContent=(v>0?'+':v<0?'−':'')+n2(Math.abs(v),2);el.className='hv '+cls(to);if(k<1)HERO.raf=requestAnimationFrame(st)};
if(!D||document.hidden)st(t0+D);else HERO.raf=requestAnimationFrame(st)}
function heroChart(v){const W=640,H=110;if(v.length<2)return'<div class="hch-e mu">Крива капіталу з’явиться після перших угод</div>';const mn=Math.min(0,...v),mx=Math.max(0,...v),sp=(mx-mn)||1,X=i=>(i/(v.length-1)*W).toFixed(1),Y=y=>(H-6-(y-mn)/sp*(H-12)).toFixed(1),P=v.map((y,i)=>X(i)+' '+Y(y)),up=v[v.length-1]>=0,c=up?'var(--up)':'var(--dn)';
return`<svg class="hch" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Крива капіталу"><defs><linearGradient id="hg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ac)" stop-opacity=".35"/><stop offset="1" stop-color="var(--ac)" stop-opacity="0"/></linearGradient><linearGradient id="hg-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--ac2)"/><stop offset="1" stop-color="var(--ac)"/></linearGradient></defs><path d="M0 ${Y(0)}H${W}" stroke="var(--ln)" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/><path d="M${P.join('L')}V${H}H0Z" fill="url(#hg-a)"/><path class="hln" d="M${P.join('L')}" fill="none" stroke="url(#hg-l)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg><i class="hdot" style="left:calc(100% - 6px);top:${(Y(v[v.length-1])/H*100).toFixed(1)}%;background:${c}"></i>`}
function hero(pnl,cur,all=[]){const h=$('#hero');if(!h)return;if(VARIANT!==2){h.innerHTML='';return}
if(!$('#h-pnl')){h.innerHTML=`<div class="card hero2"><div class="h-orb" aria-hidden="true"></div><div class="h-top"><span class="h-pill" id="h-st"></span><span class="mu h-up" id="h-upd"></span></div>
<div class="h-main"><div class="h-l"><div class="mu">Прибуток ботів, USDT</div><div class="h-big"><span class="hv" id="h-pnl">0,00</span><span class="h-pct" id="h-pct"></span></div><div class="h-sub" id="h-day"></div></div>
<div class="h-ring" id="h-ring"></div></div>
<div class="h-chips" id="h-chips"></div><div class="h-chart" id="h-ch"></div>
<div class="row h-btn"><button class="b p" id="h-aw">Авто-майстер</button><button class="b" id="h-nb">Новий бот</button><button class="b" id="h-mk">Ринок</button></div></div>`;
HERO.ck=null;$('#h-aw').onclick=()=>go('aw');$('#h-nb').onclick=()=>go('bd');$('#h-mk').onclick=()=>go('mk')}
const inv=bots.reduce((a,x)=>a+x.g.base*ladder(x.g),0),on=bots.filter(x=>x.on).length,srv=bots.filter(x=>x.on&&x.srv).length,open=bots.filter(x=>x.b&&x.b.pos).length;
const d0=Math.floor(Date.now()/864e5)*864e5,day=all.reduce((a,t)=>a+((+t.ts||0)>=d0?+t.pnl||0:0),0),dn=all.filter(t=>(+t.ts||0)>=d0).length;
const w=all.filter(t=>t.pnl>0).length,wr=all.length?w/all.length:0;
$('#h-st').className='h-pill '+(on?'on':'off');$('#h-st').innerHTML=`<i></i>${on?(srv?`Сервер 24/7 · ${srv} з ${on} ботів`:`Працюють ${on} з ${bots.length} ботів`):(bots.length?'Усі боти на паузі':'Ботів ще немає')}`;
$('#h-upd').textContent=MD.mode==='live'?'дані біржі наживо':'демо-дані';
heroNum($('#h-pnl'),pnl);$('#h-pct').textContent=inv?`${pnl>=0?'+':'−'}${n2(Math.abs(pnl/inv*100),2)}%`:'';$('#h-pct').className='h-pct '+cls(pnl);$('#h-pct').hidden=!inv;
$('#h-day').innerHTML=`Сьогодні <b class="mono ${cls(day)}">${f(day)}</b> <span class="mu">· ${dn} ${dn%10===1&&dn%100!==11?'угода':dn%10>=2&&dn%10<=4&&(dn%100<12||dn%100>14)?'угоди':'угод'}</span>`;
const R=30,C=2*Math.PI*R;$('#h-ring').innerHTML=`<svg viewBox="0 0 76 76" aria-hidden="true"><defs><linearGradient id="hg-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ac)"/><stop offset="1" stop-color="var(--ac2)"/></linearGradient></defs><circle cx="38" cy="38" r="${R}" fill="none" stroke="var(--ln)" stroke-width="7"/><circle class="h-arc" cx="38" cy="38" r="${R}" fill="none" stroke="url(#hg-r)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C*wr).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/></svg><div><b>${Math.round(wr*100)}%</b><span>у плюсі</span></div>`;
$('#h-chips').innerHTML=[['Капітал у ботах',n2(inv,0)+' USDT'],['Ботів активно',`${on} / ${bots.length}`],['Відкрито угод',String(open)],['Закрито угод',String(all.length)]].map(([k,v])=>`<div class="h-chip"><span>${k}</span><b class="mono">${v}</b></div>`).join('');
const ck=cur.length+':'+(cur.length?cur[cur.length-1].toFixed(4):'')+':'+SET.theme;if(HERO.ck!==ck){HERO.ck=ck;$('#h-ch').innerHTML=heroChart(cur)}}
function chart(v,H=200){if(v.length<2)return'<p class="mu">Недостатньо угод для графіка.</p>';const W=640,mn=Math.min(0,...v),mx=Math.max(0,...v),sp=(mx-mn)||1,Y=y=>(H-8-(y-mn)/sp*(H-16)).toFixed(1),P=v.map((y,i)=>(i/(v.length-1)*W).toFixed(1)+' '+Y(y));
return`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Крива капіталу" preserveAspectRatio="none" style="height:${H>150?'auto':H+'px'}"><path d="M0 ${Y(0)}H${W}" stroke="var(--ln)"/><path d="M${P.join('L')}V${H}H0Z" fill="var(--ac)" fill-opacity=".12"/><path d="M${P.join('L')}" fill="none" stroke="var(--ac)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`}
function stepBots(k){bots.filter(x=>dk(x.g)===k&&x.on).forEach(x=>advance(x,1))}
/* демо: нова синтетична свічка кожні 1,5 с */
function tick(){for(const k of Object.keys(DT)){const cs=DT[k];const c=nextC(PAIRS[pairOf(k)],Math.random);c.t=cs[cs.length-1].t+H1;cs.push(c);stepBots(k)}upd()}
/* live: опитування біржі, нові закриті свічки й поточна ціна */
let polling=0;async function poll(){if(polling||MD.mode!=='live'||document.hidden)return;polling=1;try{const W=new Set(bots.filter(x=>x.on).map(x=>dk(x.g)));$$('.chv').forEach(c=>{if(c.offsetParent&&c._d){const v=c===$('#gv')?$('#gv')._k:null;if(v)W.add(v)}});
$$('.gr').forEach(g=>{if(!g.hidden){const b=g.closest('[data-bot]');if(b){const x=bots.find(y=>y.id===+b.dataset.bot);if(x)W.add(dk(x.g))}}});let ch=0;
for(const p of W){if(!DT[p])continue;try{const a=await kl(p,{lim:3}),H=DT[p],now=Date.now();for(const c of a){if(c.t+H1<=now){if(c.t>H[H.length-1].t){if(isF(p)&&c.t%(8*H1)===0)try{await frLoad(pairOf(p))}catch(e){}H.push(c);stepBots(p);ch=1}}else{MD.live[p]=c;ch=1}}}catch(e){}}
if(ch)upd();const mc=$('#mkc');if(CUR==='mk'&&mc._poll)await mc._poll().catch(()=>{})}finally{polling=0}}
function botClick(e){const t=e.target.closest('button');if(!t||!t.dataset.a)return;const x=bots.find(b=>b.id===+t.dataset.id),a=t.dataset.a;if(!x)return;
if(a==='m'){const m=t.closest('.bc').querySelector('.bmo');if(m){m.hidden=!m.hidden;t.setAttribute('aria-expanded',!m.hidden)}return}
if(a==='g'){const g=t.closest('.bc').querySelector('.gr');g.hidden=!g.hidden;if(!g.hidden&&!g._d)lwChart(g,()=>({pair:x.g.pair,key:dk(x.g),tf:x.g.tf,lv:()=>lines(x.g,x.b.pos,dk(x.g)),mk:()=>tradeMarks(x.b.tr,x.b.pos,x.g)}),'mini');else if(!g.hidden)g._d();return}
if(a==='j'){const j=t.closest('.bc').querySelectorAll('.gr')[1];j.hidden=!j.hidden;j.innerHTML=jrn(x);return}
if(a==='c'){if(typeof edEnd==='function')edEnd();fill(x.g,x.ex);go('bd');return}
if(a==='ed'){edStart(x);return}
if(a==='cmd'){srvCmd(x,t.dataset.k);return}
if(a==='mon'){go('mon');return}
if(a==='ai'){aiOpen({type:'bot',id:x.rid},`Проаналізуй бота ${x.g.pair}: стан, позицію, ризики й останні події. Чи все гаразд?`);return}
if(a==='srv'||a==='tn')x.demo=0; // користувач узяв демо-бота в роботу — тепер це звичайний бот
if(a==='srv'){srvToggle(x);return}
if(a==='tn'){if(!x.tn){const o=bots.find(y=>y!==x&&y.tn&&y.g.fut&&y.g.pair===x.g.pair);if(o){toast('На демо-рахунку вже торгує бот '+x.g.pair+' — позиції на біржі злилися б в одну. Вимкніть «Тестнет» в іншому боті або виберіть іншу пару.');return}}x.tn=!x.tn;sbots();lst();toast(x.tn?'Угоди бота '+x.g.pair+' дублюватимуться на демо-рахунку біржі'+(x.srv?' — сервером, цілодобово.'+rkWarn(x):' (поки застосунок відкритий)'):'Тестнет для бота вимкнено');return}
if(a==='x'){if(!confirm('Видалити бота '+ttl(x)+'?'))return;if(srvLive(x)&&confirm(FLATQ(x.g.pair)))srvFlat(x);bots=bots.filter(b=>b!==x)}else{setOn(x,!x.on);if(!x.on&&srvLive(x))toast('Бот '+x.g.pair+' на паузі: сервер зніме його лімітні докупівлі на біржі (до 5 хв). Відкрита позиція лишиться зі своїм стопом.')}sbots();lst()}
$('#bl').onclick=botClick;$('#bl2').onclick=botClick;
const killAll=async()=>{if(!confirm('Поставити всіх ботів на паузу?'))return;const L=bots.filter(srvLive);if(L.length&&confirm(FLATQ('ботів ('+L.map(x=>x.g.pair).join(', ')+')')))L.forEach(srvFlat);bots.forEach(x=>setOn(x,false));sloc();lst();FEED.unshift({t:now(),m:'Аварійна зупинка: усі боти на паузі'});sv('zfeed',FEED);feedR();
/* пауза має дійти до сервера одразу (без відкладеного збереження): інакше серверні боти торгуватимуть далі */
const S=bots.filter(x=>x.srv&&x.rid);if(!CLOUD.u||!S.length){toast('Усі боти на паузі.');return}
toast('Зберігаю паузу на сервері…');clearTimeout(csT);CLOUD.err='';await (csQ=csQ.then(()=>cloudSave()));
if(CLOUD.err){toast('НЕ збережено на сервері: '+CLOUD.err+' — серверні боти ще працюють. Натисніть «Аварійна зупинка» ще раз.');FEED.unshift({t:now(),m:'⚠ Аварійна зупинка не дійшла до сервера: '+CLOUD.err});sv('zfeed',FEED);feedR()}
else toast('Усі боти на паузі — збережено на сервері. Сервер зніме лімітні ордери ботів на біржі протягом 5 хвилин.')};
$('#ks').onclick=killAll;$('#ks2').onclick=killAll;$('#nb2').onclick=()=>go('bd');$('#bq').oninput=lst;

