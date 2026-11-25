/* ---------- Картки сигналів у Telegram (v18): налаштування сервера для кожного користувача ----------
   Таблиця public.tg_card_prefs (лише власні рядки, з 2FA). Сервер (runner) надсилає картинку з графіком, ордерами,
   TP/SL і логікою відкриття через функцію tg-card; що надсилати й як — тут. Токен Telegram сюди не потрапляє. */
const TCE={open:'Відкриття угоди',dca:'Докупівлі (DCA)',close:'Закриття: TP, SL, трейлінг, ліквідація',risk:'Ліміти ризику й аварійна зупинка',error:'Помилки біржі',other:'Інше: звірка з біржею, пауза бота'};
const TCP={chart:'Графік свічок',orders:'Лінії входу й докупівель',tpsl:'Лінії TP, SL і ліквідації',logic:'Логіка відкриття',result:'Результат угоди в USDT'};
const TCD={enabled:true,events:{open:true,dca:true,close:true,risk:true,error:true,other:true},parts:{chart:true,orders:true,tpsl:true,logic:true,result:true},theme:'dark',candles:80,bots_off:[]};
let TC={p:null,bots:[],loaded:0,busy:0,msg:'',uid:null};
const tcNorm=r=>{const x=r||{},pk=(o,d)=>Object.fromEntries(Object.keys(d).map(k=>[k,o&&typeof o[k]==='boolean'?o[k]:d[k]]));
return{enabled:x.enabled!==false,events:pk(x.events,TCD.events),parts:pk(x.parts,TCD.parts),theme:['dark','light','auto'].includes(x.theme)?x.theme:'dark',candles:[40,80,150].includes(+x.candles)?+x.candles:80,bots_off:Array.isArray(x.bots_off)?x.bots_off.map(String):[]}};
async function tcLoad(){if(!SB||!CLOUD.u){TC={p:null,bots:[],loaded:1,busy:0,msg:''};return}
const[a,b]=await Promise.all([SB.from('tg_card_prefs').select('enabled,events,parts,theme,candles,bots_off').eq('user_id',CLOUD.u.id).maybeSingle(),SB.from('bots').select('id,status,pair:config->>pair,srv:config->>_srv').limit(200)]);
TC.uid=CLOUD.u.id;TC.p=tcNorm(a.data);TC.bots=(b.data||[]).filter(x=>x.srv==='true');TC.loaded=1;TC.msg=a.error?'Не вдалося прочитати налаштування карток: '+a.error.message:''}
async function tcSave(){const p=TC.p;const r=await SB.from('tg_card_prefs').upsert({user_id:CLOUD.u.id,enabled:p.enabled,events:p.events,parts:p.parts,theme:p.theme,candles:p.candles,bots_off:p.bots_off,updated_at:new Date().toISOString()});
if(r.error)throw new Error(r.error.message)}
function tcF(){if(!CLOUD.u||!TG.st)return'';if(!TC.loaded||TC.uid!==CLOUD.u.id){TC.loaded=1;tcLoad().then(()=>{if(CUR==='pf')pfr()}).catch(e=>{TC.msg=e.message;if(CUR==='pf')pfr()});return'<p class="mu">Завантажую налаштування карток…</p>'}
const p=TC.p||tcNorm(null),ck=(grp,k,l)=>`<label class="ck"><input type="checkbox" data-tc="${grp}" data-tck="${k}"${(grp==='bot'?!p.bots_off.includes(k):p[grp][k])?' checked':''}>${esc(l)}</label>`;
return`<h3 style="margin-top:14px">Картки сигналів із сервера</h3><p class="mu" style="margin:0 0 8px">Сервер надсилає в Telegram картинку: графік, вхід, майбутні докупівлі, TP і SL, а внизу — чому бот відкрив угоду. Це для ботів, увімкнених на сервері.</p>
<label class="ck"><input type="checkbox" data-tc="enabled"${p.enabled?' checked':''}>Надсилати картинкою (вимкнено — лише текст)</label>
<h3>Що надсилати</h3><div class="sgr">${Object.entries(TCE).map(([k,l])=>ck('events',k,l)).join('')}</div>
<h3>Що показувати на картці</h3><div class="sgr">${Object.entries(TCP).map(([k,l])=>ck('parts',k,l)).join('')}</div>
<div class="fg">${sel('tc-theme','Тема картки',[['dark','Темна'],['light','Світла'],['auto','Авто: вдень світла, вночі темна']],p.theme)}${sel('tc-candles','Свічок на графіку',[['40','40'],['80','80'],['150','150']],String(p.candles))}</div>
${TC.bots.length?`<h3>Картки для ботів</h3><div class="sgr">${TC.bots.map(b=>ck('bot',b.id,(b.pair||'Бот')+(b.status==='running'?'':' (на паузі)'))).join('')}</div>`:''}
<div class="ac"><button class="b sm p" data-tc-test>Надіслати пробну картку</button></div><p class="mu" id="tc-msg" style="margin:6px 0 0">${esc(TC.msg)}</p>`}
async function tcTest(){if(!SB||!CLOUD.u)throw new Error('Увійдіть в акаунт.');const r=await SB.functions.invoke('tg-card',{body:{action:'test',theme:TC.p&&TC.p.theme!=='auto'?TC.p.theme:undefined,parts:TC.p?TC.p.parts:undefined}});
if(r.error){let m=r.error.message;try{const j=await r.error.context.json();m=j.error||m}catch(e){}throw new Error(tgMsg(m))}return r.data}
document.addEventListener('change',async e=>{const t=e.target;if(!t.closest||!t.closest('#msg')||!TC.p)return;const p=TC.p;
if(t.dataset.tc==='enabled')p.enabled=t.checked;else if(t.dataset.tc==='bot'){const id=t.dataset.tck;p.bots_off=t.checked?p.bots_off.filter(x=>x!==id):[...p.bots_off,id]}
else if(t.dataset.tc)p[t.dataset.tc][t.dataset.tck]=t.checked;else if(t.id==='tc-theme')p.theme=t.value;else if(t.id==='tc-candles')p.candles=+t.value;else return;
const m=$('#tc-msg');try{await tcSave();if(m)m.textContent='Збережено. Сервер застосує з наступного запуску (до 5 хв).'}catch(er){if(m)m.textContent='Не збережено: '+er.message}});
document.addEventListener('click',async e=>{const b=e.target.closest&&e.target.closest('[data-tc-test]');if(!b||TC.busy)return;TC.busy=1;b.disabled=true;const m=$('#tc-msg');
if(m)m.textContent='Малюю й надсилаю пробну картку…';try{await tcTest();if(m)m.textContent='Надіслано — перевірте Telegram.'}catch(er){if(m)m.textContent='Помилка: '+er.message}finally{TC.busy=0;b.disabled=false}});
