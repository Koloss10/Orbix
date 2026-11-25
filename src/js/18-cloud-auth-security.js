/* ---------- хмара Orbix: Supabase (вхід, боти, бектести, готові й обрані боти) ---------- */
const SBURL='https://krmnaypaitruhqgaxkfw.supabase.co',SBKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybW5heXBhaXRydWhxZ2F4a2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NzgwMjIsImV4cCI6MjExMDM1NDAyMn0.g91ptIoKGGXaTiz49Y1ukSFDX-709Vf8LbpuxYzapZU';
let SB=null;try{if(window.supabase&&window.supabase.createClient)SB=window.supabase.createClient(SBURL,SBKEY)}catch(e){SB=null}
const CLOUD={u:null,known:new Set(),ok:0,err:''};
const TFC={1:'1h',4:'4h',12:'12h',24:'1d',168:'1w'},RISK={low:'низький',medium:'середній',high:'високий'};
const cloudFail=e=>{CLOUD.err=(e&&e.message)||String(e);accR()};
const brow=x=>({user_id:CLOUD.u.id,name:ttl(x),strategy_type:'dca',exchange:x.ex,symbol:x.g.pair,timeframe:TFC[x.g.tf]||x.g.tf+'h',side:!x.g.d?'neutral':x.g.d<0?'short':'long',mode:'paper',status:x.on?'running':'paused',base_order_size:x.g.base,max_budget:x.g.base*ladder(x.g),config:{...x.g,...(x.vw&&x.vw!=='ladder'?{_vw:x.vw}:{}),_t0:x.t0,_sp:x.sp,_tn:!!x.tn,_srv:!!x.srv,_ex:x.srvEx||(typeof TN!=='undefined'&&TN.ex)||'bybit',...(x.gh&&x.gh.length?{_gh:x.gh}:{})},started_at:new Date(x.t0).toISOString(),preset_id:x.pid||null});
let csT=null,csQ=Promise.resolve();
function cloudQ(){if(!CLOUD.u)return;clearTimeout(csT);csT=setTimeout(()=>{csQ=csQ.then(cloudSave)},400)}
async function cloudSave(onlyNew){if(!CLOUD.u||!SB)return;try{
const cur=new Set(bots.filter(x=>x.rid).map(x=>x.rid)),del=[...CLOUD.known].filter(r=>!cur.has(r));
if(del.length&&!onlyNew){const r=await SB.from('bots').delete().in('id',del);if(r.error)throw r.error}
for(const x of bots){if(x.demo||(onlyNew&&x.rid))continue;const row=brow(x),h=JSON.stringify(row);if(x.rid&&x._h===h)continue;
if(x.rid){const r=await SB.from('bots').update(row).eq('id',x.rid);if(r.error)throw r.error}
else{const r=await SB.from('bots').insert(row).select('id').single();if(r.error)throw r.error;x.rid=r.data.id}
x._h=h}
CLOUD.known=new Set(bots.filter(x=>x.rid).map(x=>x.rid));sloc();CLOUD.ok=Date.now();CLOUD.err='';accR()}catch(e){cloudFail(e)}}
function btCloud(e,s){if(!CLOUD.u||!SB)return;const now=Date.now();
SB.from('backtests').insert({user_id:CLOUD.u.id,exchange:e.ex,symbol:e.g.pair,timeframe:TFC[e.g.tf]||e.g.tf+'h',period_start:new Date(now-e.per*36e5).toISOString(),period_end:new Date(now).toISOString(),initial_balance:e.dep,config:e.g,status:'done',results:{source:'demo',per:e.per,dep:e.dep,n:s.n,wr:s.wr,pnl:s.pnl,roi:s.roi,dd:s.dd,ddp:s.ddp,pf:isFinite(s.pf)?s.pf:null,liq:s.liq},finished_at:new Date(now).toISOString()}).select('id').single().then(r=>{if(r.error)return cloudFail(r.error);e.rid=r.data.id;sv('zbt',BT)})}
let nmT=null;function nameQ(){if(!CLOUD.u||!SB)return;clearTimeout(nmT);nmT=setTimeout(()=>SB.from('profiles').update({display_name:PF.n||null}).eq('id',CLOUD.u.id).then(r=>{if(r.error)cloudFail(r.error)}),800)}

/* готові та обрані боти */
let PRE=[],FAVP=new Set(ld('zfavp',[]));
async function presLoad(){if(!SB)return;
const r=await SB.from('bot_presets').select('id,name,description,exchange,risk_level,config,sort_order').order('sort_order');
if(r.error){toast('Не вдалося завантажити стратегії Orbix: '+r.error.message);return}
PRE=r.data.filter(p=>p.config&&PAIRS[p.config.pair]);for(const p of PRE){try{await need(dk({...DEF,...p.config}));preStats(p)}catch(e){}}presR()}
function preStats(p){if(p._p)return p._p;const g={...DEF,...p.config},dep=Math.round(2*g.base*ladder(g));p._dep=dep;return p._p=pstats(g,dep)}
function presR(){favs()}
/* акаунт */
const BETA_NOMAIL='Листи з кодом і посиланням під час бета-тесту не надсилаються. Увійдіть паролем. Якщо забули пароль — напишіть власнику платформи й вкажіть свою пошту.';
const AUTHM={'Invalid login credentials':'Невірний email або пароль. Якщо акаунта з цією поштою ще немає — натисніть «Зареєструватися».','Email not confirmed':'Спершу підтвердіть адресу за посиланням у листі.','User already registered':'Такий акаунт уже є — просто увійдіть.','Token has expired or is invalid':'Код неправильний або застарів.','Invalid TOTP code entered':'Неправильний код з Google Authenticator.','New password should be different from the old password.':'Новий пароль має відрізнятися від старого.','Signups not allowed for otp':'Акаунта з такою поштою немає — спершу зареєструйтесь.','Email address not authorized':BETA_NOMAIL};
const authMsg=e=>{const m=(e&&e.message)||String(e);return AUTHM[m]||(/email address not authorized|email_address_not_authorized/i.test(m)?BETA_NOMAIL:/email rate limit exceeded|over_email_send_rate_limit/i.test(m)?'Ліміт листів вичерпано — увійдіть паролем.':/rate limit|too many|only request this after/i.test(m)?'Забагато спроб поспіль — зачекайте хвилину й спробуйте ще раз.':/duplicate key|Database error saving new user/i.test(m)?'Запит уже надіслано. Перевірте пошту: там лист для підтвердження.':/invalid.*(code|totp)|expired/i.test(m)?'Код неправильний або застарів.':m)};
const RURL=()=>location.origin+location.pathname;
let AF={mode:'',email:''};
const emMask=e=>{e=String(e||'');const[a,d]=e.split('@');return d?(a.length<=3?a:a.slice(0,3)+'…')+'@'+d:e};
function accR(){if((CLOUD.pend||CLOUD.rec)&&CUR==='pf')pfTab('a',1);{const la=$('#lka');if(la)la.textContent=CLOUD.u?'Відкриється акаунт '+emMask(CLOUD.u.email)+'. Інший акаунт — після розблокування: Профіль → «Увійти в інший акаунт».':''}if(typeof mnuR==='function'&&mnuR._e!==(CLOUD.u&&CLOUD.u.email||'')){mnuR._e=CLOUD.u&&CLOUD.u.email||'';mnuR()}const el=$('#acc'),ch=$('#chip');if(ch){ch.textContent=(MD.mode==='live'?'Live · '+MD.src+(MD.fut?' · F':''):MD.mode==='init'?'Підключення…':'Демо-дані')+(CLOUD.u?' · ☁':'');ch.title=MD.mode==='demo'&&MD.err?'Біржі недоступні: '+MD.err:''}if(!el)return;
if(!SB){el.innerHTML='<h2>Акаунт Orbix</h2><p class="mu">Хмара зараз недоступна (немає з’єднання). Дані зберігаються в цьому браузері.</p>';return}
const u=CLOUD.u;
/* другий крок входу: код з Google Authenticator */
if(CLOUD.pend){el.innerHTML=`<h2>Підтвердження входу</h2><p class="mu" style="margin-bottom:10px">Для ${esc(CLOUD.pend.email||'')} увімкнено двофакторний вхід. Відкрийте Google Authenticator і введіть 6-значний код Orbix.</p><div class="fg"><label>Код з Google Authenticator<input id="amc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></label></div><div class="row"><button class="b p" id="amv">Підтвердити</button><button class="b" id="amx">Скасувати вхід</button></div><p class="mu" id="am" style="margin-top:10px"></p>`;
const go2=async()=>{const c=$('#amc').value.replace(/\D/g,''),m=$('#am');if(c.length!==6){m.textContent='Введіть 6 цифр.';return}m.textContent='Перевіряю…';const r=await SB.auth.mfa.challengeAndVerify({factorId:CLOUD.fid,code:c});if(r.error){m.textContent=authMsg(r.error);return}m.textContent=''};
$('#amv').onclick=go2;$('#amc').onkeydown=e=>{if(e.key==='Enter')go2()};$('#amx').onclick=()=>SB.auth.signOut();setTimeout(()=>{const i=$('#amc');i&&i.focus()},50);return}
/* новий пароль після переходу за посиланням «Забули пароль?» */
if(CLOUD.rec){el.innerHTML=`<h2>Новий пароль</h2><p class="mu" style="margin-bottom:10px">Задайте новий пароль для ${esc((CLOUD.pend||u||{}).email||'акаунта')}.</p><div class="fg"><label>Новий пароль, від 8 символів<input id="anp" type="password" autocomplete="new-password"></label><label>Повторіть пароль<input id="anp2" type="password" autocomplete="new-password"></label></div><div class="row"><button class="b p" id="ans">Зберегти пароль</button></div><p class="mu" id="am" style="margin-top:10px"></p>`;
$('#ans').onclick=()=>setPw($('#anp').value,$('#anp2').value,$('#am'),()=>{CLOUD.rec=0;accR();toast('Пароль змінено')});return}
if(u){el.innerHTML=`<h2>Акаунт Orbix</h2>${CLOUD.no?KV('Ваш ID','#'+String(CLOUD.no).padStart(4,'0')):''}${KV('Email',esc(u.email||''))}${KV('Синхронізація',CLOUD.err?'<span class="dn">помилка</span>':CLOUD.ok?'збережено о '+new Date(CLOUD.ok).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}):'триває…')}${CLOUD.err?`<p class="dn" style="margin-top:6px">${esc(CLOUD.err)}</p>`:''}<p class="mu" style="margin-top:8px">Боти, бектести, обрані, нік і фото зберігаються в хмарі Orbix (сервер у Франкфурті) і доступні з будь-якого пристрою. Двофакторний вхід і пароль — у розділі «Безпека» нижче.</p><p class="mu" style="margin-top:6px">Адміністратор бета-тесту бачить лише ваш ID, нік, кількість і налаштування ботів та результати у %. Пошту, паролі, ключі й суми — ні.</p><div class="row" style="margin-top:12px"><button class="b" id="ao">Вийти з акаунта</button><button class="b" id="ao2">Увійти в інший акаунт</button></div>`;$('#ao').onclick=()=>SB.auth.signOut();$('#ao2').onclick=()=>{AF.email='';AF.mode='';SB.auth.signOut().then(()=>setTimeout(()=>{const i=$('#ae');i&&i.focus()},100))};return}
const code=AF.mode==='code';
el.innerHTML=`<h2>Акаунт Orbix</h2><p class="mu" style="margin-bottom:10px">Увійдіть, щоб боти й бектести зберігалися в хмарі та були доступні з телефона й комп’ютера. Ботів, створених без входу, буде перенесено в акаунт.</p>
<div class="fg"><label>Email<input id="ae" type="email" autocomplete="email" inputmode="email" value="${esc(AF.email)}"></label>${code?'<label>Код з листа<input id="aoc" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>':'<label>Пароль, від 8 символів<input id="ap" type="password" autocomplete="current-password"></label>'}</div>
<div class="row">${code?'<button class="b p" id="aov">Увійти з кодом</button><button class="b" id="aos">Надіслати код ще раз</button><button class="b" id="aop">Увійти з паролем</button>':'<button class="b p" id="ai">Увійти</button><button class="b" id="au">Зареєструватися</button>'}</div>
${code?'':'<div class="row" style="margin-top:8px"><button class="b sm" id="aof">Забули пароль?</button><button class="b sm" id="aoc2">Увійти кодом з пошти</button></div><p class="mu" style="margin-top:10px;font-size:13px">Бета-тест: листи можуть не надходити — реєструйтесь і входьте з паролем (від 8 символів) і запам\'ятайте його.</p>'}<p class="mu" id="am" style="margin-top:10px"></p>`;
const em=()=>{const e=$('#ae').value.trim();AF.email=e;return e};
if(code){$('#aov').onclick=async()=>{const e=em(),t=$('#aoc').value.replace(/\s/g,''),m=$('#am');if(!e||!t){m.textContent='Вкажіть email і код з листа.';return}m.textContent='Перевіряю…';const r=await SB.auth.verifyOtp({email:e,token:t,type:'email'});m.textContent=r.error?authMsg(r.error):''};
$('#aos').onclick=()=>sendCode(em());$('#aop').onclick=()=>{AF.mode='';accR()};return}
$('#ai').onclick=()=>auth(0);$('#au').onclick=()=>auth(1);$('#ap').onkeydown=e=>{if(e.key==='Enter')auth(0)};
$('#aof').onclick=async()=>{const e=em(),m=$('#am');if(!e){m.textContent='Вкажіть email, на який зареєстровано акаунт.';return}m.textContent='Надсилаю лист…';const r=await SB.auth.resetPasswordForEmail(e,{redirectTo:RURL()});m.textContent=r.error?authMsg(r.error):'Якщо акаунт з такою поштою існує, ми надіслали посилання для нового пароля. Відкрийте його на цьому пристрої.'};
$('#aoc2').onclick=()=>{AF.mode='code';accR();sendCode(em())}}
async function sendCode(e){const m=$('#am');if(!e){m.textContent='Вкажіть email і натисніть «Надіслати код ще раз».';return}m.textContent='Надсилаю код…';
const r=await SB.auth.signInWithOtp({email:e,options:{shouldCreateUser:false,emailRedirectTo:RURL()}});if(m.isConnected)m.textContent=r.error?authMsg(r.error):'Лист надіслано. Введіть код з листа або просто відкрийте посилання з нього на цьому пристрої.'}
async function setPw(p,p2,m,ok){if(p.length<8){m.textContent='Пароль має містити щонайменше 8 символів.';return}if(p!==p2){m.textContent='Паролі не збігаються.';return}
m.textContent='Зберігаю…';const r=await SB.auth.updateUser({password:p});if(r.error){m.textContent=authMsg(r.error);return}m.textContent='Пароль змінено.';ok&&ok()}
async function auth(up){const e=$('#ae').value.trim(),p=$('#ap').value,m=$('#am');AF.email=e;if(!e||p.length<(up?8:6)){m.textContent=up?'Вкажіть email і пароль від 8 символів.':'Вкажіть email і пароль.';return}
if(AF.busy)return;AF.busy=1;const bs=$$('#acc button');bs.forEach(b=>b.disabled=true);m.textContent=up?'Реєструю…':'Входжу…';
try{const r=up?await SB.auth.signUp({email:e,password:p,options:{emailRedirectTo:RURL()}}):await SB.auth.signInWithPassword({email:e,password:p});
if(r.error)throw r.error;if(up&&!r.data.session){m.textContent='Готово. Підтвердіть адресу за посиланням у листі, потім поверніться сюди й увійдіть зі своїм паролем.';return}if(up)toast('Акаунт створено. Запам\'ятайте пароль — під час бета-тесту відновити його листом не вийде.');m.textContent=''}catch(err){m.textContent=authMsg(err)}finally{AF.busy=0;bs.forEach(b=>{if(b.isConnected)b.disabled=false})}}
/* вхід завершується лише після другого фактора, якщо він увімкнений */
async function gate(u){try{const a=await SB.auth.mfa.getAuthenticatorAssuranceLevel();if(a.data&&a.data.nextLevel==='aal2'&&a.data.currentLevel!=='aal2'){const f=await SB.auth.mfa.listFactors();
CLOUD.fid=((f.data&&f.data.totp)||[]).find(x=>x.status==='verified')?.id;CLOUD.pend=u;if(CUR!=='pf')go('pf');else accR();return}}catch(e){}
CLOUD.pend=null;if(!CLOUD.u||CLOUD.u.id!==u.id)await cloudIn(u);else accR()}

/* ---------- Безпека: Google Authenticator, пароль, блокування пристрою ---------- */
let SEC={f:null,enr:null,msg:'',busy:0};
async function secLoad(){if(!SB||!CLOUD.u)return;const r=await SB.auth.mfa.listFactors();SEC.f=r.error?null:((r.data&&r.data.totp)||[]).find(x=>x.status==='verified')||null;secR()}
function secR(){const el=$('#sec');if(!el)return;const u=CLOUD.u,lk=LOCK.get();
let h='<h3 style="margin-top:0">Двофакторний вхід (Google Authenticator)</h3>';
if(!u)h+='<p class="mu">Увійдіть в акаунт, щоб увімкнути двофакторний вхід і змінювати пароль.</p>';
else if(SEC.enr)h+=`<p class="mu" style="margin-bottom:10px">1. Встановіть Google Authenticator або Authy. 2. Відскануйте QR-код (або введіть ключ вручну). 3. Введіть 6-значний код, який покаже застосунок.</p><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start"><img src="${esc(SEC.enr.qr)}" alt="QR-код для Google Authenticator" style="width:180px;height:180px;background:#fff;border-radius:12px;padding:8px"><div style="flex:1;min-width:180px"><label>Ключ для ручного введення<input readonly value="${esc(SEC.enr.secret)}" style="font-size:13px"></label><label style="margin-top:10px">Код із застосунку<input id="sxc" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><div class="row" style="margin-top:10px"><button class="b p" data-sx="v">Увімкнути</button><button class="b" data-sx="c">Скасувати</button></div></div></div>`;
else if(SEC.f)h+=`<div class="sw"><div>Увімкнено<div class="mu">Під час входу Orbix попросить код із застосунку, а база даних без нього не віддає ваші дані.</div></div><button class="b sm d" data-sx="off">Вимкнути</button></div>`;
else h+=`<div class="sw"><div>Вимкнено<div class="mu">Захищає акаунт, навіть якщо хтось дізнається пароль.</div></div><button class="b sm p" data-sx="on">Увімкнути</button></div>`;
if(u)h+=`<h3>Змінити пароль</h3><div class="fg" style="margin-bottom:8px"><label>Новий пароль, від 8 символів<input id="snp" type="password" autocomplete="new-password"></label><label>Повторіть пароль<input id="snp2" type="password" autocomplete="new-password"></label></div><div class="row"><button class="b" data-sx="pw">Змінити пароль</button></div>`;
h+=`<h3>Блокування відбитком пальця / Face ID</h3><div class="sw"><div>${lk?'Увімкнено на цьому пристрої':'Вимкнено'}<div class="mu">${LOCK.ok()?'Orbix відкривається лише після відбитка, Face ID або PIN пристрою. Захищає цей телефон чи комп’ютер; акаунт на сервері захищає двофакторний вхід.':'Доступно на сайті Orbix у браузері з відбитком або Face ID (не у файлі й не в перегляді застосунку Claude).'}</div></div><button class="b sm ${lk?'d':'p'}" data-sx="${lk?'unlock':'lock'}" ${LOCK.ok()||lk?'':'disabled'}>${lk?'Вимкнути':'Увімкнути'}</button></div>`;
h+=`<p class="mu" id="sxm" style="margin-top:10px">${esc(SEC.msg)}</p><h3>Ключі API бірж</h3><div class="tr"><span>Права ключів API</span><span class="mono">читання + торгівля, без виведення</span></div><div class="tr"><span>Білий список IP</span><span class="mono">вмикайте на біржі</span></div>`;
el.innerHTML=h}
const sxm=t=>{SEC.msg=t;const m=$('#sxm');if(m)m.textContent=t};
$('#sec').onclick=async e=>{const b=e.target.closest('[data-sx]');if(!b||SEC.busy)return;const a=b.dataset.sx;SEC.busy=1;try{
if(a==='on'){sxm('Готую QR-код…');const L=await SB.auth.mfa.listFactors();for(const x of((L.data&&L.data.all)||[]))if(x.factor_type==='totp'&&x.status!=='verified')await SB.auth.mfa.unenroll({factorId:x.id});
const r=await SB.auth.mfa.enroll({factorType:'totp',friendlyName:'Orbix '+new Date().toISOString().slice(0,16)});if(r.error)throw r.error;SEC.enr={id:r.data.id,qr:r.data.totp.qr_code,secret:r.data.totp.secret};SEC.msg='';secR();setTimeout(()=>{const i=$('#sxc');i&&i.focus()},50)}
else if(a==='v'){const c=($('#sxc').value||'').replace(/\D/g,'');if(c.length!==6){sxm('Введіть 6 цифр з Google Authenticator.');return}sxm('Перевіряю…');const r=await SB.auth.mfa.challengeAndVerify({factorId:SEC.enr.id,code:c});if(r.error)throw r.error;SEC.enr=null;SEC.msg='Двофакторний вхід увімкнено. Збережіть доступ до застосунку: без нього увійти не вийде.';await secLoad();toast('Двофакторний вхід увімкнено')}
else if(a==='c'){if(SEC.enr)await SB.auth.mfa.unenroll({factorId:SEC.enr.id});SEC.enr=null;SEC.msg='';secR()}
else if(a==='off'){if(!confirm('Вимкнути двофакторний вхід? Акаунт буде захищено лише паролем.'))return;const r=await SB.auth.mfa.unenroll({factorId:SEC.f.id});if(r.error)throw r.error;await SB.auth.refreshSession();SEC.msg='Двофакторний вхід вимкнено.';await secLoad()}
else if(a==='pw')await setPw($('#snp').value,$('#snp2').value,$('#sxm'),()=>{$('#snp').value=$('#snp2').value='';SEC.msg='Пароль змінено.'});
else if(a==='lock'){sxm('Підтвердіть відбитком, Face ID або PIN…');await LOCK.enable();SEC.msg='Блокування увімкнено на цьому пристрої.';secR()}
else if(a==='unlock'){LOCK.disable();SEC.msg='Блокування вимкнено.';secR()}
}catch(err){sxm(err&&err.name==='NotAllowedError'?'Підтвердження скасовано.':authMsg(err))}finally{SEC.busy=0}};

/* ---------- блокування застосунку на пристрої (WebAuthn, біометрія пристрою) ---------- */
const LOCK=(()=>{const K='zlock',b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))),ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),rnd=n=>crypto.getRandomValues(new Uint8Array(n));
let hiddenAt=0;const L={get:()=>ld(K,null),ok:()=>!!(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials&&location.protocol==='https:'),
async enable(){if(!L.ok())throw new Error('Біометричне блокування недоступне в цьому браузері.');const c=await navigator.credentials.create({publicKey:{challenge:rnd(32),rp:{name:'Orbix'},user:{id:rnd(16),name:'orbix-lock',displayName:'Orbix'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'discouraged'},timeout:60000}});sv(K,{id:b64(c.rawId)})},
disable(){try{localStorage.removeItem(K)}catch(e){}},
show(){const c=L.get();if(!c)return;const o=$('#lk');o.hidden=false;document.body.style.overflow='hidden'},
async unlock(){const c=L.get(),m=$('#lkm');if(!c){$('#lk').hidden=true;return}try{m.textContent='';await navigator.credentials.get({publicKey:{challenge:rnd(32),allowCredentials:[{type:'public-key',id:ub(c.id)}],userVerification:'required',timeout:60000}});$('#lk').hidden=true;document.body.style.overflow=''}catch(e){m.textContent=e&&e.name==='NotAllowedError'?'Не підтверджено. Спробуйте ще раз.':'Не вдалося: '+(e&&e.message||e)}},
reset(){if(!confirm('Скинути блокування? Дані цього браузера (боти без акаунта, налаштування) буде видалено, а з акаунта буде виконано вихід. Дані в хмарі Orbix збережуться.'))return;try{['zlock','zorya3','zex','zbt','zpf','ztop','ztf','zset','zms','zfeed','zseed','zfavp','zuid','zav','zfavt'].forEach(k=>localStorage.removeItem(k))}catch(e){}(SB?SB.auth.signOut():Promise.resolve()).finally(()=>location.reload())}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(L.get()&&hiddenAt&&Date.now()-hiddenAt>5*6e4)L.show()});return L})();
$('#lkb').onclick=()=>LOCK.unlock();$('#lkr').onclick=()=>LOCK.reset();LOCK.show();

async function cloudIn(u){const prevU=ld('zuid','');if(prevU&&prevU!==u.id)pfLocalReset();CLOUD.u=u;TN.loaded=0;tnLoad().then(()=>{lst();if(CUR==='pf')tnR()}).catch(()=>{});TG={st:null,loaded:0,err:''};CLOUD.err='';accR();
if(ld('zuid','')!==u.id)bots=bots.filter(x=>!x.rid);bots=bots.filter(x=>!x.demo);KEEP=KEEP.filter(x=>!x.demo); // демо-боти в акаунт не переносятьсяsv('zuid',u.id);
await (csQ=csQ.then(()=>cloudSave(1)));if(CLOUD.err)return;
const r=await SB.from('bots').select('id,exchange,status,config,preset_id,started_at').order('created_at');if(r.error)return cloudFail(r.error);
for(const row of r.data){const c=row.config||{};if(c.pair&&PAIRS[c.pair])try{await need(dk(c),hrsFor(c._t0,c.tf))}catch(e){}}
bots=[];for(const row of r.data){const{_t0,_sp,_tn,_srv,_ex,_gh,_vw,...g}=row.config||{};if(!g.pair||!PAIRS[g.pair]||!ready(dk(g)))continue;const x=mk(g,row.exchange,row.status==='running',{t0:_t0||Date.parse(row.started_at||'')||0,sp:_sp,tn:_tn,srv:_srv,srvEx:_ex,gh:_gh,vw:_vw});x.rid=row.id;x.pid=row.preset_id;x._h=JSON.stringify(brow(x))}
CLOUD.known=new Set(r.data.map(x=>x.id));sloc();lst();
const b=await SB.from('backtests').select('id,exchange,config,results,created_at').order('created_at',{ascending:false}).limit(12);
if(!b.error){BT=b.data.filter(x=>x.config&&PAIRS[x.config.pair]).map(x=>{const s=x.results||{};return{rid:x.id,ex:x.exchange,g:x.config,per:s.per||8760,dep:s.dep||1000,n:s.n||0,wr:s.wr||0,pnl:s.pnl||0,roi:s.roi||0,dd:s.dd||0,t:Date.parse(x.created_at)}});sv('zbt',BT)}
const fv=await SB.from('favorite_presets').select('preset_id');
if(!fv.error){const have=new Set(fv.data.map(x=>x.preset_id)),up=[...FAVP].filter(id=>!have.has(id)&&PRE.some(p=>p.id===id));if(up.length)await SB.from('favorite_presets').upsert(up.map(id=>({user_id:u.id,preset_id:id})),{onConflict:'user_id,preset_id',ignoreDuplicates:true});FAVP=new Set([...have,...up]);sv('zfavp',[...FAVP]);presR()}
const p=await SB.from('profiles').select('display_name,avatar,public_no,risk_max_pos,risk_max_total,risk_day_loss').eq('id',u.id).single();
if(!p.error&&p.data){CLOUD.no=p.data.public_no||null;rkSet(p.data);if(p.data.display_name)PF.n=p.data.display_name;else if(PF.n)nameQ();sv('zpf',PF);const a=avFrom(p.data.avatar);if(a){AV=a;try{localStorage.setItem('zav',JSON.stringify(AV))}catch(e){}}else if(AV.img||AV.k!=='orbit')avQ();if(CUR==='pf')avR();mnuR()}
CLOUD.ok=Date.now();accR();srvLoad();admCheck();if(CUR==='bs')bsl();if(CUR==='pf')pfr();if(typeof aiInit==='function')aiInit();toast('Увійшли: дані синхронізовано')}
function cloudOut(){pfLocalReset();CLOUD.adm=0;CLOUD.no=null;ADM.d=null;if(CUR==='adm')go('ov');TN={...TN,c:null,cs:{},loaded:0,bal:null,pos:null,msg:'',busy:0,q:Promise.resolve()};RK={l:null,msg:'',busy:0};TG={st:null,loaded:0,err:''};if(CUR==='pf')setTimeout(()=>{secR();accR()},0);CLOUD.u=null;CLOUD.pend=null;SEC.f=null;SEC.enr=null;SEC.msg='';CLOUD.known=new Set();CLOUD.ok=0;CLOUD.err='';bots=[];BT=[];FAVP=new Set();['zorya3','zbt','zfavp','zuid'].forEach(k=>sv(k,k==='zuid'?'':[]));lst();presR();accR();if(CUR==='bs')bsl();if(typeof aiInit==='function')aiInit()}
function cloudStart(){accR();presLoad().catch(()=>{}).finally(()=>{if(!SB)return;
SB.auth.onAuthStateChange((ev,s)=>{const u=s&&s.user;if(ev==='PASSWORD_RECOVERY'){CLOUD.rec=1;setTimeout(()=>go('pf'),0)}
if(u){if(ev!=='TOKEN_REFRESHED'||CLOUD.pend)setTimeout(()=>gate(u).catch(cloudFail),0)}else if(CLOUD.u||CLOUD.pend||CLOUD.rec){CLOUD.pend=null;CLOUD.rec=0;setTimeout(cloudOut,0)}})})}

