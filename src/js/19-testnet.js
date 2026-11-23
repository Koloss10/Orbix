/* ---------- Тестнет Binance Futures: ключі на сервері, справжні ордери на тестових грошах ----------
   Ключі API зберігаються в Supabase Vault (RPC ex_save / ex_delete), ордери надсилає Edge Function `exchange`,
   жорстко прив'язана до testnet.binancefuture.com. Браузер ключів не бачить. */
let TN={c:null,cs:{},ex:ld('ztnex','bybit'),loaded:0,bal:null,pos:null,msg:'',busy:0,q:Promise.resolve()};
const TNX={bybit:{n:'Bybit Demo Trading',s:'Bybit Demo',hint:'віртуальні кошти, реальні ринкові ціни (рекомендовано)'},binance:{n:'Binance Futures Testnet',s:'тестнет Binance',hint:'тестові кошти, окремий тестовий ринок'}};
const TNM={'invalid key format':'Ключі мають вигляд довгого рядка з латинських літер і цифр: API Key і Secret Key з тестнету.','mfa required':'Спершу підтвердьте вхід кодом з Google Authenticator.','not authenticated':'Увійдіть в акаунт.','keys not configured':'Спершу збережіть ключі тестнету.','symbol not on testnet':'Цієї пари немає на тестнеті Binance Futures.','invalid symbol':'Неправильна пара.','leverage 1..20':'Плече на тестнеті: від 1 до 20×.'};
const tnMsg=(m,c)=>TNM[m]||(c==='withdraw'?'У ключа ввімкнено право на виведення коштів — Orbix такий ключ не використовує, ключ відхилено. Створіть на біржі новий ключ без цього дозволу й збережіть його тут.':c===-2015||c===-2014||c===-1022||c===10003||c===10004||/API-key|Invalid API|Signature|API key is invalid|error sign/i.test(m)?(TN.ex==='bybit'?'Bybit не приймає ключі. Перевірте, що ключ створено саме в режимі Demo Trading, тип — «згенеровані системою» (не RSA), і що ви скопіювали API Key і Secret без пробілів.':'Тестнет не приймає ключі. Перевірте, що API Key і Secret Key саме з testnet.binancefuture.com і що ключ має дозвіл на торгівлю.')
:c===10005||/Permission denied/i.test(m)?'Ключ не має дозволу на торгівлю контрактами. Увімкніть для ключа «Читання і запис» і дозволи Контракти → Ордери й Позиції.'
:/ab not enough|not enough|insufficient/i.test(m)||c===110007?'Недостатньо коштів на демо-рахунку.'
:/order too small/.test(m)?'Сума менша за мінімальний ордер біржі: '+m.replace('order too small: min','мінімум')+'.':/Margin is insufficient|-2019/.test(m)||c===-2019?'Недостатньо маржі на тестовому рахунку.':/ReduceOnly/i.test(m)?'Немає позиції, яку можна закрити.':/Not Found|404/.test(m)?'Серверна функція біржі ще не встановлена.':'Біржа: '+m);
async function tnCall(body){if(!SB||!CLOUD.u)throw new Error('Увійдіть в акаунт.');const r=await SB.functions.invoke('exchange',{body:{exchange:TN.ex,...body}});
if(r.error){let m=r.error.message,c=null;try{const j=await r.error.context.json();m=j.error||m;c=j.code}catch(e){}throw new Error(tnMsg(m,c))}return r.data}
async function tnLoad(){if(!SB||!CLOUD.u){TN.c=null;TN.cs={};TN.loaded=1;return}const r=await SB.from('exchange_connections').select('id,exchange,status,key_hint,can_trade,last_checked_at').eq('is_testnet',true);TN.cs={};for(const x of(r.error?[]:r.data||[]))TN.cs[x.exchange]=x;TN.c=TN.cs[TN.ex]||null;TN.loaded=1}
const tnSt={active:'працює',invalid:'біржа не приймає ключі',pending:'ще не перевірено',revoked:'відхилено (ключ із правом виведення або відкликаний)'};
function tnR(){const el=$('#tnc');if(!el)return;const c=TN.c;
let h=`<h2>Демо-торгівля на біржі</h2><p class="mu" style="margin-bottom:10px">Справжні ордери на біржі, але на віртуальних коштах: так перевіряють, як бот торгуватиме, без ризику. Ключі зберігаються на сервері в зашифрованому сховищі, а сервер надсилає ордери лише на демо- і тестові адреси бірж — реальний рахунок звідси недоступний.</p><div class="row" style="margin-bottom:10px">${Object.entries(TNX).map(([k,v])=>`<button class="b sm tg" data-tnx="${k}" aria-pressed="${TN.ex===k}">${v.n}${TN.cs[k]?' ✓':''}</button>`).join('')}</div><p class="mu" style="margin:0 0 10px">${TNX[TN.ex].n}: ${TNX[TN.ex].hint}.</p>`;
if(!CLOUD.u){el.innerHTML=h+'<p class="mu">Увійдіть в акаунт Orbix, щоб підключити тестнет.</p>';return}
if(CLOUD.u&&!TN.loaded){tnLoad().then(tnR).catch(()=>{});el.innerHTML=h+'<p class="mu">Завантажую…</p>';return}
h+=`<div class="fg" style="margin-bottom:8px"><label>API Key (${TNX[TN.ex].s})<input id="tn-k" type="password" autocomplete="off" placeholder="${c?'збережено …'+esc(c.key_hint||'')+'; вставте новий, щоб замінити':TN.ex==='bybit'?'з режиму Demo Trading на Bybit':'з testnet.binancefuture.com'}"></label><label>Secret Key (${TNX[TN.ex].s})<input id="tn-s" type="password" autocomplete="off" placeholder="${c?'збережено на сервері':''}"></label></div>
<div class="row"><button class="b sm p" data-tn="save">Зберегти на сервері</button>${c?'<button class="b sm" data-tn="check">Перевірити й показати баланс</button><button class="b sm d" data-tn="del">Видалити ключі</button>':''}</div>`;
if(!c)h+=TN.ex==='bybit'?`<p class="mu" style="margin-top:10px">Як створити ключ: на bybit.com перейдіть у режим «Демо-торгівля» (Demo Trading) — це окремий акаунт із віртуальними USDT. У ньому: аватар → API → «Створити новий ключ» → <b>«Ключі API, згенеровані системою»</b> (не RSA). Використання: «API трансакція». Дозволи: «Читання і запис», лише Контракти → Ордери й Позиції. Виведення й переказ — не вмикати. IP: без обмеження. Скопіюйте API Key і Secret (секрет показується лише раз).</p>`:`<p class="mu" style="margin-top:10px">Де взяти ключі: відкрийте testnet.binancefuture.com, увійдіть, унизу сторінки у вкладці «API Key» створіть ключ і скопіюйте обидва рядки (Secret Key показується лише раз). Тестові USDT зараховуються автоматично.</p>`;
else{h+=`<p class="mu" style="margin-top:10px">Ключ …${esc(c.key_hint||'')}: ${tnSt[c.status]||esc(c.status)}${c.last_checked_at?', перевірено '+tm(Date.parse(c.last_checked_at)):''}.</p>`;
if(TN.bal)h+=KV('Баланс гаманця, USDT',n2(TN.bal.wallet,2))+KV('Доступно, USDT',n2(TN.bal.available,2))+KV('Нереалізований PnL',`<span class="${cls(TN.bal.unrealized)}">${f(TN.bal.unrealized)}</span>`);
const opts=PK.filter(p=>!MD.fset||MD.fset.has(p)).slice(0,40).map(p=>`<option value="${sym(p)}">${p}</option>`).join('');
h+=`<h3>Пробний ордер</h3><div class="fg" style="margin-bottom:8px"><label>Пара<select id="tn-p">${opts}</select></label><label>Сума, USDT (з плечем)<input id="tn-n" type="number" inputmode="decimal" value="150"></label><label>Плече<select id="tn-l">${[1,2,3,5,10,20].map(v=>`<option value="${v}">${v}×</option>`).join('')}</select></label></div>
<div class="row"><button class="b sm p" data-tn="buy">Купити (Long)</button><button class="b sm d" data-tn="sell">Продати (Short)</button><button class="b sm" data-tn="close">Закрити позицію</button><button class="b sm" data-tn="pos">Позиції</button></div>`;
if(TN.pos)h+=TN.pos.length?'<div class="sc" tabindex="0" role="region" aria-label="Таблиця, гортайте вбік" style="margin-top:10px"><table><tr><th>Пара</th><th>Кількість</th><th>Вхід</th><th>Mark</th><th>PnL</th><th>Ліквідація</th></tr>'+TN.pos.map(x=>`<tr><td>${esc(x.symbol)}</td><td class="mono ${cls(x.amt)}">${x.amt}</td><td class="mono">${px(x.entry)}</td><td class="mono">${px(x.mark)}</td><td class="mono ${cls(x.pnl)}">${f(x.pnl)}</td><td class="mono">${x.liq?px(x.liq):'—'}</td></tr>`).join('')+'</table></div>':'<p class="mu" style="margin-top:10px">Відкритих позицій немає.</p>';
h+=`<p class="mu" style="margin-top:10px">Щоб бот торгував на ${TNX[TN.ex].s}, натисніть «Тестнет» на картці ф'ючерсного бота: кожен його вхід, докупівля й закриття дублюватимуться на вибраній біржі. Разом із «Сервер 24/7» бот торгує й тоді, коли Orbix закритий. Обмеження розміру угод — у картці «Ліміти ризику» нижче.</p>`}
el.innerHTML=h+`<p class="mu" id="tnm" style="margin-top:10px">${esc(TN.msg)}</p>`}
const tnm=t=>{TN.msg=t;const m=$('#tnm');if(m)m.textContent=t};
$('#tnc').onclick=async e=>{const xb=e.target.closest('[data-tnx]');if(xb&&!TN.busy){TN.ex=xb.dataset.tnx;sv('ztnex',TN.ex);TN.c=TN.cs[TN.ex]||null;TN.bal=null;TN.pos=null;TN.msg='';tnR();lst();return}const b=e.target.closest('[data-tn]');if(!b||TN.busy)return;const a=b.dataset.tn;TN.busy=1;$$('#tnc [data-tn]').forEach(x=>x.disabled=true);try{
if(a==='save'){const k=$('#tn-k').value.trim(),s=$('#tn-s').value.trim();if(!k||!s){tnm('Вставте обидва ключі: API Key і Secret Key.');return}tnm('Зберігаю на сервері…');const r=await SB.rpc('ex_save',{p_key:k,p_secret:s,p_exchange:TN.ex});if(r.error)throw new Error(tnMsg(r.error.message));await tnLoad();TN.bal=await tnCall({action:'check'}).catch(async e=>{await tnLoad();tnR();throw e});await tnLoad();TN.msg='Ключі збережено й перевірено: '+TNX[TN.ex].n+' працює.';tnR();lst()}
else if(a==='check'){tnm('Перевіряю…');TN.bal=await tnCall({action:'check'}).catch(async e=>{await tnLoad();tnR();throw e});await tnLoad();TN.msg=TN.bal.canTrade?'Ключі працюють, торгівля дозволена.':'Ключі працюють, але торгівля для ключа вимкнена.';tnR()}
else if(a==='del'){if(!confirm('Видалити ключі '+TNX[TN.ex].n+' з сервера?'))return;const r=await SB.rpc('ex_delete',{p_exchange:TN.ex});if(r.error)throw new Error(tnMsg(r.error.message));await tnLoad();TN.bal=null;TN.pos=null;if(!Object.keys(TN.cs).length)bots.forEach(x=>x.tn=false);sbots();TN.msg='Ключі видалено.';tnR();lst()}
else if(a==='buy'||a==='sell'){const n=+$('#tn-n').value;tnm('Надсилаю ордер…');const r=await tnCall({action:'order',symbol:$('#tn-p').value,side:a==='buy'?'BUY':'SELL',notional:n,leverage:+$('#tn-l').value});const o=r.order;TN.pos=(await tnCall({action:'positions'})).positions;TN.msg=`Виконано: ${o.side==='BUY'?'купівля':'продаж'} ${o.qty} ${o.symbol} за ${o.approx?'≈':''}${px(o.price)}.`;tnR()}
else if(a==='close'){tnm('Закриваю позицію…');const r=await tnCall({action:'close',symbol:$('#tn-p').value});TN.pos=(await tnCall({action:'positions'})).positions;TN.msg=r.closed?`Позицію закрито за ${px(r.order.price)}.`:'Позиції за цією парою немає.';tnR()}
else if(a==='pos'){tnm('Завантажую…');TN.pos=(await tnCall({action:'positions'})).positions;TN.msg='';tnR()}
}catch(er){tnm('Помилка: '+er.message)}finally{TN.busy=0;$$('#tnc [data-tn]').forEach(x=>x.disabled=false)}};
/* дублювання угод paper-бота на тестнеті (лише живі події, послідовно) */
function tnMirror(x,kind,notional){if(x.srv||!x.tn||!x.g.fut||!CLOUD.u||!TN.c)return;const symbol=sym(x.g.pair),side=x.g.d>0?'BUY':'SELL';
const job=kind==='close'?{action:'close',symbol}:{action:'order',symbol,side,notional:+(+notional).toFixed(2),...(kind==='open'?{leverage:x.g.lev||1}:{})};
const log=m=>{FEED.unshift({t:now(),m:TNX[TN.ex].s+' '+x.g.pair+': '+m});FEED=FEED.slice(0,60);sv('zfeed',FEED);feedR()};
TN.q=TN.q.then(()=>tnCall(job)).then(r=>log(kind==='close'?(r.closed?'позицію закрито за '+px(r.order.price):'позиції не було'):(kind==='open'?'вхід ':'докупівля ')+r.order.qty+' за '+(r.order.approx?'≈':'')+px(r.order.price))).catch(e=>log('помилка — '+e.message))}

/* ---------- Ліміти ризику (profiles.risk_*; діють на сервері — runner/risk.js) ----------
   Коли ліміт перевищено, серверний бот із «Тестнет» не відкриває НОВИХ угод; відкриті веде далі (SL, TP, докупівлі).
   Порожнє поле — ліміт вимкнено. Ліміти за замовчуванням: угода 3000, разом 8000, збиток за добу 150 USDT. */
let RK={l:null,msg:'',busy:0};
const rkNum=v=>{const x=+v;return isFinite(x)&&x>0?x:0};
function rkSet(d){RK.l={pos:rkNum(d.risk_max_pos),total:rkNum(d.risk_max_total),day:rkNum(d.risk_day_loss)}}
/* повна драбина бота: вхід і всі докупівлі, з плечем — як на сервері */
const rkLad=g=>(+g.base||0)*(+g.lev||1)*ladder(g);
const rkTn=x=>!!(x.srv&&x.tn&&x.g.fut);
/* зайнято: драбини серверних ботів із «Тестнет», що мають позицію; збиток за добу UTC — закриття на біржі або угоди моделі */
function rkNow(){const L=bots.filter(rkTn),d0=Math.floor(Date.now()/864e5)*864e5;let busy=0,day=0;
for(const x of L){if(x.b&&x.b.pos)busy+=rkLad(x.g);const xr=x.srvXr;if(xr&&Array.isArray(xr.l))day+=xr.l.reduce((a,r)=>a+(r.t>=d0?r.pnl:0),0);
else{const W=tfMs(x.g.tf||1);day+=(x.b&&x.b.tr||[]).reduce((a,t)=>a+((+t.ts||0)+W>=d0?t.pnl:0),0)}}return{busy,day,n:L.length}}
/* попередження при вмиканні сервера чи «Тестнет»: драбина бота більша за ліміт угоди — бот не відкриватиме угод */
function rkWarn(x){const l=RK.l;if(!l||!l.pos||!x.g.fut)return'';const v=rkLad(x.g);return v>l.pos+1e-9?` Увага: повна драбина бота ${n2(v,0)} USDT більша за ваш ліміт угоди ${n2(l.pos,0)} USDT — на сервері він не відкриватиме нових угод (Профіль → «Ліміти ризику»).`:''}
function rkR(){const el=$('#rkc');if(!el)return;
let h=`<h2>Ліміти ризику</h2><p class="mu" style="margin-bottom:10px">Діють на сервері для ботів «Сервер 24/7» з «Тестнет». Коли ліміт перевищено, бот не відкриває <b>нових</b> угод, а вже відкриті веде як завжди (SL, TP, докупівлі); ви отримаєте сповіщення. Порожнє поле — без ліміту.</p>`;
if(!CLOUD.u){el.innerHTML=h+'<p class="mu">Увійдіть в акаунт Orbix, щоб налаштувати ліміти.</p>';return}
if(!RK.l){el.innerHTML=h+'<p class="mu">Завантажую…</p>';return}
const l=RK.l,z=rkNow(),v=x=>x?String(x):'';
h+=`<div class="fg" style="margin-bottom:8px"><label>Угода, USDT (вхід + усі докупівлі, з плечем)<input id="rk-p" type="number" inputmode="decimal" min="0" step="any" value="${v(l.pos)}" placeholder="без ліміту"></label>
<label>Усі угоди разом, USDT<input id="rk-t" type="number" inputmode="decimal" min="0" step="any" value="${v(l.total)}" placeholder="без ліміту"></label>
<label>Збиток за добу (UTC), USDT<input id="rk-d" type="number" inputmode="decimal" min="0" step="any" value="${v(l.day)}" placeholder="без ліміту"></label></div>
<div class="row"><button class="b sm p" data-rk="save">Зберегти ліміти</button></div>`;
if(z.n){h+=KV('Зараз зайнято угодами',`${n2(z.busy,0)}${l.total?' з '+n2(l.total,0):''} USDT`)+KV('Результат за добу (UTC)',`<span class="${cls(z.day)}">${f(z.day)}</span>${l.day?' · ліміт −'+n2(l.day,0):''} USDT`);
const big=bots.filter(x=>rkTn(x)&&l.pos&&rkLad(x.g)>l.pos+1e-9);if(big.length)h+=`<p class="dn" style="margin-top:8px">Не відкриватимуть нових угод через ліміт угоди: ${big.map(x=>esc(x.g.pair)+' ('+n2(rkLad(x.g),0)+' USDT)').join(', ')}.</p>`}
el.innerHTML=h+`<p class="mu" id="rkm" style="margin-top:10px">${esc(RK.msg)}</p>`}
$('#rkc').onclick=async e=>{const b=e.target.closest('[data-rk]');if(!b||RK.busy||!CLOUD.u||!SB)return;
const rd=id=>{const s=$(id).value.trim();if(s==='')return null;const x=+s;if(!isFinite(x)||x<0)throw new Error('ліміт має бути додатним числом або порожнім');return x>0?x:null};
RK.busy=1;b.disabled=true;try{const row={risk_max_pos:rd('#rk-p'),risk_max_total:rd('#rk-t'),risk_day_loss:rd('#rk-d')};
const r=await SB.from('profiles').update(row).eq('id',CLOUD.u.id).select('risk_max_pos,risk_max_total,risk_day_loss').single();if(r.error)throw r.error;
rkSet(r.data);RK.msg='Ліміти збережено. Сервер застосує їх під час наступного запуску (до 5 хвилин).'+(!row.risk_max_pos||!row.risk_max_total||!row.risk_day_loss?' Частину лімітів вимкнено — це менш безпечно.':'')}
catch(er){RK.msg='Помилка: '+(er.message||er)}finally{RK.busy=0;rkR()}};
