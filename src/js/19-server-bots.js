/* ---------- Боти на сервері 24/7 ----------
   Бот із позначкою «Сервер 24/7» (config._srv) торгує на сервері: Edge Function `runner` кожні 5 хвилин
   проганяє той самий рушій і зберігає стан у bot_state, події — у bot_events. Браузер лише показує цей стан
   і не дублює угод та сповіщень такого бота. */
let SRV={busy:0,seen:new Set(),t:null};
/* чи веде сервер угоди цього бота на демо-біржі */
const srvLive=x=>!!(x.srv&&x.tn&&x.g.fut&&x.rid&&CLOUD.u&&SB);
/* зняти лімітні ордери пари й закрити позицію бота на демо-біржі (видалення, зупинка, повернення в браузер) */
async function srvFlat(x){const ex=x.srvEx||'bybit',nm=ex==='bybit'?'Bybit Demo':'Binance Testnet';try{const r=await SB.functions.invoke('exchange',{body:{exchange:ex,action:'flat',symbol:sym(x.g.pair),...(x.rid?{botId:x.rid}:{})}});let d=r.data;if(r.error){try{d=await r.error.context.json()}catch(e){}throw new Error(d&&d.error||r.error.message)}
FEED.unshift({t:now(),m:nm+': '+x.g.pair+' — '+(d&&d.closed?'позицію закрито, ордери знято':'позиції не було, ордери знято')})}catch(e){FEED.unshift({t:now(),m:nm+': не вдалося закрити '+x.g.pair+' — '+e.message+'. Перевірте позицію на біржі вручну.'});toast('Не вдалося закрити позицію '+x.g.pair+' на біржі: '+e.message)}sv('zfeed',FEED);feedR()}
const FLATQ=p=>'Закрити також позицію та лімітні ордери '+p+' на демо-біржі?\n\nОК — закрити зараз.\nСкасувати — лишити: позиція залишиться на біржі зі своїм стопом, сервер нею більше не керуватиме.';
function srvToggle(x){if(!CLOUD.u)return toast('Увійдіть в акаунт, щоб запустити бота на сервері.');if(!x.rid){cloudQ();return toast('Зачекайте кілька секунд: бот ще синхронізується з хмарою.')}
if(!x.srv&&x.b.pos&&!confirm('У бота '+x.g.pair+' зараз відкрита позиція в браузері. Сервер почне з нуля — ця позиція (і її копія на демо-біржі, якщо увімкнено «Тестнет») далі не супроводжуватиметься. Перенести бота на сервер?'))return;
if(x.srv&&srvLive(x)&&confirm(FLATQ(x.g.pair)))srvFlat(x);
x.srv=!x.srv;if(x.srv)x.srvEx=TN.ex||'bybit';else{x.srvSt=0;x.srvAt=null}sbots();lst();
toast(x.srv?'Бот '+x.g.pair+' переходить на сервер (до 5 хвилин). Сервер торгує з цього моменту, навіть коли застосунок закритий.'+(x.tn?rkWarn(x):''):'Бот '+x.g.pair+' знову працює лише в браузері.')}
async function srvLoad(){if(!SB||!CLOUD.u||SRV.busy)return;const L=bots.filter(x=>x.srv&&x.rid);if(!L.length)return;SRV.busy=1;try{
const ids=L.map(x=>x.rid),s=await SB.from('bot_state').select('bot_id,state,updated_at').in('bot_id',ids);
if(!s.error)for(const r of s.data||[]){const x=L.find(y=>y.rid===r.bot_id),st=r.state||{};if(!x||!st.b)continue;
const b=new Bot(x.g);b.pos=st.b.pos||null;b.tr=Array.isArray(st.b.tr)?st.b.tr:[];b.cd=st.b.cd||0;b.cum=st.b.cum||0;b.nd=st.b.nd!=null?st.b.nd:b.tr.length;b.pe=st.b.pe||null;x.b=b;if(x.cmd&&st.mc===x.cmd.id){x.cmd=null;sbots()}x.pk=st.pk||0;x.dd=st.dd||0;x.lt=st.lt||x.lt;x.srvSt=1;x.srvAt=Date.parse(r.updated_at);x.srvMis=st.fl&&st.fl.mis||null;x.srvRl=st.fl&&st.fl.rl||null;x.srvXs=st.xs;x.srvXe=st.xe||null;x.srvXr=st.xr||null;x.srvPend=Array.isArray(st.pend)?st.pend.length:0}
const e=await SB.from('bot_events').select('id,bot_id,level,message,created_at').in('bot_id',ids).order('created_at',{ascending:false}).limit(30);
if(!e.error){let add=0;for(const r of (e.data||[]).slice().reverse()){if(SRV.seen.has(r.id))continue;SRV.seen.add(r.id);FEED.unshift({t:new Date(r.created_at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}),m:'☁ '+r.message});add++}
if(add){FEED=FEED.slice(0,60);sv('zfeed',FEED);feedR()}}
lst();upd();if(CUR==='mon')monR()}catch(er){}finally{SRV.busy=0}}
/* статус «Помилка» (як у Veles): свіжа помилка біржі (state.xe, не старша за годину) або тривожна розбіжність з біржею (fl.mis.on).
   Кнопка «Перезапустити угоду» надсилає серверу команду resync: він відновлює ордери бота на біржі й скидає помилку. */
const ERR_TTL=36e5;
const srvErr=x=>{if(!x.srv||!x.on||!x.srvSt)return null;const e=x.srvXe;if(e&&e.m&&Date.now()-e.at<ERR_TTL)return{t:'Помилка біржі: '+e.m,at:e.at,xe:1};
const m=x.srvMis;return m&&m.on&&m.t?{t:'Розбіжність з біржею: '+m.t}:null};
const errLine=x=>{const e=srvErr(x);if(!e)return'';const busy=x.cmd&&x.cmd.k==='resync';
return`${e.xe?`<p class="dn" style="margin:0">⚠ ${esc(e.t)} · ${ago(e.at)}</p>`:''}<div class="ac"><button class="b sm p" data-a="rs" data-id="${x.id}"${busy?' disabled':''}>${x.b.pos?'Перезапустити угоду':'Скинути помилку'}</button><button class="b sm" data-a="mon" data-id="${x.id}">Деталі</button></div>`};
/* на демо-біржі є позиція в напрямку бота, а модель угоди не веде: запропонувати підхопити її (як у Veles) */
const adoptOf=x=>{const s=x.srvXs;return x.srv&&x.tn&&x.on&&x.srvSt&&!x.b.pos&&!x.b.pe&&s&&s.amt&&Math.sign(s.amt)===Math.sign(x.g.d)&&s.entry>0?s:null};
const adoptLine=x=>{const s=adoptOf(x);if(!s)return'';const busy=x.cmd&&x.cmd.k==='adopt';
return`<p class="mu" style="margin:0">На демо-біржі відкрита позиція ${x.g.pair} ${s.amt>0?'Long':'Short'} ${Math.abs(s.amt)} за ${px(s.entry)} — бот нею не керує.</p><div class="ac"><button class="b sm" data-a="ad" data-id="${x.id}"${busy?' disabled':''}>Підхопити позицію</button></div>`};
function srvAdopt(x){const s=adoptOf(x);if(!s)return toast('Позиції для підхоплення немає.');
if(!confirm(`Бот почне вести позицію ${x.g.pair} ${s.amt>0?'Long':'Short'} ${Math.abs(s.amt)} за ${px(s.entry)} з демо-біржі: поставить докупівлі, TP і SL за своїми налаштуваннями від ціни входу. Продовжити?`))return;
const t=Date.now();x.cmd={id:'a'+t.toString(36),k:'adopt',q:Math.abs(s.amt),px:s.entry,t};sbots();lst();
toast('Команду надіслано: сервер підхопить позицію протягом 5 хвилин.')}
function srvResync(x){if(!x.on)return toast('Бот на паузі — запустіть його, щоб сервер виконав перезапуск.');const t=Date.now();
x.cmd={id:'r'+t.toString(36),k:'resync',t};sbots();lst();
toast(x.b.pos?'Перезапуск угоди надіслано: сервер протягом 5 хвилин перевірить біржу, поставить відсутні ордери бота й оновить захист.':'Помилку буде скинуто протягом 5 хвилин.')}
const srvMisL=x=>{const m=x.srvMis;if(!x.tn||!m||!m.t||(m.k!=='xc'&&!m.on))return'';return`<p class="${m.k==='xc'?'mu':'dn'}" style="margin:0">${m.k==='xc'?'ℹ':'⚠'} Звірка з біржею: ${esc(m.t)}${m.k==='orphan'?' — перевірте позицію в Bybit Demo':''}</p>`};
const srvRlL=x=>x.srv&&x.tn&&x.srvRl&&x.srvRl.t?`<p class="dn" style="margin:0">⏸ Нові угоди призупинено лімітом ризику: ${esc(x.srvRl.t)}</p>`:'';
const srvLine=x=>x.srv?srvMisL(x)+srvRlL(x)+`<p class="mu" style="margin:0">☁ Працює на сервері 24/7${x.srvSt&&x.srvAt?' · оновлено '+tm(x.srvAt):' · сервер підхопить бота протягом 5 хвилин'}${x.tn?((x.srvEx||'bybit')==='bybit'?' · угоди на Bybit Demo: докупівлі, TP і SL стоять на самій біржі':' · угоди дублюються на Binance Testnet (TP/SL — з сервера після закриття свічки)'):''}</p>`:'';

/* ---------- Моніторинг серверних ботів ----------
   Для кожного бота «Сервер 24/7»: коли сервер востаннє його обробляв, позиція моделі, стан на демо-біржі
   (знімок state.xs, який сервер зберігає після звірки: позиція, SL/TP/трейлінг, лімітні ордери бота),
   помилка біржі (state.xe), розбіжність (fl.mis) і помилки/попередження за 24 год із журналу bot_events. */
const MON={ev:{},at:0,busy:0},STALE=12*60e3;
const ago=ts=>{if(!ts)return'—';const m=Math.round((Date.now()-ts)/60e3);return m<1?'щойно':m<60?m+' хв тому':m<1440?Math.floor(m/60)+' год '+(m%60)+' хв тому':Math.floor(m/1440)+' дн тому'};
async function monEv(){const L=bots.filter(x=>x.srv&&x.rid);if(!SB||!CLOUD.u||!L.length||MON.busy)return;MON.busy=1;try{
const r=await SB.from('bot_events').select('bot_id,level,message,created_at').in('bot_id',L.map(x=>x.rid)).in('level',['error','warn']).gte('created_at',new Date(Date.now()-864e5).toISOString()).order('created_at',{ascending:false}).limit(500);
if(!r.error){const E={};for(const e of r.data||[]){if(e.level==='warn'&&/Stop-Loss/.test(e.message))continue;const o=E[e.bot_id]||(E[e.bot_id]={err:0,warn:0,last:null});o[e.level==='error'?'err':'warn']++;if(!o.last)o.last=e}MON.ev=E;MON.at=Date.now()}}catch(e){}finally{MON.busy=0}}
const ROW=(a,b,k='')=>`<div class="tr"><span>${a}</span><span class="mono ${k}" style="text-align:right">${b}</span></div>`;
function monBot(x){const on=x.on,st=on&&x.srvAt&&Date.now()-x.srvAt>STALE,p=x.b.pos,s=x.srvXs,ev=MON.ev[x.rid]||{err:0,warn:0,last:null},m=x.srvMis,exn=(x.srvEx||'bybit')==='bybit'?'Bybit Demo':'Binance Testnet';
let srv=!x.srvSt?'ще не підхопив (до 5 хв)':on?ago(x.srvAt):'на паузі · '+ago(x.srvAt);
const mdl=p?`${dir(x.g)} ${+p.q.toPrecision(6)} за ${px(p.cost/p.q)} · ордерів ${p.n}/${x.g.orders}${p.t1?' · TP1 зафіксовано':''}`:'позиції немає';
let exl,exk='';if(!x.tn)exl='угоди не дублюються (лише модель)';else if(exn!=='Bybit Demo')exl='стан позиції показується лише для Bybit Demo';else if(s===undefined)exl='даних ще немає — з\'являться після наступного запуску';else if(!s)exl='позиції немає';
else{exl=`${s.amt>0?'Long':'Short'} ${Math.abs(s.amt)} за ${px(s.entry)} · SL ${s.sl?px(s.sl):'<span class="dn">немає</span>'}${s.ts?' · трейлінг '+px(s.ts):s.tp?' · TP '+px(s.tp):''} · докупівель ${s.ord}`;if(!s.sl)exk='dn'}
const bad=st||x.srvXe||(m&&m.on)||ev.err;
/* Demo проти моделі: закриття на біржі (PnL за даними Bybit) і угоди моделі з того самого моменту; прослизання входу (+ — гірше за модель) */
/* обидві сторони рахуються від першого входу, записаного в облік: угода, відкрита раніше, не потрапляє ні в біржу, ні в модель */
let cmp='';const xr=x.srvXr;if(xr&&x.tn){const s0=xr.en.length?xr.en[0].t:null;if(s0==null)cmp=ROW('Demo проти моделі','облік почнеться з наступного входу');else{
const W=tfMs(x.g.tf||1),mt=x.b.tr.filter(t=>t.f&&t.f[0]&&t.f[0].t+W>=s0),xl=xr.l.filter(r=>r.t>=s0),mpl=mt.reduce((a,t)=>a+t.pnl,0),xpl=xl.reduce((a,t)=>a+t.pnl,0),sl=xr.en.map(e=>x.g.d*(e.x-e.m)/e.m*100),sa=sl.reduce((a,v)=>a+v,0)/sl.length;
const d0=new Date(s0).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
cmp=ROW(`PnL на Demo з ${d0}`,`<span class="${cls(xpl)}">${f(xpl)}</span> · закриттів: ${xl.length}`)+ROW(`PnL моделі з ${d0}`,`<span class="${cls(mpl)}">${f(mpl)}</span> · угод: ${mt.length}`)+ROW('Прослизання входу',`${f(sa,3)}&nbsp;% · входів: ${sl.length}`,sa>.1?'dn':'')}}
return`<div class="bc ${bad?'off':'on'}" style="${bad?'--st:var(--dn);opacity:1':''}"><div class="bh"><b>${x.g.pair}</b><span class="mu">${dir(x.g)} · ${tfl(x.g.tf)} · ${x.g.lev}× · ${x.tn?exn:'без біржі'}</span><span class="st" style="margin-left:auto">${bad?'Увага':on?'Працює':'Пауза'}</span></div>
${ROW('Сервер',srv,st?'dn':'')}${st?`<p class="dn" style="margin:0">Сервер не обробляв бота понад 12 хв — перевірте розклад (orbix-runner).</p>`:''}
${ROW('Модель бота',mdl)}${ROW(x.tn?exn:'Біржа',exl,exk)}
${cmp}${x.srvPend?ROW('Черга дій для біржі',x.srvPend+' (сервер повторить)','dn'):''}
${x.srvXe?ROW('Помилка біржі',esc(x.srvXe.m)+' · '+ago(x.srvXe.at),'dn'):''}
${m&&m.t&&(m.on||m.k==='xc')?ROW('Звірка',(m.k==='xc'?'ℹ ':'⚠ ')+esc(m.t),m.on?'dn':''):on&&x.tn&&s!==undefined&&!x.srvXe&&!x.srvPend?ROW('Звірка','модель і біржа збігаються','up'):''}
${x.tn&&x.srvRl&&x.srvRl.t?ROW('Ліміт ризику','⏸ нові угоди призупинено: '+esc(x.srvRl.t),'dn'):''}
${ROW('За 24 год',ev.err||ev.warn?`помилок ${ev.err}, попереджень ${ev.warn}`:'без помилок',ev.err?'dn':'')}${ev.last?`<p class="mu" style="margin:0">Останнє: ${esc(ev.last.message)} · ${ago(Date.parse(ev.last.created_at))}</p>`:''}</div>`}
async function monR(load){const el=$('#mon');if(!el)return;
if(!CLOUD.u){el.innerHTML='<div class="card"><h2>Моніторинг</h2><p class="mu">Увійдіть в акаунт (Профіль), щоб бачити ботів, які працюють на сервері 24/7.</p></div>';return}
const L=bots.filter(x=>x.srv&&x.rid);
if(load){if(Date.now()-MON.at>60e3)await monEv();if(!SRV.busy)srvLoad()}
if(!L.length){el.innerHTML='<div class="card"><h2>Моніторинг</h2><p class="mu">На сервері 24/7 ще немає ботів. Увімкніть «Сервер 24/7» на картці бота.</p></div>';return}
const run=L.filter(x=>x.on),last=Math.max(0,...run.map(x=>x.srvAt||0)),late=last&&Date.now()-last>STALE,
pos=L.filter(x=>x.srvXs).length,alarm=L.filter(x=>(x.on&&x.srvAt&&Date.now()-x.srvAt>STALE)||x.srvXe||(x.srvMis&&x.srvMis.on)).length,errs=L.reduce((a,x)=>a+((MON.ev[x.rid]||{}).err||0),0);
el.innerHTML=`<div class="k">${K('Ботів на сервері',`${run.length} <span class="mu">/ ${L.length}</span>`)}${K('Останній запуск сервера',run.length?ago(last):'—',late?'dn':'')}${K('Позицій на біржі',pos)}${K('Тривоги',alarm,alarm?'dn':'up')}${K('Помилок за 24 год',errs,errs?'dn':'')}</div>
<div class="card" style="margin-top:12px"><div class="bh"><h2 style="margin:0">Сервер 24/7 і біржа</h2><button class="b sm" id="monr" style="margin-left:auto">Оновити</button></div>
<p class="mu" style="margin-top:6px">Сервер обробляє ботів кожні 5 хвилин. Стан біржі — знімок після останньої звірки сервера. Боти, що працюють лише в браузері, тут не показані. «PnL на Demo» — закриті угоди на Bybit Demo (PnL за даними біржі, з її комісіями) поруч із «PnL моделі» — угодами моделі бота тієї ж логіки, що й у бектесті, обидва від першого входу після ввімкнення обліку; прослизання входу — наскільки ціна входу на біржі гірша (+) чи краща (−) за ціну закриття свічки в моделі.${late?' <span class="dn">Сервер не запускався понад 12 хв.</span>':''}</p>
${[...L].sort((a,b)=>(b.on-a.on)||a.g.pair.localeCompare(b.g.pair)).map(monBot).join('')}</div>`;
$('#monr').onclick=()=>{MON.at=0;monR(1)}}
setInterval(()=>{if(document.hidden)return;srvLoad();if(CUR==='mon'&&Date.now()-MON.at>60e3)monEv().then(()=>monR())},60000);
