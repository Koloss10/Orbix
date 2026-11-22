/* ---------- форма конструктора ---------- */
const NUM=[['frp','RSI період','rp',1],['frs','RSI поріг','rm',1],['fbn','Bollinger період','bn',1],['fbk','Bollinger k','bk',1],['fcn','CCI період','cn',1],['fcv','CCI рівень','cv',1],['fb','Сума на бота (маржа), USDT','base',1],['fo','Ордерів DCA','orders',1],['fs','Крок, %','step',100],['fx','Множник кроку','smul',1],['fm','Множник ордера (мартингейл)','mult',1],['ft','Take-Profit, %','tp',100],['fs1','Multi-TP: частка на TP1, %','s1',100],['ft2','Multi-TP: другий TP, %','tp2',100],['fr','Trailing, %','trail',100],['fl','Stop-Loss, %','sl',100],['fc','Пауза після угоди, свічок','cd',1],['fk','Мін. сигналів із вибраних','k',1],['ffm','Фундаментальний фільтр: мін. бал','fm',1],['flv','Плече','lev',1]];
const sel=(id,l,o,v)=>`<label>${l}<select id="${id}">${o.map(([a,b])=>`<option value="${a}"${a==v?' selected':''}>${b}</option>`).join('')}</select></label>`;
$('#pl').innerHTML=PK.map(k=>`<option value="${k}">`).join('');
/* поля згруповано в розділи, що згортаються; ідентифікатори полів ті самі, тож cfg()/fill()/bad() не змінюються */
const FGR=[['main','Основне',1],['sig','Сигнали входу'],['dca','Сітка DCA'],['ex','Вихід: TP, SL, трейлінг'],['flt','Фільтри'],['bt','Бектест']],
FGI={fb:'main',flv:'main',frp:'sig',frs:'sig',fbn:'sig',fbk:'sig',fcn:'sig',fcv:'sig',fk:'sig',fo:'dca',fs:'dca',fx:'dca',fm:'dca',ft:'ex',fs1:'ex',ft2:'ex',fr:'ex',fl:'ex',fc:'ex',ffm:'flt'},
fin=([i,l,k,m])=>`<label>${l}<input id="${i}" type="number" inputmode="decimal" step="any" value="${k==='base'?+(DEF.base*ladder(DEF)).toFixed(2):+(DEF[k]*m).toFixed(4)}"></label>`,fgn=g=>NUM.filter(n=>(FGI[n[0]]||'flt')===g).map(fin).join(''),
FGH={main:()=>sel('fe','Біржа',[])+sel('fp','Пара',PK.map(k=>[k,k]))+sel('fmk','Ринок',[[1,'Futures'],[0,'Spot']])+sel('fdr','Напрямок',[[1,'Long'],[-1,'Short']])+sel('ftf','Таймфрейм свічок',TFS)+fgn('main'),
sig:()=>'<label class="fw">Готова стратегія<select id="fst"></select></label><div class="sgr fw" id="fsg"></div>'+fgn('sig'),
dca:()=>fgn('dca'),ex:()=>sel('fbe','SL у беззбиток після TP1',[[0,'Ні'],[1,'На нулі'],[2,'На ціні TP1']])+fgn('ex'),flt:()=>fgn('flt'),
bt:()=>sel('fper','Період бектесту',PER,8760)+'<label>Депозит, USDT<input id="fdp" type="number" inputmode="decimal" step="any" value="1000"></label>'};
$('#fg').innerHTML=FGR.map(([k,t,o])=>`<details class="fgs" data-g="${k}"${o?' open':''}><summary><b>${t}</b><span class="mu" id="fgs-${k}"></span></summary><div class="fg">${FGH[k]()}</div></details>`).join('');
/* короткий підсумок у заголовку кожного розділу */
function fgSum(c){const g=c.g,p=x=>n2(x*100,2).replace(/,?0+$/,'')+' %',S={main:`${g.pair} · ${g.d>0?'Long':'Short'} · ${tfl(g.tf)} · ${n2(g.base,0)} USDT${g.fut&&g.lev>1?' · '+g.lev+'×':''}`,
sig:`${g.sg.map(k=>SGN[k]).join(', ')||'не вибрано'} · мін. ${g.k}`,dca:`${g.orders} орд. · крок ${p(g.step)} · ×${String(g.mult).replace(".",",")}`,
ex:`TP ${p(g.tp)} · SL ${p(g.sl)}${g.trail>0?' · трейлінг '+p(g.trail):''}${g.s1>0?' · Multi-TP':''}`,flt:g.fm>0?`фундаментальний бал ≥ ${g.fm}`:'вимкнено',bt:`${perl(c.per)} · депозит ${n2(c.dep,0)} USDT`};
for(const k in S){const e=$('#fgs-'+k);if(e)e.textContent=S[k]}}
$('#fsg').innerHTML=Object.entries(SGN).map(([k,l])=>`<label class="ck"><input type="checkbox" data-sg="${k}"${DEF.sg.includes(k)?' checked':''}>${l}</label>`).join('');
$('#fst').innerHTML='<option value="">Власний набір сигналів</option>'+STR.map((s,i)=>`<option value="${i}">${s[0]}</option>`).join('');
$('#fst').onchange=e=>{const s=STR[+e.target.value];if(!s)return;$$('[data-sg]').forEach(c=>c.checked=s[1].includes(c.dataset.sg));$('#fk').value=s[2];pv()};
function cfg(){const g={d:+$('#fdr').value,tf:+$('#ftf').value,fut:+$('#fmk').value,be:+$('#fbe').value,pair:$('#fp').value,sg:$$('[data-sg]').filter(c=>c.checked).map(c=>c.dataset.sg),fee:.001,slip:.0005};NUM.forEach(([i,,k,m])=>g[k]=+$('#'+i).value/m);['orders','rp','bn','cn','cd','k'].forEach(k=>g[k]=Math.round(g[k]));if(!g.fut)g.lev=1;{const u=ladder(g);if(u>0)g.base/=u}return{g,ex:$('#fe').value,per:+$('#fper').value,dep:+$('#fdp').value}}
function bad(c){const g=c.g;if(!c.ex)return'Підключіть біржу в профілі.';if(!PAIRS[g.pair]||!listed(g.pair,c.ex))return'Ця пара не торгується на вибраній біржі.';if(!g.sg.length)return'Оберіть хоча б один сигнал входу.';if(Object.values(g).some(v=>typeof v==='number'&&!isFinite(v)))return'Усі числові поля мають бути заповнені.';if(!(g.base>0&&g.step>0&&g.tp>0&&g.sl>0&&g.mult>0&&g.smul>0&&g.tp2>0&&c.dep>0))return'Сума на бота, крок, TP, SL, множники й депозит мають бути більшими за 0.';if(g.orders<1||g.orders>30)return'Ордерів DCA: від 1 до 30.';if(g.rp<2||g.bn<2||g.cn<2)return'Періоди індикаторів мають бути не менші за 2.';if(g.d<0&&!g.fut)return'Short доступний лише на Futures.';const m=maxLev(g.pair,c.ex);if(g.lev<1||g.lev>m)return'Плече для цієї пари на цій біржі: від 1 до '+m+'×.';if(g.s1<0||g.s1>=1)return'Частка Multi-TP: від 0 до 99%.';const F=fltOf(g);if(F&&F.minN){const mo=g.base*(g.fut?g.lev:1)*Math.min(1,g.mult**(g.orders-1));if(mo<F.minN-1e-9)return`Біржа не прийме такий ордер: мінімум ${n2(F.minN,2)} USDT на ордер для ${g.pair}${g.fut?' (ф\'ючерси)':''}. ${g.mult<1?'Найменший ордер сітки':'Перший ордер з плечем'}: ${n2(mo,2)} USDT.`}if(g.k<1)return'Мін. сигналів має бути не менше 1.';{const r=minFirst(g);if(r&&g.base<r.min-1e-9)return minText(r)}return''}
function fill(g,ex){g={...DEF,...g};$('#fp').value=g.pair;if(ex&&cx.includes(ex))$('#fe').value=ex;$('#fdr').value=g.d;$('#ftf').value=g.tf;$('#fmk').value=g.fut;$('#fbe').value=g.be;NUM.forEach(([i,,k,m])=>$('#'+i).value=+(g[k]*m).toFixed(4));$('#fb').value=+(g.base*ladder(g)).toFixed(2);$$('[data-sg]').forEach(c=>c.checked=g.sg.includes(c.dataset.sg))}
const MODES=[{step:.025,orders:4,mult:1.15,tp:.006,sl:.06},{step:.015,orders:5,mult:1.3,tp:.01,sl:.05},{step:.01,orders:7,mult:1.6,tp:.015,sl:.08}];
$$('[data-m]').forEach(b=>b.onclick=()=>{const c=cfg();{const T=c.g.base*ladder(c.g),n={...c.g,...MODES[+b.dataset.m]};n.base=T/ladder(n);fill(n,c.ex)};pv()});
/* округлення кількості на демо-біржі: кожен ордер сітки (вхід і докупівлі) біржа округлює вниз до кроку кількості,
   як і сервер (floorStep). Повертає null, якщо правил немає, або {worst, first, firstX, step, coin, need, zero}:
   worst — найбільша втрата обсягу серед ордерів (0…1), first — перший ордер (USDT) до і після округлення,
   need — найменший перший ордер (USDT, кратний 5), за якого втрата кожного ордера ≤ 10 %, zero — біржа не прийме ордер */
const XNAME={bybit:'Bybit Demo',binance:'Binance Testnet'};
function rndInfo(g,ex){if(!g||!g.fut||!PAIRS[g.pair])return null;const F=MD.xflt[ex]&&MD.xflt[ex][sym(g.pair)];if(!F||!(F.step>0))return null;
let px;try{px=lastC(dk(g)).c}catch(e){return null}if(!(px>0))return null;
const lev=g.fut?(+g.lev||1):1,P=lv({...g,fee:0,slip:0},px,null).L.map(x=>x.p),n=Math.max(1,Math.round(g.orders||1));let worst=0,zero=false,first=null,mm=Infinity;
for(let k=0;k<n;k++){const p=P[k]||px,m=(+g.mult||1)**k,s=(+g.base||0)*lev*m,q=s/p,qf=Math.floor(q/F.step+1e-9)*F.step,loss=q>0?1-qf/q:0;
if(qf<=0)zero=true;if(loss>worst)worst=loss;if(k===0)first=[s,qf*p];if(m*lev<mm)mm=m*lev}
const need=Math.ceil(10*F.step*px/(mm||1)/5)*5;return{worst,first,step:F.step,coin:g.pair.split('/')[0],need,zero}}
const rndText=(r,ex,short)=>{const pc=x=>'−'+Math.round(x*100)+' %';
return short?`⚠ На біржі ордери округлюються до кроку ${String(r.step).replace('.',',')} ${r.coin}: перший ${n2(r.first[0],2)} → ${n2(r.first[1],2)} USDT (${pc(1-r.first[1]/r.first[0])})${r.zero?', частину ордерів біржа не прийме':''} — модель і біржа розходяться в обсязі.`
:`⚠ На ${XNAME[ex]||ex} кількість округлюється до кроку ${String(r.step).replace('.',',')} ${r.coin}: перший ордер ${n2(r.first[0],2)} USDT стане ${n2(r.first[1],2)} USDT (${pc(1-r.first[1]/r.first[0])}), найгірший ордер сітки ${pc(r.worst)}${r.zero?' — частину ордерів біржа не прийме':''}. Модель бота й біржа розійдуться в обсязі. Щоб похибка була ≤ 10 %, потрібен перший ордер від ~${n2(r.need,0)} USDT (з більшим плечем — менше).`};
/* ---------- мінімальний перший ордер для біржі ----------
   Біржа бота (Bybit Demo чи Binance Testnet) округлює кількість кожного ордера сітки вниз до кроку й не приймає ордер,
   менший за мінімум. Перший ордер (маржа) має бути таким, щоб кожен ордер сітки (вхід і докупівлі, з плечем) мав
   ≥ 10 кроків кількості (тоді округлення ≤ 10 %), не менше minQty і мінімальної суми ордера. Ціна — з біржі (кеш на 2 хв),
   поки її немає — з графіка. Правил біржі немає (не завантажились) — перевірки немає, як і раніше (лише fltOf у bad()).
   Мінімум залежить від плеча й множника ордера; кількість ордерів змінює суму всієї сітки. */
const XPX={bybit:s=>[j=>+((j.result&&j.result.list&&j.result.list[0])||{}).lastPrice,`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`],
binance:s=>[j=>+j.price,`https://testnet.binancefuture.com/fapi/v1/ticker/price?symbol=${s}`,`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${s}`]};
MD.xpx={};
async function xPrice(ex,s){const R=XPX[ex];if(!R)return null;const[f,...U]=R(s);for(const u of U){try{const p=f(await jget(u,8000));if(p>0)return p}catch(e){}}return null}
const botEx=()=>(typeof TN!=='undefined'&&TN.ex)||'bybit';
function minFirst(g,ex=botEx()){if(!g||!g.fut||!PAIRS[g.pair])return null;const s=sym(g.pair),F=MD.xflt[ex]&&MD.xflt[ex][s];if(!F||!(F.step>0))return null;
const c=MD.xpx[ex+s];let px=c&&c.p,src='з біржі';if(!(px>0)){try{px=lastC(dk(g)).c;src='з графіка'}catch(e){}}if(!(px>0))return null;
const L=+g.lev||1,m=+g.mult||1,n=Math.max(1,Math.round(g.orders||1)),P=lv({...g,base:1,lev:L,orders:n,fee:0,slip:0},px,null).L;let need=0;
for(let k=0;k<n;k++){const p=(P[k]||{p:px}).p,v=Math.max(10*F.step*p,(F.minQty||0)*p,F.minN||0);need=Math.max(need,v/(L*m**k))}
return{min:Math.ceil(need-1e-9),F,px,src,ex,L,n,m,coin:g.pair.split('/')[0]}}
const minText=r=>`Замала сума на бота для ${XNAME[r.ex]||r.ex}: потрібно від ${n2(r.min*ladder({orders:r.n,mult:r.m}),0)} USDT маржі на всю сітку з плечем ${r.L}× (ціна ${r.coin} ${n2(r.px,r.px<1?5:2)} ${r.src}, крок кількості ${String(r.F.step).replace('.',',')} ${r.coin}). З меншою сумою біржа округлить ордери більш ніж на 10 % або не прийме їх. Збільште суму на бота, плече або зменште кількість ордерів.`;
/* біржові дані для мінімуму: правила (xRules, кеш на добу) і ціна (кеш на 2 хв); після завантаження — перерахунок форми */
const XLD={};
function minLoad(g){if(!g||!g.fut||!PAIRS[g.pair])return;const ex=botEx(),s=sym(g.pair),k=ex+s,redo=()=>{if(CUR==='bd')pv()};
if(!MD.xflt[ex]&&!XLD[ex]){XLD[ex]=1;xRules(ex).then(m=>{XLD[ex]=0;if(m)redo()})}
const c=MD.xpx[k];if((!c||Date.now()-c.at>12e4)&&!XLD[k]){XLD[k]=1;xPrice(ex,s).then(p=>{XLD[k]=0;if(p>0){MD.xpx[k]={p,at:Date.now()};redo()}})}}
function minR(g){const r=minFirst(g),fb=$('#fb');if(!fb)return;
const lo=!!(r&&g.base<r.min-1e-9);fb.classList.toggle('inv',lo);fb.setAttribute('aria-invalid',lo?'true':'false');
const w=$('#frw');if(w){w.hidden=!lo;w.textContent=lo?minText(r):''}}
/* під полем «Сума на бота»: на які ордери ділиться сума (з урахуванням мартингейла), обсяг з плечем і ліміт угоди з профілю */
function fbInfo(g){const fb=$('#fb');if(!fb)return;let el=$('#fbi');if(!el){el=document.createElement('p');el.id='fbi';el.className='mu';el.style.margin='-4px 0 8px';fb.closest('label').after(el)}
const n=Math.max(1,Math.round(g.orders||1)),L=g.fut?(+g.lev||1):1,q=[];for(let k=0;k<n;k++)q.push(g.base*(+g.mult||1)**k);
if(!(g.base>0)||!q.every(isFinite)){el.textContent='';return}const T=q.reduce((a,v)=>a+v,0),N=T*L,lim=typeof RK!=='undefined'&&RK.l&&g.fut?RK.l.pos:0;
const same=q.every(v=>Math.abs(v-q[0])<1e-9);
el.textContent=`${n} орд. ${same?'по '+n2(q[0],2):'— '+q.map(v=>n2(v,2)).join(' · ')} USDT маржі${L>1?` · з плечем ${L}× позиція до ${n2(N,0)} USDT`:''}`+(lim?(N>lim+1e-9?` · ⚠ більше за ваш ліміт угоди ${n2(lim,0)} USDT — на сервері бот не відкриватиме угод`:` · ліміт угоди ${n2(lim,0)} USDT ✓`):'');
el.classList.toggle('dn',!!(lim&&N>lim+1e-9))}
function pv(){const c=cfg(),m=$('#flh'),e=bad(c);fbInfo(c.g);fgSum(c);minLoad(c.g);minR(c.g);if(e)$$('#fg input').forEach(i=>{if(i.type==='number'&&(i.value===''||!isFinite(+i.value))){const d=i.closest('details');if(d)d.open=true}});const mx=PAIRS[c.g.pair]?maxLev(c.g.pair,c.ex||'Binance'):1;
m.textContent=`Макс. плече для ${c.g.pair} на ${c.ex||'біржі'}: ${mx}×. Фундаментальний бал пари (демо): ${PAIRS[c.g.pair].f}/100.`+(c.g.lev>1&&c.g.fut?` Ліквідація приблизно за ${((1/c.g.lev-.005)*100).toFixed(1)}% проти позиції.`:'')+((F=>F?` Правила біржі: мін. ордер ${n2(F.minN,2)} USDT, крок ціни ${F.tick}, крок кількості ${F.step}${F.maxLev?', плече до '+F.maxLev+'×':''}.`:'')(fltOf(normG({...c.g}))));
if(e){$('#gs').textContent=e;return}
const ck=dk(c.g);if(!ready(ck)){$('#gs').textContent='Завантажую історію '+c.g.pair+' ('+mkLbl(ck)+')…';need(ck).then(pv).catch(er=>$('#gs').textContent='Не вдалося завантажити дані: '+er.message);return}
const v=$('#gv');if(v._k!==ck||(v._g&&v._g.tf!==c.g.tf))v._mk=null;v._p=c.g.pair;v._k=ck;v._g=c.g;if(!v._d)lwChart(v,()=>({pair:v._p,key:v._k,tf:v._g.tf,lv:()=>lines(v._g,null,v._k),mk:()=>v._mk||[]}),'full');else v._d();if(v._lt!==c.g.tf){v._lt=c.g.tf;if(v._tf){v._tf(c.g.tf);v._d()}}
const A=lv(c.g,lastC(ck).c,fltOf(c.g));$('#gs').textContent=`Сітка: ${n2(c.g.base*ladder(c.g),0)} USDT маржі, позиція до ${n2(A.L.reduce((a,l)=>a+l.s,0),0)} USDT. Лінії показано від поточної ціни.`}
$('#fg').oninput=$('#fg').onchange=pv;
/* додаткові метрики бектесту (лише інтерфейс, з угод і кривої капіталу run(); рушій не змінюється).
   MAE/MFE — найгірше й найкраще проміжне значення угоди за цінами закриття свічок (тіні свічок не враховано). */
function btMore(R,c,s){const g=c.g,tf=g.tf||1,A=aggC(hist(dk(g)),tf),k=Math.min(A.length,Math.floor(c.per/tf)),C=A.slice(-k),eq=R.eq||[],tr=R.b.tr,n=tr.length;
if(!C.length)return null;const ix=new Map(C.map((x,i)=>[x.t,i])),days=k*tf/24,W=tfMs(tf);
let ls=0,cur=0,mae=0,mfe=0,tin=0,tmax=0,best=-Infinity,worst=Infinity;
for(const t of tr){if(t.pnl>0)cur=0;else ls=Math.max(ls,++cur);best=Math.max(best,t.pnl);worst=Math.min(worst,t.pnl);
const t0=t.f&&t.f[0]?t.f[0].t:t.ts,d=Math.max(W,t.ts-t0+W);tin+=d;tmax=Math.max(tmax,d);
if(t.pnl<mae)mae=t.pnl;if(t.pnl>mfe)mfe=t.pnl; // фінальний результат угоди теж межа MAE/MFE
const a=ix.get(t0),b=ix.get(t.ts);if(a==null||b==null)continue;const base=a>0?eq[a-1]:0;
for(let i=a;i<b;i++){const u=eq[i]-base;if(u<mae)mae=u;if(u>mfe)mfe=u}}
const roi=s.pnl/c.dep,yr=days>=1&&roi>-1?(Math.pow(1+roi,365/days)-1)*100:NaN,dd=Math.abs(s.dd),ddp=Math.abs(s.ddp);
const bh=(C[C.length-1].c/C[0].c-1)*100,q=n?1-s.wr/100:0,exp=n&&q>0&&q<1?Math.max(1,Math.round(Math.log(n*(1-q))/-Math.log(q))):0;
return{days,yr,calmar:ddp>0&&isFinite(yr)?yr/ddp:NaN,rf:dd>0?s.pnl/dd:NaN,bh,vs:roi*100-bh,avg:n?tr.reduce((x,t)=>x+t.pnl,0)/n:0,best:n?best:0,worst:n?worst:0,
ls,exp,tavg:n?tin/n:0,tmax,tshare:k?Math.min(100,tin/(k*W)*100):0,mae,mfe,maep:mae/c.dep*100,mfep:mfe/c.dep*100,n}}
const hrs=ms=>{const h=ms/36e5;return h>=48?n2(h/24,1)+' дн.':n2(h,0)+' год'};
function btMoreHtml(m){if(!m)return'';const x=v=>isFinite(v)?n2(v,2):'—';
return`<details class="card" style="margin-top:12px" open><summary><b>Додаткові метрики</b></summary><div class="k" style="margin-top:10px">${K('Річна дохідність (CAGR)',isFinite(m.yr)?f(m.yr,1)+'%':'—',cls(m.yr))}${K('Calmar',x(m.calmar))}${K('Recovery factor',x(m.rf))}${K('Buy & Hold пари',f(m.bh,1)+'%',cls(m.bh))}${K('Бот проти Buy & Hold',f(m.vs,1)+' п.п.',cls(m.vs))}${K('Середня угода',f(m.avg),cls(m.avg))}${K('Найкраща / найгірша',f(m.best)+' / '+f(m.worst))}${K('Серія збитків: макс. / очікувана',m.ls+' / '+(m.n?m.exp:'—'))}${K('Час в угоді: сер. / макс.',m.n?hrs(m.tavg)+' / '+hrs(m.tmax):'—')}${K('Час у позиції',n2(m.tshare,0)+'%')}${K('MAE (найгірше в угоді)',f(m.mae)+' ('+f(m.maep,1)+'%)',cls(m.mae))}${K('MFE (найкраще в угоді)',f(m.mfe)+' ('+f(m.mfep,1)+'%)',cls(m.mfe))}</div>
<p class="mu" style="margin-top:8px">Період ${n2(m.days,0)} дн. CAGR — дохідність у перерахунку на рік; Calmar — CAGR до макс. просадки у %; Recovery factor — прибуток до макс. просадки. MAE/MFE — найгірший і найкращий проміжний результат угоди у USDT і % депозиту, за цінами закриття свічок. Очікувана серія збитків — типова найдовша для такого win rate і кількості угод.</p></details>`}
/* «Поділитися»: посилання з налаштуваннями бота в адресі (#b=…). Лише параметри стратегії, без ключів і даних користувача.
   При відкритті посилання значення перевіряються: невідомі поля відкидаються, числа мають бути скінченними. */
const SHK=['d','tf','fut','be','pair','sg',...Object.keys(DEF).filter(k=>typeof DEF[k]==='number')];
const b64u=s=>btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const u64b=s=>decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/'))));
function shareUrl(c){const g={};for(const k of SHK)if(c.g[k]!==undefined)g[k]=c.g[k];return location.origin+location.pathname+'#b='+b64u(JSON.stringify({v:1,g,ex:c.ex,per:c.per,dep:c.dep}))}
function shareParse(h){const m=/^#b=([A-Za-z0-9_-]{8,4000})$/.exec(h||'');if(!m)return null;let o;try{o=JSON.parse(u64b(m[1]))}catch(e){return null}
if(!o||o.v!==1||!o.g||typeof o.g!=='object')return null;const g={};
for(const k of SHK){const v=o.g[k];if(v===undefined)continue;if(k==='pair'){if(typeof v==='string'&&Object.prototype.hasOwnProperty.call(PAIRS,v))g.pair=v}
else if(k==='sg'){if(Array.isArray(v))g.sg=v.filter(x=>typeof x==='string'&&Object.prototype.hasOwnProperty.call(SGN,x))}else if(typeof v==='number'&&isFinite(v))g[k]=v}
if(g.d!==1&&g.d!==-1)delete g.d;if(!g.pair)return null;return{g,ex:typeof o.ex==='string'?o.ex:'',per:+o.per,dep:+o.dep}}
function shareApply(){const s=shareParse(location.hash);if(!location.hash.startsWith('#b='))return;history.replaceState(null,'',location.pathname+location.search);
if(!s)return toast('Посилання на бота пошкоджене — налаштування не завантажено');fill(s.g,s.ex);
const sv2=(id,v)=>{const e=$(id);if(!(v>0))return;const o=e.value;e.value=String(v);if(e.value!==String(v))e.value=o};sv2('#fper',s.per);sv2('#fdp',s.dep);
go('bd');toast('Налаштування бота з посилання завантажено — можна запускати бектест')}
$('#bshare').onclick=async()=>{const c=cfg(),e=bad(c);if(e)return $('#res').innerHTML=`<p class="dn">${e}</p>`;const url=shareUrl(c);
try{if(navigator.share){await navigator.share({title:'Orbix: налаштування бота',url});return}}catch(er){if(er&&er.name==='AbortError')return}
try{await navigator.clipboard.writeText(url);toast('Посилання на бота скопійовано')}catch(er){prompt('Скопіюйте посилання на бота:',url)}};
$('#bt').onclick=()=>{const c=cfg(),e=bad(c);if(e)return $('#res').innerHTML=`<p class="dn">${e}</p>`;
withData(dk(c.g),$('#res'),()=>{const R=bt(c.g,c.per,c.dep,1),s=summ(R,c.dep);bsave(c,s);
$('#res').innerHTML=`<div class="k">${K('Угод',s.n)}${K('Win rate',s.wr.toFixed(0)+'%')}${K('PnL з відкритою позицією',f(s.pnl),cls(s.pnl))}${K('Реалізований / відкритий',f(s.real,0)+' / '+f(s.unr,0))}${K('Дохідність',f(s.roi,1)+'%',cls(s.roi))}${K('Макс. просадка',f(s.dd)+' ('+f(s.ddp,1)+'%)',cls(s.dd))}${K('Профіт-фактор',pf(s))}${K('Ліквідацій',s.liq,s.liq?'dn':'')}${c.g.fut?K('Funding',f(-s.fund),cls(-s.fund)):''}</div><p class="mu" style="margin-top:10px">${dataNote(c.g)}</p>${btMoreHtml(btMore(R,c,s))}<div class="card" id="qa" style="margin-top:12px"></div><h3>Графік угод</h3><div class="bt-ch"></div><h3>Крива капіталу</h3><div style="margin:8px 0 14px">${chart(s.cur)}</div><p class="mu">${c.g.pair}, ${tfl(c.g.tf)}, ${perl(c.per)} на ${hsrc()}${MD.mode==='live'&&D[dk(c.g)].length<c.per?` (доступно ${n2(D[dk(c.g)].length/24,0)} дн.)`:''}. Просадка враховує відкриті позиції, докупівлі в одній свічці виконуються до стопа. ${MD.mode==='live'?'Минулі результати не гарантують майбутніх, тому дивіться й розділ «Стрес-тест».':'Демо-ціни поводяться м’якше за реальний ринок, тому дивіться й розділ «Стрес-тест».'}</p>`+R.b.tr.slice(-8).reverse().map(t=>`<div class="tr"><span>${tm(t.ts)}, ордерів ${t.n}${t.liq?', ліквідація':t.sl?', SL':''}</span><span class="mono ${cls(t.pnl)}">${f(t.pnl)}</span></div>`).join('');
btChart($('#res .bt-ch'),c.g,R);qaR(c);const v=$('#gv');if(v._d&&v._k===dk(c.g)){v._mk=tradeMarks(R.b.tr,R.b.pos,c.g);v._d()}},c.per+300)};
function btChart(el,g,R){if(!el)return;const mk=tradeMarks(R.b.tr,R.b.pos,g),k=dk(g),lv=()=>R.b.pos?lines(g,R.b.pos,k):[];lwChart(el,()=>({pair:g.pair,key:k,tf:g.tf,lv,mk:()=>mk}),'mini')}
/* ---------- якість стратегії (06-quality.js): витрати, ринкові умови, стабільність, walk-forward ---------- */
const QV={'стабільна':['up','Стабільна','Прибуток витримує подвоєні витрати, більшість вікон у плюсі, перевага не зникає з часом.'],'сумнівна':['','Сумнівна','Є слабкі місця (див. нижче). Запускайте з меншою сумою й порівнюйте з результатами на Demo.'],'нестабільна':['dn','Нестабільна','Результат бектесту ненадійний — причини нижче. Запускати такого бота не варто.'],'збиткова':['dn','Збиткова','За період бектесту стратегія не заробила.'],'мало угод':['','Замало угод','Менше 10 угод за період — висновок робити рано.']};
function qaR(c){const el=$('#qa');if(!el)return;let q;try{q=quality({...c.g},c.per,c.dep)}catch(e){el.innerHTML=`<h2>Якість стратегії</h2><p class="dn">Помилка розрахунку: ${esc(e.message)}</p>`;return}
const v=QV[q.verdict]||QV['мало угод'],W=q.W===720?'30 дн.':'7 дн.',reg=['up','dn','fl'].filter(r=>q.reg[r]).map(r=>{const o=q.reg[r];return`<tr><td>${QREG[r]}</td><td>${o.pos} з ${o.n}</td><td class="mono ${cls(o.pnl)}">${f(o.pnl)}</td></tr>`}).join('');
el.innerHTML=`<h2>Якість стратегії</h2><p style="margin:0 0 10px"><b class="${v[0]}">${v[1]}.</b> <span class="mu">${v[2]}</span></p>
${q.flags.length?`<ul style="margin:0 0 10px;padding-left:18px">${q.flags.map(x=>`<li class="${x.sev?'dn':''}">${esc(x.t)}</li>`).join('')}</ul>`:''}
<h3>PnL за різних витрат, USDT</h3>${ROW('Без витрат',f(q.gross.pnl),cls(q.gross.pnl))}${ROW('Як у бектесті',f(q.base.pnl),cls(q.base.pnl))}${ROW('Подвоєні витрати',f(q.hard.pnl),cls(q.hard.pnl))}${ROW('Витрати від валового прибутку',q.costShare==null?'—':Math.round(q.costShare*100)+' %',q.costShare>.5?'dn':'')}
<h3>Стабільність</h3>${q.W?ROW(`Вікон по ${W} у плюсі`,q.act?q.pos+' з '+q.act:'—',q.posShare==null?'':q.posShare>=.6?'up':q.posShare<.5?'dn':''):''}${q.conc!=null?ROW('Частка прибутку найкращого вікна',Math.round(q.conc*100)+' %',q.conc>.6?'dn':''):''}${ROW('1-а / 2-а половина, % за 30 дн.',f(q.h1m,1)+' / '+f(q.h2m,1),cls(Math.min(q.h1m,q.h2m)))}
${reg?`<h3>Ринкові умови</h3><div class="sc" tabindex="0" role="region" aria-label="Таблиця, гортайте вбік"><table style="min-width:0"><tr><th>Ринок</th><th>Вікон у плюсі</th><th>PnL</th></tr>${reg}</table></div><p class="mu">${q.vol.hi.n?`Висока волатильність: ${q.vol.hi.n} вікон, PnL ${f(q.vol.hi.pnl)}; звичайна: ${q.vol.lo.n} вікон, PnL ${f(q.vol.lo.pnl)}.`:'Волатильність у всіх вікнах схожа.'}</p>`:''}
<p class="mu" style="margin-top:8px">Подвоєні витрати: комісії ×2, ще 0,1&nbsp;% прослизання на кожному ринковому вході й стопі, прослизання стопу щонайменше 0,2&nbsp;%, funding ×2. Кожне вікно — окремий бот із нуля. Ринок вікна — ріст чи падіння, якщо ціна змінилась більш ніж на ${q.W===168?'3,9':'8'} %, інакше бічний.</p>
<div id="qawf"><button class="b sm" id="qawfb">Walk-forward: чи заробляє підбір на цій парі поза навчанням</button></div>`;
$('#qawfb').onclick=()=>{const w=$('#qawf');w.innerHTML='<p class="mu">Рахую walk-forward…</p>';setTimeout(()=>{let r;try{r=qualityWF({...c.g},c.ex,c.per)}catch(e){w.innerHTML=`<p class="dn">Помилка розрахунку: ${esc(e.message)}</p>`;return}
if(!r){w.innerHTML='<p class="mu">Замало історії для walk-forward перевірки.</p>';return}
w.innerHTML=wfHtml(r).replace('<h2>Walk-forward перевірка</h2>','<h3>Walk-forward</h3>')+`<p class="mu">Ваші параметри на тих самих тестових відрізках: <b class="${cls(r.mine)}">${f(r.mine,1)}%</b>, підбір без знання майбутнього: ${f(r.oos,1)}%.${r.mine>2*Math.max(r.oos,0)+5?' Ваші параметри помітно кращі — можливо, вони підігнані під історію; порівняйте з результатом на Demo.':''}</p>`},30)}}
/* опис джерела даних і моделі комісій для бектесту */
function dataNote(g){const k=dk(normG({...g}));if(MD.mode!=='live')return'Дані: демо-історія.';
if(isF(k))return`Дані: ф'ючерси ${MD.fsrc} (USDⓈ-M), ліквідація за mark price, funding враховано за фактичним розкладом біржі (8, 4 або 1 год). Комісії: 0,02% мейкер (DCA, TP), 0,05% тейкер (вхід, стоп).`;
return g.fut?`Ф'ючерсних даних для пари немає${MD.ferr?' ('+esc(MD.ferr)+')':''}: використано спот ${MD.src}, без funding і mark price. Комісії 0,1%.`:`Дані: спот ${MD.src}. Комісії 0,1%.`}
/* ---------- Редагування бота, що вже працює (як «Edit» у Veles) ----------
   Конструктор заповнюється налаштуваннями бота. Пара, напрям, ринок, таймфрейм і біржа цін не змінюються (це вже інший бот —
   для нього «Клонувати»). Поки угода відкрита, заблоковано й розмір сітки (сума, кількість і крок докупівель, мартингейл,
   плече): драбина на біржі вже стоїть за старими рівнями. Вихід (TP, SL, трейлінг) і сигнали змінюються одразу.
   Зберігається лише змінене поверх наявних налаштувань бота; стара версія з часом зміни — у x.gh (для відтворення історії). */
let EDIT=null;
const ED_FIX=['fp','fdr','fmk','ftf','fe'],ED_GRID=['fb','fo','fs','fx','fm','flv'];
const edBusy=x=>!!(x.b.pos||x.b.pe);
function edLock(on,x){const busy=on&&edBusy(x);
for(const id of ED_FIX){const e=$('#'+id);if(e){e.disabled=on;e.title=on?'Не змінюється в наявного бота — для іншої пари чи напряму скористайтеся «Клонувати»':''}}
for(const id of ED_GRID){const e=$('#'+id);if(e){e.disabled=busy;e.title=busy?'Поки угода відкрита, розмір сітки не змінюється':''}}
$$('[data-m]').forEach(b=>b.disabled=busy)}
function edStart(x){EDIT={id:x.id};fill(x.g,x.ex);edLock(true,x);
$('#fgt').textContent='Редагування бота '+ttl(x);
const h=$('#edh');h.hidden=false;h.textContent='Змінюйте налаштування й натисніть «Зберегти зміни». Пара, напрям, ринок, таймфрейм і біржа не змінюються — для них скористайтеся «Клонувати».'+(edBusy(x)?' Угода зараз відкрита: розмір сітки (сума, докупівлі, крок, мартингейл, плече) заблоковано до її закриття, а TP, SL, трейлінг і сигнали застосуються до цієї угоди.':' Зміни діють з наступної угоди.')+(x.srv?' Бот працює на сервері: зміни застосуються протягом 5 хвилин.':'');
$('#ad').hidden=true;$('#esv').hidden=false;$('#ecn').hidden=false;go('bd');pv()}
function edEnd(){if(!EDIT)return;const x=bots.find(b=>b.id===EDIT.id);EDIT=null;edLock(false,x||{b:{}});$('#fgt').textContent='Налаштування бота';$('#edh').hidden=true;$('#ad').hidden=false;$('#esv').hidden=true;$('#ecn').hidden=true}
/* змінені поля: порівнюються лише поля форми (без fee/slip, які cfg() підставляє сам), заблоковані — ігноруються */
const edSame=(a,b)=>Array.isArray(a)||Array.isArray(b)?JSON.stringify(a)===JSON.stringify(b):typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b)):a===b;
function edDiff(x,c){const busy=edBusy(x),skip=new Set(['fee','slip','pair','d','fut','tf',...(busy?['base','orders','step','smul','mult','lev']:[])]),ch={};
for(const[k,v]of Object.entries(c.g)){if(skip.has(k))continue;if(k==='base'&&Math.abs(v-x.g.base)*ladder(c.g)<.005)continue;if(!edSame(v,x.g[k]))ch[k]=v}return ch}
$('#esv').onclick=()=>{const x=EDIT&&bots.find(b=>b.id===EDIT.id);if(!x){edEnd();return toast('Бота не знайдено.')}
const c=cfg();c.g={...c.g,pair:x.g.pair,d:x.g.d,fut:x.g.fut,tf:x.g.tf};c.ex=x.ex;const e=bad(c);if(e)return $('#res').innerHTML=`<p class="dn">${e}</p>`;
const ch=edDiff(x,c);if(!Object.keys(ch).length){toast('Змін немає.');return}
const t=Math.max(Date.now(),x.lt||0),ng=normG({...x.g,...ch});
x.gh=[...(x.gh||[]),{u:t,g:x.g}].slice(-50);x.g=ng;x.b.g=ng;sbots();lst();edEnd();go(VARIANT===2?'bots':'ov');
toast(`Зміни бота ${x.g.pair} збережено (${Object.keys(ch).length} пол.)`+(x.srv?' — сервер застосує їх протягом 5 хвилин.':' — діють з цього моменту.')+(typeof rkWarn==='function'&&x.srv&&x.tn?rkWarn(x):''))};
$('#ecn').onclick=()=>{edEnd();go(VARIANT===2?'bots':'ov')};
$('#ad').onclick=()=>{const c=cfg(),e=bad(c);if(e)return $('#res').innerHTML=`<p class="dn">${e}</p>`;withData(dk(c.g),$('#res'),()=>{mk(c.g,c.ex);sbots();lst();go(VARIANT===2?'bots':'ov')})};
$('#sxb').onclick=()=>{const c=cfg(),e=bad(c);if(e)return $('#res').innerHTML=`<p class="dn">${e}</p>`;SXG=c.g;go('sx')};

/* ---------- історія бектестів ---------- */
let BT=ld('zbt',[]);
function bsave(c,s){const e={ex:c.ex,per:c.per,dep:c.dep,g:c.g,n:s.n,wr:s.wr,pnl:s.pnl,roi:s.roi,dd:s.dd,t:Date.now()};BT.unshift(e);BT=BT.slice(0,12);sv('zbt',BT);btCloud(e,s)}
function bsl(){$('#bsh').innerHTML=BT.length?BT.map((b,i)=>`<div class="bc off"><div class="bh"><b>${ttl({g:b.g})}</b><span class="mu">${perl(b.per)} · ${new Date(b.t).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div><div class="bm"><div>PnL<b class="${cls(b.pnl)}">${f(b.pnl)}</b></div><div>Дохідність<b class="${cls(b.roi)}">${f(b.roi,1)}%</b></div><div>Угод / win<b>${b.n} / ${b.wr.toFixed(0)}%</b></div><div>Просадка<b class="${cls(b.dd)}">${f(b.dd,0)}</b></div></div><div class="ac"><button class="b sm" data-a="g" data-i="${i}">Графік</button><button class="b sm" data-a="o" data-i="${i}">Відкрити</button><button class="b sm" data-a="r" data-i="${i}">Запустити бота</button><button class="b sm d" data-a="x" data-i="${i}">Видалити</button></div><div class="gr" hidden></div></div>`).join(''):'<p class="mu">Бектестів ще немає.</p>'}
$('#bsh').onclick=e=>{const t=e.target.closest('button');if(!t)return;const i=+t.dataset.i,b=BT[i],a=t.dataset.a;
if(a==='o'){fill(b.g,b.ex);$('#fper').value=b.per;$('#fdp').value=b.dep;go('bd');return}
if(a==='g'){const el=t.closest('.bc').querySelector('.gr');el.hidden=!el.hidden;if(!el.hidden&&!el._d)withData(dk(b.g),el,()=>{if(PAIRS[b.g.pair])btChart(el,b.g,bt(b.g,b.per,b.dep,0))},b.per+300);return}
if(a==='r'){withData(dk(b.g),null,()=>{mk(b.g,b.ex);sbots();lst();go(VARIANT===2?'bots':'ov')});return}
const gone=BT.splice(i,1)[0];sv('zbt',BT);bsl();if(CLOUD.u&&gone&&gone.rid)SB.from('backtests').delete().eq('id',gone.rid).then(r=>{if(r.error)cloudFail(r.error)})};

