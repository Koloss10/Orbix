/* ---------- Авто-майстер ---------- */
const AWP=[[168,'1 тиждень'],[720,'1 місяць'],[4380,'6 місяців'],[8760,'1 рік'],[26208,'3 роки']];
$('#awf').innerHTML=sel('awe','Біржа',[])+sel('awp','Пара',PK.map(k=>[k,k]),'BTC/USDT')+'<label>Депозит, USDT (0 = підібрати)<input id="awa" type="number" inputmode="decimal" step="any" value="1000"></label>'+sel('awr2','Період бектесту',AWP,8760)+sel('awt','Таймфрейм свічок',[[0,'Авто (1г, 4г, 12г, 1д, 1т)'],...TFS])+sel('awd','Напрямок',[[0,'Авто'],[1,'Long'],[-1,'Short']])+sel('awm','Ринок',[[1,'Futures'],[0,'Spot']])+sel('awl','Плече',[[0,'Авто (1–3×)'],[1,'1×'],[2,'2×'],[3,'3×'],[5,'5×'],[10,'10×']]);
let AW={r:[],c:null},awi=0;
/* walk-forward у фоні: крок за кроком, щоб не блокувати екран */
function awWF(c){const tok=AW.tok={},plan=wfPlan(c);if(!plan){AW.wf={err:'Замало історії для walk-forward перевірки: потрібно щонайменше кілька тижнів даних.'};wfR();return}
const F=[];let i=0;const step=()=>{if(AW.tok!==tok)return;if(i>=plan.P.length){AW.wf=wfSum(F,plan);AW.wfp='';wfR();return}
AW.wfp=`Перевіряю крок ${i+1} з ${plan.P.length}…`;wfR();setTimeout(()=>{if(AW.tok!==tok)return;try{F.push(wfFold(c,plan.P[i++]))}catch(e){AW.wf={err:'Помилка розрахунку: '+e.message};wfR();return}step()},15)};step()}
function wfR(){const el=$('#awwf');if(el)el.innerHTML=wfHtml(AW.wf,AW.wfp)}
const WFV={'стабільна':['up','Стабільна','Підбір дає прибуток на даних, яких не бачив, у більшості кроків.'],'сумнівна':['','Сумнівна','Частина кроків у мінусі або результати поза підбором помітно гірші за навчання. Запускайте з меншою сумою й стежте.'],'нестабільна':['dn','Нестабільна','Поза навчальними даними підбір на цій парі не заробляє. Запускати такого бота не варто.'],'мало':['','Замало даних','Замало кроків з угодами, щоб зробити висновок.']};
const dd2=t=>new Date(t).toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'});
function wfHtml(r,prog){const head='<h2>Walk-forward перевірка</h2>',ex=`<p class="mu" style="margin-top:10px">Перевіряється не одна конфігурація, а сам спосіб підбору. Період ділиться на кроки: параметри підбираються на вікні навчання, а найкращий варіант торгує наступне вікно, якого підбір не бачив. Потім усе зсувається вперед. WFE — відношення темпу прибутку на тестах до темпу на навчанні: від 0,5 і вище вважається нормою.</p>`;
if(!r)return head+`<p class="mu">${prog||'Готую перевірку…'}</p>`+ex;if(r.err)return head+`<p class="dn">${esc(r.err)}</p>`;
const v=WFV[r.verdict]||WFV['мало'];
return head+`<p style="margin:0 0 10px"><b class="${v[0]}">${v[1]}.</b> <span class="mu">${v[2]}</span></p><div class="k">${K('Кроків у плюсі',r.pos+' з '+r.n,r.pos/Math.max(1,r.n)>=.6?'up':r.pos/Math.max(1,r.n)<.4?'dn':'')}${K('Дохідність тестів, сума',f(r.oos,1)+'%',cls(r.oos))}${K('Найгірший крок',f(r.worst,1)+'%',cls(r.worst))}${K('WFE',r.wfe==null?'—':n2(r.wfe,2),r.wfe!=null&&r.wfe>=.5?'up':r.wfe!=null&&r.wfe<0?'dn':'')}</div>
<p class="mu" style="margin-top:10px">Навчання ${n2(r.trH/24,0)} дн., кожен тест ≈ ${n2(r.teH/24,0)} дн.${r.liq?` Ліквідацій на тестах: ${r.liq}.`:''}</p>
<div class="sc"><table><tr><th>Тест</th><th>Підібрано</th><th>Угод</th><th>Навчання</th><th>Тест</th><th>Просадка</th></tr>${r.F.map(x=>`<tr><td class="mono">${dd2(x.trE)}–${dd2(x.teE-1)}</td><td>${x.none?'<span class="mu">нічого не знайдено</span>':esc(x.g.name.split(':')[0])+'<div class="mu">'+tfl(x.g.tf)+', '+dir(x.g)+', '+x.g.lev+'×</div>'}</td><td>${x.n}</td><td class="mono ${x.none?'':cls(x.is.roi)}">${x.none?'—':f(x.is.roi,1)+'%'}</td><td class="mono ${cls(x.roi)}">${x.none?'—':f(x.roi,1)+'%'}</td><td class="mono ${cls(x.ddp)}">${x.none?'—':f(x.ddp,1)+'%'}</td></tr>`).join('')}</table></div>`+ex}
function awShow(i){const E=AW.r[i],c=AW.c,g=E.g,s=E.sf,t=E.st,need=E.need;
const sx=E.sx.map(r=>`<tr><td>${r.n}</td><td>${r.dca}</td><td class="mono ${cls(r.mn)}">${f(r.mn,0)}</td><td>${r.liq?'ліквідація':r.sl?'SL':'—'}</td></tr>`).join('');
$('#awr').innerHTML=`<div class="card"><h2>Підібрана конфігурація</h2><div class="row" style="margin-bottom:12px">${AW.r.map((_,j)=>`<button class="b tg" data-v="${j}" aria-pressed="${j===i}">Варіант ${j+1}</button>`).join('')}</div>`
+KV('Стратегія',g.name)+KV('Сигнали входу',g.sg.map(k=>SGN[k]).join(', ')+', мін. '+g.k)+KV('Таймфрейм, напрямок',tfl(g.tf)+', '+dir(g))+KV('Плече',g.lev+'× (макс. '+maxLev(g.pair,g.ex)+'×)')
+KV('Ордерів DCA',g.orders)+KV('Перший ордер',n2(g.base,2)+' USDT')+KV('Мартингейл (множник ордера)',g.mult)+KV('Крок, множник кроку',(g.step*100).toFixed(1)+'%, '+g.smul)+KV('Take-Profit, Trailing',(g.tp*100).toFixed(1)+'%, '+(g.trail?(g.trail*100).toFixed(1)+'%':'вимк.'))+KV('Stop-Loss',(g.sl*100).toFixed(0)+'%')+KV('Фундаментальний бал пари (демо)',E.fund+'/100')+`</div>
<div class="card"><h2>Депозит і страховка</h2>${KV('Маржа сітки ордерів',n2(E.M,0)+' USDT')}${KV('Страховий запас',n2(E.reserve,0)+' USDT')}${KV('Оптимальний депозит',n2(need,0)+' USDT')}${c.amt>0?KV('Ваш депозит',n2(c.amt,0)+' USDT, '+(c.amt>=need?'достатньо':'бракує '+n2(need-c.amt,0)+' USDT')):'<p class="mu" style="margin-top:6px">Розрахунок для першого ордера 10 USDT. Для іншого розміру збільшіть усе пропорційно.</p>'}<p class="mu" style="margin-top:6px">Страховий запас: більше з двох значень, 1,5 від найгіршої історичної просадки або найгірший збиток у стрес-сценаріях.</p></div>
<div class="card"><h2>Бектест, ${perl(c.per)}</h2><p class="mu" style="margin-bottom:8px">Період включає 70% даних, на яких підбирались параметри, тому цифри завищені. Чесна оцінка — перевірка поза підбором нижче.</p><div class="k">${K('Угод',s.n)}${K('Win rate',s.wr.toFixed(0)+'%')}${K('PnL з відкритою позицією',f(s.pnl),cls(s.pnl))}${K('Дохідність на депозит',f(s.roi,1)+'%',cls(s.roi))}${K('Макс. просадка',f(s.dd,0)+' ('+f(s.ddp,1)+'%)',cls(s.dd))}${K('Профіт-фактор',pf(s))}</div><div style="margin:14px 0">${chart(s.cur)}</div><p class="mu">Перевірка на останніх 30% періоду, які не брали участі в підборі: угод ${t.n}, PnL ${f(t.pnl,0)} USDT${t.n<5?' (замало угод для висновків)':''}.</p></div>
<div class="card" id="awwf">${wfHtml(AW.wf,AW.wfp)}</div>
<div class="card"><h2>Стрес-сценарії</h2><div class="sc" tabindex="0" role="region" aria-label="Таблиця, гортайте вбік"><table><tr><th>Сценарій</th><th>Ордерів</th><th>Мін. капітал</th><th>Результат</th></tr>${sx}</table></div></div>
<div class="card"><div class="row"><button class="b p" data-a="a">Додати paper-бота</button><button class="b" data-a="o">Відкрити в конструкторі</button><button class="b" data-a="f">У топові</button></div><p class="mu" style="margin-top:10px">Підбір виконано на ${hsrc()}. Кращий бектест не гарантує прибуток.</p></div>`}
function awRun(c){const o=$('#awr');if(!PAIRS[c.pair]||!c.ex||!listed(c.pair,c.ex))return o.innerHTML='<p class="dn">Оберіть пару зі списку, яка торгується на вибраній біржі.</p>';
if(c.dr<0&&!c.fut)return o.innerHTML='<p class="dn">Short доступний лише на Futures.</p>';
if(c.tf&&Math.floor(c.per/c.tf)<60)return o.innerHTML='<p class="dn">Для цього таймфрейму період замалий: потрібно щонайменше 60 свічок.</p>';
withData(dk(c),o,()=>{o.innerHTML='<p class="mu">Підбираю конфігурацію…</p>';
setTimeout(()=>{try{const t=auto(c,0);if(!t.length)return o.innerHTML='<p class="dn">Не знайшлося конфігурації з достатньою кількістю угод. Спробуйте більший період, більшу суму (мінімальний ордер 5 USDT) або інший таймфрейм.</p>';
AW={r:t.map(x=>evalC(x,c)),c,wf:null,wfp:''};awi=0;awShow(0);awWF(c)}catch(e){o.innerHTML='<p class="dn">Помилка розрахунку: '+e.message+'</p>'}},30)},c.per+300)}
$('#awb').onclick=()=>{let p=$('#awp').value.trim().toUpperCase();if(!p.includes('/'))p+='/USDT';awRun({pair:p,ex:$('#awe').value,amt:+$('#awa').value||0,per:+$('#awr2').value,tf:+$('#awt').value,dr:+$('#awd').value,fut:+$('#awm').value,lev:+$('#awl').value})};
$('#awr').onclick=e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.v!=null){awi=+t.dataset.v;awShow(awi);return}
const E=AW.r[awi],c=AW.c;if(t.dataset.a==='a'){withData(dk(E.g),null,()=>{mk(E.g,c.ex);sbots();lst();go(VARIANT===2?'bots':'ov')})}else if(t.dataset.a==='f'){addFav(E,c.ex);t.textContent='Додано в топові'}else{fill(E.g,c.ex);$('#fper').value=c.per;$('#fdp').value=Math.round(c.amt||E.need);go('bd')}};
$('#awg').onclick=()=>go('aw');

/* ---------- топові боти: щонеділі перераховує Автомайстер ---------- */
let TOP=ld('ztop',{ts:0,at:0,list:[]}),topBusy=0;if(!TOP.v||TOP.v<5)TOP={ts:0,at:0,list:[],v:5};
const TPER=[[24,'День'],[168,'Тиждень'],[720,'Місяць'],[8760,'Рік']];
let TF=ld('ztf',{per:8760,by:'roi',dep:0,d:0,tf:0,dd:0,ex:''});
const lastSun=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return +d};
const fmtd=t=>new Date(t).toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'});
function pstats(g,dep){const p={};for(const[per]of TPER){const s=summ(bt(g,per,dep,0),dep);p[per]={pnl:s.pnl,roi:s.roi,n:s.n,wr:s.wr,ddp:s.ddp}}return p}
function pack(E,ex){return{ex,g:E.g,need:E.need,M:E.M,res:E.reserve,troi:E.st.roi,tdd:E.st.ddp,tn:E.st.n,fund:E.fund,liq:E.sf.liq,p:pstats(E.g,E.need)}}
function addFav(E,ex){TOP.list=[pack(E,ex),...TOP.list.filter(x=>x.g.pair!==E.g.pair||x.g.tf!==E.g.tf||x.g.d!==E.g.d||x.g.name!==E.g.name)].slice(0,40);sv('ztop',TOP);favs()}
function topJob(force){const ws=lastSun();if(topBusy||MD.mode==='init'||(!force&&TOP.ts>=ws&&TOP.m===MD.mode))return;topBusy=1;const pairs=PK.slice(0,12),res=[];let i=0,skipped=0;favs();
const step=async()=>{if(i>=pairs.length){/* рейтинг — лише за перевіркою поза підбором (останні 30% періоду), щоб не винагороджувати підгонку */
res.sort((a,b)=>((b.wf&&b.wf.v==='стабільна')-(a.wf&&a.wf.v==='стабільна'))||(b.troi+(b.tdd||0))-(a.troi+(a.tdd||0)));TOP={ts:ws,at:Date.now(),list:res.slice(0,30),v:5,m:MD.mode,skip:skipped,np:pairs.length};sv('ztop',TOP);topBusy=0;favs();seed();return}
const p=pairs[i++];$('#tops').textContent=`Авто-майстер оновлює топ на ${hsrc()} і робить walk-forward перевірку: ${i} з ${pairs.length}…`;
try{await need(dk({pair:p,fut:1}));const ex=cx.find(e=>listed(p,e));if(ex){const c={pair:p,ex,amt:0,per:8760,tf:0,dr:0,fut:1,lev:0},t=auto(c,ws%997);
/* у топ потрапляють лише пари, де підбір пройшов walk-forward перевірку */
const w=wfo(c,{folds:8,ns:4}),wf=w&&{v:w.verdict,pos:w.pos,n:w.n,oos:w.oos,wfe:w.wfe};if(wf&&(wf.v==='стабільна'||wf.v==='сумнівна'))for(const o of t){const E=evalC(o,c);if(E.st.n>=5&&E.st.pnl>0&&!E.sf.liq)res.push({...pack(E,ex),wf})}else skipped++}}catch(e){}
setTimeout(step,20)};step()}
function tfilter(){$('#tfl').innerHTML=sel('tf-per','Період',TPER,TF.per)+sel('tf-by','Сортувати за',[['roi','Дохідність, %'],['pnl','PnL, USDT'],['wr','Win rate'],['n','Кількість угод'],['dd','Найменша просадка']],TF.by)+sel('tf-dep','Депозит до',[[0,'Будь-який'],[100,'100 USDT'],[300,'300 USDT'],[500,'500 USDT'],[1000,'1 000 USDT'],[3000,'3 000 USDT']],TF.dep)+sel('tf-d','Напрямок',[[0,'Усі'],[1,'Long'],[-1,'Short']],TF.d)+sel('tf-tf','Таймфрейм',[[0,'Усі'],...TFS],TF.tf)+sel('tf-dd','Просадка до',[[0,'Будь-яка'],[5,'5%'],[10,'10%'],[20,'20%'],[35,'35%']],TF.dd)+sel('tf-ex','Біржа',[['','Усі'],...cx.map(e=>[e,e])],TF.ex);
$('#tfl').onchange=()=>{TF={per:+$('#tf-per').value,by:$('#tf-by').value,dep:+$('#tf-dep').value,d:+$('#tf-d').value,tf:+$('#tf-tf').value,dd:+$('#tf-dd').value,ex:$('#tf-ex').value};sv('ztf',TF);favs()}}
/* єдиний список «Топ Боти»: готові стратегії Orbix (Supabase) + результати Авто-майстра */
let FAVT=ld('zfavt',{}),ITEMS={};
const tkey=x=>'t:'+x.g.pair+'|'+x.g.tf+'|'+x.g.d+'|'+(x.g.name||'')+'|'+x.ex;
function topItems(){const o=[];for(const p of PRE){if(!p._p)continue;o.push({k:'p:'+p.id,src:'pre',pid:p.id,ex:p.exchange,g:{...DEF,...p.config,name:p.name},need:p._dep,res:0,troi:null,p:p._p,title:p.name,desc:p.description||'',risk:p.risk_level})}
for(const x of TOP.list)o.push({...x,k:tkey(x),src:'top',title:x.g.pair,desc:x.g.name||'Власні налаштування'});return o}
const isFav=it=>it.src==='pre'?FAVP.has(it.pid):!!FAVT[it.k];
function tcard(it,r,per){const s=it.p&&it.p[per]||{pnl:0,roi:0,n:0,wr:0,ddp:0},fv=isFav(it),g=it.g;ITEMS[it.k]=it;
return`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${r?'#'+r+' ':''}${esc(it.title)}</b><button class="b sm tg" data-a="f" data-k="${esc(it.k)}" aria-pressed="${fv}" aria-label="${fv?'Прибрати з обраних':'Додати в обрані'}" style="font-size:18px;min-width:44px">${fv?'★':'☆'}</button></div>
<p class="mu">${it.src==='pre'?g.pair+' · ':''}${dir(g)} · ${tfl(g.tf)} · ${g.lev||1}× · ${esc(it.ex)}${it.risk?' · ризик '+(RISK[it.risk]||esc(it.risk)):''}</p><p class="mu">${it.src==='pre'?'Orbix: ':'Авто-майстер: '}${esc(it.desc)}</p>${it.wf?`<p class="mu">Walk-forward: <b class="${it.wf.v==='стабільна'?'up':''}">${it.wf.pos} з ${it.wf.n} кроків у плюсі</b>, ${it.wf.v}</p>`:''}
<p class="mono ${cls(s.roi)}" style="margin:6px 0;font-size:18px">${f(s.roi,1)}% <span style="font-size:13px">(${f(s.pnl,0)} USDT)</span></p>
<p class="mu">За ${TPER.find(t=>t[0]===per)[1].toLowerCase()}: угод ${s.n}, win ${s.wr.toFixed(0)}%, просадка ${f(s.ddp,1)}%${it.src==='top'&&per===8760?'. Рік включає період підбору параметрів — орієнтуйтесь на тест поза підбором.':''}</p><p class="mu">Депозит від ${n2(it.need,0)} USDT${it.res?', страховка '+n2(it.res,0):''}.${it.troi!=null?` Тест поза підбором: ${f(it.troi,0)}%.`:''}</p>
<div class="row"><button class="b p" data-k="${esc(it.k)}" data-a="r">Запустити</button><button class="b" data-k="${esc(it.k)}" data-a="o">Відкрити</button></div></div>`}
function favs(){const all=topItems(),per=TF.per;
$('#tops').textContent=(topBusy?'':TOP.at?`Авто-майстер: ${fmtd(TOP.at)}, наступне оновлення в неділю.${TOP.skip?` Не пройшли walk-forward: ${TOP.skip} з ${TOP.np} пар.`:''} `:'Авто-майстер ще не рахував топ. ')+(PRE.length?`Стратегій Orbix: ${PRE.length}. `:'')+`Відсотки — бектест на ${hsrc()}, а не обіцянка прибутку.`;
const L=all.map(x=>({x,s:x.p&&x.p[per]||{pnl:0,roi:0,n:0,wr:0,ddp:0}})).filter(({x,s})=>(!TF.dep||x.need<=TF.dep)&&(!TF.d||x.g.d===TF.d)&&(!TF.tf||x.g.tf===TF.tf)&&(!TF.dd||-s.ddp<=TF.dd)&&(!TF.ex||x.ex===TF.ex));
L.sort((a,b)=>TF.by==='dd'?b.s.ddp-a.s.ddp:b.s[TF.by]-a.s[TF.by]);
$('#fav').innerHTML=L.length?L.slice(0,10).map(({x},r)=>tcard(x,r+1,per)).join(''):(topBusy||MD.mode==='init'?'<p class="mu">Рахую…</p>':'<p class="mu">За цим фільтром ботів немає. Змініть фільтр або натисніть «Оновити».</p>');
const F=[...all.filter(isFav),...Object.values(FAVT).filter(x=>!all.some(y=>y.k===x.k))];
$('#favp').innerHTML=F.length?F.map(x=>tcard(x,0,per)).join(''):'<p class="mu">Натисніть ☆ на картці топ-бота, щоб додати його в Обрані.</p>'}
function topClick(e){const t=e.target.closest('[data-k]');if(!t)return;const it=ITEMS[t.dataset.k];if(!it)return;const a=t.dataset.a;
if(a==='f'){if(it.src==='pre'){const on=!FAVP.has(it.pid);on?FAVP.add(it.pid):FAVP.delete(it.pid);sv('zfavp',[...FAVP]);
if(CLOUD.u&&SB){const q=on?SB.from('favorite_presets').upsert({user_id:CLOUD.u.id,preset_id:it.pid},{onConflict:'user_id,preset_id',ignoreDuplicates:true}):SB.from('favorite_presets').delete().eq('preset_id',it.pid).eq('user_id',CLOUD.u.id);q.then(r=>{if(r.error)cloudFail(r.error)})}}
else{if(FAVT[it.k])delete FAVT[it.k];else{const{k,src,title,desc,...rest}=it;FAVT[it.k]={...rest,k,src,title,desc}}sv('zfavt',FAVT)}favs();return}
if(!PAIRS[it.g.pair])return toast('Пара '+it.g.pair+' зараз недоступна');
if(a==='r'){withData(dk(it.g),null,()=>{const x=mk(it.g,it.ex);if(it.pid)x.pid=it.pid;sbots();lst();toast('Бот '+it.title+' запущено в paper-режимі')});t.textContent='Додано';setTimeout(()=>t.textContent='Запустити',1500);return}
fill(it.g,it.ex);$('#fdp').value=Math.round(it.need||1000);go('bd')}
$('#fav').onclick=topClick;$('#favp').onclick=topClick;
$('#tfb').onclick=()=>{const p=$('#tfp'),o=p.hidden;p.hidden=!o;$('#tfb').setAttribute('aria-expanded',o)};
$('#topr').onclick=()=>topJob(1);
/* демо-боти для нового відвідувача без акаунта: позначені demo, в акаунт не переносяться й у хмару не зберігаються;
   якщо в браузері вже є вхід (сесія Supabase), демо-ботів не створюємо */
const hasSess=()=>{try{return!!localStorage.getItem('sb-krmnaypaitruhqgaxkfw-auth-token')}catch(e){return false}};
function seed(){if(ld('zseed',0)||bots.length||!TOP.list.length||CLOUD.u||CLOUD.pend||hasSess())return;TOP.list.slice(0,3).forEach(x=>{mk(x.g,x.ex).demo=1});sv('zseed',1);sbots();lst()}

