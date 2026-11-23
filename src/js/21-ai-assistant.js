/* ---------- Orbix AI: помічник (лише читання й рекомендації) ----------
   Плаваюча іконка на всіх екранах: дотик відкриває діалог, утримання (~0,4 с) вмикає перетягування,
   після відпускання іконка прилипає до найближчого краю; положення зберігається (ключ zai_pos).
   Діалог працює через Edge Function `ai-assistant`: ключ AI-провайдера лежить на сервері, помічник бачить лише
   дані вашого акаунта й нічого не торгує та не змінює. Якщо AI недоступний, решта Orbix працює як завжди.
   Чат малюється в кількох місцях (вікно з іконки і розділ «Orbix AI»), стан у них спільний. */
const AIS={open:0,busy:0,conv:null,uid:null,msgs:[],list:null,hist:0,left:null,off:'',force:null,statAt:0};
const AIK='zai_pos',AIFAB='zai_fab',AIHINT='zai_hint';
const AIQ=['Аналіз мого портфеля','Стан усіх ботів','Найкращі та найгірші боти','Перевірка ризиків','Результати моїх бектестів'];
const AICTX={home:'Головна',bot:'Бот',monitor:'Моніторинг',chart:'Ринок',backtest:'Бектести',risk:'Ризики',profile:'Профіль'};

/* фірмовий значок: орбіта з супутником і іскрою (кольори з теми); id градієнта унікальний для кожного екземпляра */
function aiOrb(id){return`<svg class="ai-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><radialGradient id="${id}" cx="34%" cy="28%" r="85%"><stop offset="0" style="stop-color:#9AF6FF"/><stop offset=".5" style="stop-color:var(--ac)"/><stop offset="1" style="stop-color:var(--ac2)"/></radialGradient></defs>`+
`<g transform="rotate(-24 32 32)"><ellipse class="ai-ring" cx="32" cy="32" rx="29" ry="10.5" fill="none" stroke="url(#${id})" stroke-width="2.2" stroke-linecap="round"/>`+
`<circle r="3.4" fill="#fff"><animateMotion dur="4.6s" repeatCount="indefinite" path="M3,32 a29,10.5 0 1,0 58,0 a29,10.5 0 1,0 -58,0"/></circle></g>`+
`<circle cx="32" cy="32" r="15.5" fill="url(#${id})"/><path class="ai-spark" d="M32 21.5l2.3 8.2 8.2 2.3-8.2 2.3-2.3 8.2-2.3-8.2-8.2-2.3 8.2-2.3z" fill="#06111A"/></svg>`}

/* ---------- розмітка діалогу ---------- */
const aiHm=()=>`<div class="ai-h"><span class="ai-av">${aiOrb('aig'+Math.random().toString(36).slice(2,7))}</span><div class="ai-t"><b>Orbix AI</b><span class="mu ai-cx"></span></div>`+
`<button class="b sm" data-ai="hist" aria-label="Історія діалогів" title="Історія">⟲</button><button class="b sm" data-ai="new" aria-label="Новий діалог" title="Новий діалог">＋</button><button class="b sm ai-x" data-ai="close" aria-label="Закрити" title="Закрити">✕</button></div>`+
`<div class="ai-hs" hidden></div><div class="ai-m" role="log" aria-live="polite"></div><div class="ai-q"></div>`+
`<form class="ai-f" data-ai="form"><textarea class="ai-in2" rows="1" maxlength="1500" placeholder="Запитайте про ботів…" aria-label="Повідомлення до Orbix AI" enterkeyhint="send"></textarea><button class="b p ai-s" type="submit" aria-label="Надіслати">➤</button></form>`+
`<p class="mu ai-n">AI лише читає дані й пояснює: не торгує і нічого не змінює. Це не фінансова порада.</p>`;
const aiHosts=()=>$$('.ai-c');
function aiMount(h){if(h.dataset.m)return;h.dataset.m='1';h.innerHTML=aiHm();aiR()}

/* простий безпечний «markdown»: **жирний**, `код`, списки; усе інше — звичайний екранований текст */
function aiMd(t){const inl=s=>s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');let h='',ul=0;
for(const l of esc(t).split('\n')){const m=/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l),hd=/^\s*#{1,4}\s+(.*)$/.exec(l);
if(m){if(!ul){h+='<ul>';ul=1}h+='<li>'+inl(m[1])+'</li>';continue}if(ul){h+='</ul>';ul=0}
if(hd)h+='<p><b>'+inl(hd[1])+'</b></p>';else if(l.trim())h+='<p>'+inl(l)+'</p>'}
return h+(ul?'</ul>':'')}
const aiTime=t=>t?new Date(t).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}):'';
function aiSrc(m){if(!m.src||!m.src.length)return'';const at=m.src.map(s=>Date.parse(s.as_of)||0).filter(Boolean),old=at.length&&Date.now()-Math.max(...at)>15*6e4;
return`<div class="ai-src mu">Дані: ${m.src.map(s=>esc(s.label||s.name)).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')}${at.length?' · станом на '+aiTime(Math.max(...at)):''}${old?' (могли застаріти)':''}</div>`}

/* ---------- контекст: звідки відкрито помічника ---------- */
function aiCtx(){const t={ov:'home',bots:'home',bd:'home',mon:'monitor',mk:'chart',bs:'backtest',pf:'profile'}[CUR]||'home',c={type:t};
if(CUR==='mk'&&typeof MKP!=='undefined'&&PAIRS[MKP])c.pair=MKP;if(AIS.force)Object.assign(c,AIS.force);return c}
const aiCtxT=()=>{const c=aiCtx();return AICTX[c.type]+(c.pair?' · '+c.pair:'')};

/* ---------- відмальовування ---------- */
function aiR(){const ctxT=aiCtxT(),c=aiCtx();
for(const h of aiHosts()){if(!h.dataset.m)continue;
const cx=h.querySelector('.ai-cx');if(cx)cx.textContent=AIS.left!=null?ctxT+' · лишилось '+AIS.left+' сьогодні':ctxT;
const m=h.querySelector('.ai-m'),stick=m.scrollHeight-m.scrollTop-m.clientHeight<80;
let x='';if(!AIS.msgs.length&&!AIS.busy){x=`<div class="ai-w"><span class="ai-big">${aiOrb('aiw'+Math.random().toString(36).slice(2,6))}</span><h2>Привіт! Я Orbix AI</h2><p class="mu">Читаю дані вашого акаунта Orbix і пояснюю їх: стан ботів, ризики, бектести, помилки бірж. Нічого не торгую й не змінюю.</p>${CLOUD.u?'':'<p class="dn">Щоб я бачив ваші дані, увійдіть в акаунт (Профіль).</p>'}${AIS.off?`<p class="dn">${esc(AIS.off)}</p>`:''}</div>`}
for(const g of AIS.msgs)x+=g.r==='u'?`<div class="ai-b ai-u">${aiMd(g.t)}</div>`:`<div class="ai-b ai-a${g.err?' ai-e':''}">${aiMd(g.t)}${aiSrc(g)}</div>`;
if(AIS.busy)x+='<div class="ai-b ai-a ai-ty" aria-label="Orbix AI збирає дані"><i></i><i></i><i></i></div>';
m.innerHTML=x;if(stick||AIS.busy)m.scrollTop=m.scrollHeight;
const q=h.querySelector('.ai-q'),Q=[...(c.id?['Аналіз цього бота']:[]),...AIQ];
q.innerHTML=AIS.msgs.length?'':Q.map(t=>`<button class="b sm" data-ai="q" data-t="${esc(t)}">${esc(t)}</button>`).join('');
const hs=h.querySelector('.ai-hs');hs.hidden=!AIS.hist;
if(AIS.hist)hs.innerHTML=AIS.list===null?'<p class="mu">Завантажую…</p>':AIS.list.length?AIS.list.map(v=>`<div class="ai-hr"><button class="b sm ai-ho" data-ai="open" data-id="${esc(v.id)}"><b>${esc(v.title)}</b><span class="mu">${tm(Date.parse(v.updated_at))}</span></button><button class="b sm d" data-ai="del" data-id="${esc(v.id)}" aria-label="Видалити діалог">✕</button></div>`).join(''):'<p class="mu">Збережених діалогів ще немає.</p>';
const ta=h.querySelector('.ai-in2'),sb=h.querySelector('.ai-s');ta.disabled=sb.disabled=!!AIS.busy;
const fab=$('#ai-fab');if(fab)fab.classList.toggle('busy',!!AIS.busy)}aiMotion()}
/* користувачі з «зменшити рух»: супутник на орбіті не анімується */
const AIRM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function aiMotion(){if(AIRM)$$('.ai-svg').forEach(v=>v.pauseAnimations&&v.pauseAnimations())}

/* ---------- обмін із сервером ---------- */
async function aiInvoke(body){const r=await SB.functions.invoke('ai-assistant',{body});
if(r.error){let j=null;try{j=await r.error.context.json()}catch(e){}return{ok:0,status:r.error.context&&r.error.context.status||0,j:j||{message:'Не вдалося зв’язатися з AI. Спробуйте пізніше.'}}}return{ok:1,j:r.data}}
function aiReset(){AIS.conv=null;AIS.msgs=[];AIS.hist=0;AIS.force=null}
async function aiSend(text){text=String(text||'').trim();if(!text||AIS.busy)return;
if(!SB||!CLOUD.u){AIS.msgs.push({r:'u',t:text},{r:'a',t:'Увійдіть в акаунт Orbix (розділ «Профіль»), щоб я міг бачити ваші дані.',err:1});aiR();return}
if(AIS.uid!==CLOUD.u.id){aiReset();AIS.uid=CLOUD.u.id}
AIS.msgs.push({r:'u',t:text});AIS.busy=1;aiR();
try{const r=await aiInvoke({message:text,conversation_id:AIS.conv,context:aiCtx()}),j=r.j||{};
if(r.ok&&j.reply){AIS.conv=j.conversation_id||AIS.conv;AIS.msgs.push({r:'a',t:j.reply,src:j.sources||[]});AIS.list=null;AIS.off='';
if(AIS.left!=null)AIS.left=Math.max(0,AIS.left-1);if(j.saved===false)AIS.msgs.push({r:'a',t:'Відповідь не збереглась в історії.',err:1})}
else{if(j.conversation_id)AIS.conv=j.conversation_id;if(j.error==='ai_disabled'||j.error==='ai_not_configured'||j.error==='ai_not_ready')AIS.off=j.message||'';
AIS.msgs.push({r:'a',t:j.message||'Не вдалося отримати відповідь.',err:1})}}
catch(e){AIS.msgs.push({r:'a',t:'Не вдалося зв’язатися з AI. Решта Orbix працює як завжди.',err:1})}
AIS.busy=0;aiR()}
async function aiStatus(){if(!SB||!CLOUD.u||Date.now()-AIS.statAt<6e4)return;AIS.statAt=Date.now();
const r=await aiInvoke({action:'status'}).catch(()=>null);if(!r)return;
if(r.ok&&r.j&&r.j.ok){AIS.left=r.j.left_today;AIS.off=''}else if(r.j&&r.j.message)AIS.off=r.j.message;aiR()}
async function aiHistLoad(){if(!SB||!CLOUD.u){AIS.list=[];aiR();return}
const r=await SB.from('ai_conversations').select('id,title,updated_at').order('updated_at',{ascending:false}).limit(30);AIS.list=r.error?[]:r.data;aiR()}
async function aiOpenConv(id){if(!SB)return;const r=await SB.from('ai_messages').select('role,content,metadata,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(100);
if(r.error){toast('Не вдалося відкрити діалог');return}AIS.conv=id;AIS.hist=0;AIS.msgs=r.data.map(m=>({r:m.role==='user'?'u':'a',t:m.content,src:(m.metadata&&m.metadata.sources)||[]}));aiR()}
async function aiDelConv(id){if(!SB||!confirm('Видалити цей діалог?'))return;const r=await SB.from('ai_conversations').delete().eq('id',id);
if(r.error){toast('Не вдалося видалити діалог');return}if(AIS.conv===id)aiReset();AIS.hist=1;aiHistLoad()}

/* ---------- вікно діалогу ---------- */
function aiOpen(o){if(o)AIS.force=o;const p=$('#ai-panel');if(!p)return;if(AIS.uid&&CLOUD.u&&AIS.uid!==CLOUD.u.id)aiReset();
p.hidden=false;$('#ai-bg').hidden=false;AIS.open=1;aiMount(p.querySelector('.ai-c'));aiFabVis();aiR();aiStatus();
setTimeout(()=>{const t=p.querySelector('.ai-in2');t&&t.focus()},60)}
function aiClose(){const p=$('#ai-panel');if(!p)return;p.hidden=true;$('#ai-bg').hidden=true;AIS.open=0;aiFabVis();const f=$('#ai-fab');if(f&&!f.hidden)f.focus({preventScroll:true})}
function aiPage(){const h=$('#v-ai');if(!h)return;if(!h.dataset.m){h.dataset.m='1';
h.innerHTML=`<div class="card ai-pg"><div class="ai-c"></div></div><div class="card"><h2>Налаштування Orbix AI</h2><label class="ck"><input type="checkbox" id="ai-fabt"> Плаваюча іконка Orbix AI на всіх екранах</label><div class="row" style="margin-top:8px"><button class="b" id="ai-pos">Повернути іконку на місце</button><button class="b d" id="ai-erase">Видалити всі мої діалоги</button></div>
<p class="mu" style="margin-top:10px">Діалоги зберігаються 90 діб і доступні лише вам. Ключ AI-провайдера лежить на сервері. Помічник не отримує ключів бірж, пошти й не може торгувати. Безкоштовна квота спільна для всіх, тому є ліміт повідомлень на добу.</p></div>`;
$('#ai-fabt').onchange=e=>{sv(AIFAB,e.target.checked?1:0);aiFabVis()};
$('#ai-pos').onclick=()=>{sv(AIK,{s:'r',y:.72});aiPlace(1);toast('Іконку повернуто')};
$('#ai-erase').onclick=async()=>{if(!SB||!CLOUD.u)return toast('Увійдіть в акаунт.');if(!confirm('Видалити всі ваші діалоги з Orbix AI? Це не можна скасувати.'))return;
const r=await SB.rpc('ai_erase_my_data');if(r.error)return toast('Не вдалося видалити: '+r.error.message);aiReset();AIS.list=null;aiR();toast('Діалоги видалено')}}
$('#ai-fabt').checked=ld(AIFAB,1)!==0;aiMount(h.querySelector('.ai-c'));aiFabVis();aiR();aiStatus()}

/* ---------- плаваюча іконка ---------- */
const AIF={pid:null,drag:0,moved:0,sup:0,t:0,sx:0,sy:0,ox:0,oy:0,x:0,y:0,raf:0};
const aiPx=id=>{const e=$('#'+id);return e?e.offsetHeight:0};
/* межі, у яких може стояти іконка: поза шапкою, нижньою панеллю й вирізами екрана */
function aiBox(){const f=$('#ai-fab'),sz=f.offsetWidth||58,tab=$('#tab'),m=8,top=m+aiPx('ai-st')+(innerWidth<720?4:0),bot=m+aiPx('ai-sb')+(tab&&!tab.hidden?tab.offsetHeight:0);
return{sz,m,minX:m,maxX:Math.max(m,innerWidth-sz-m),minY:top,maxY:Math.max(top,innerHeight-sz-bot)}}
function aiSet(x,y){const f=$('#ai-fab');AIF.x=x;AIF.y=y;f.style.setProperty('--x',x+'px');f.style.setProperty('--y',y+'px')}
function aiPlace(snap){const f=$('#ai-fab');if(!f||AIF.drag)return;const p=ld(AIK,{s:'r',y:.72}),b=aiBox();
if(snap)f.classList.add('snap');aiSet(p.s==='l'?b.minX:b.maxX,b.minY+Math.min(1,Math.max(0,+p.y||0))*(b.maxY-b.minY));
if(snap)setTimeout(()=>f.classList.remove('snap'),320)}
function aiSave(){const b=aiBox(),mid=AIF.x+b.sz/2,s=mid<innerWidth/2?'l':'r';sv(AIK,{s,y:b.maxY>b.minY?(AIF.y-b.minY)/(b.maxY-b.minY):.5});aiPlace(1)}
function aiFabVis(){const f=$('#ai-fab');if(!f)return;const sp=$('#splash'),lk=$('#lk');
f.hidden=ld(AIFAB,1)===0||AIS.open||CUR==='ai'||!!(sp&&sp.isConnected)||!!(lk&&!lk.hidden);if(!f.hidden)aiPlace()}
function aiHint(){if(ld(AIHINT,0)||$('#ai-fab').hidden)return;sv(AIHINT,1);const t=$('#ai-tip');t.hidden=false;
const b=aiBox(),left=AIF.x<innerWidth/2;t.style.setProperty('--tx',(left?AIF.x+b.sz+8:Math.max(8,AIF.x-210))+'px');t.style.setProperty('--ty',Math.max(8,AIF.y+6)+'px');setTimeout(()=>t.hidden=true,7000)}
function aiFabInit(){const f=$('#ai-fab');if(!f)return;f.innerHTML=`<i class="ai-halo"></i><span class="ai-in">${aiOrb('aifab')}</span>`;
const end=()=>{clearTimeout(AIF.t);AIF.pid=null;AIF.drag=0;f.classList.remove('drag')};
f.addEventListener('contextmenu',e=>e.preventDefault());
f.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;AIF.pid=e.pointerId;AIF.drag=0;AIF.moved=0;AIF.sx=e.clientX;AIF.sy=e.clientY;
const r=f.getBoundingClientRect();AIF.ox=e.clientX-r.left;AIF.oy=e.clientY-r.top;try{f.setPointerCapture(e.pointerId)}catch(_){}clearTimeout(AIF.t);
AIF.t=setTimeout(()=>{AIF.drag=1;f.classList.add('drag');f.classList.remove('snap');navigator.vibrate&&navigator.vibrate(12)},380)});
f.addEventListener('pointermove',e=>{if(e.pointerId!==AIF.pid)return;
if(!AIF.drag){if(Math.hypot(e.clientX-AIF.sx,e.clientY-AIF.sy)>10){clearTimeout(AIF.t);AIF.moved=1}return}
e.preventDefault();const b=aiBox(),x=Math.min(b.maxX,Math.max(b.minX,e.clientX-AIF.ox)),y=Math.min(b.maxY,Math.max(b.minY,e.clientY-AIF.oy));
cancelAnimationFrame(AIF.raf);AIF.raf=requestAnimationFrame(()=>aiSet(x,y));AIF.x=x;AIF.y=y});
const up=e=>{if(e.pointerId!==AIF.pid)return;const was=AIF.drag;end();if(was){AIF.sup=1;setTimeout(()=>AIF.sup=0,350);aiSave()}else if(AIF.moved){AIF.sup=1;setTimeout(()=>AIF.sup=0,350)}};
f.addEventListener('pointerup',up);f.addEventListener('pointercancel',e=>{if(e.pointerId===AIF.pid){const was=AIF.drag;end();if(was)aiSave()}});
f.addEventListener('click',()=>{if(AIF.sup){AIF.sup=0;return}aiOpen()});
/* з клавіатури: Shift + стрілки переміщують іконку */
f.addEventListener('keydown',e=>{if(!e.shiftKey||!/^Arrow/.test(e.key))return;e.preventDefault();const b=aiBox(),st=48,p=ld(AIK,{s:'r',y:.72}),y=b.minY+(+p.y||0)*(b.maxY-b.minY);
if(e.key==='ArrowLeft')p.s='l';else if(e.key==='ArrowRight')p.s='r';else{const ny=Math.min(b.maxY,Math.max(b.minY,y+(e.key==='ArrowDown'?st:e.key==='ArrowUp'?-st:0)));p.y=b.maxY>b.minY?(ny-b.minY)/(b.maxY-b.minY):.5}sv(AIK,p);aiPlace(1)});
addEventListener('resize',()=>{aiPlace();aiVV()});addEventListener('orientationchange',()=>setTimeout(aiPlace,200));
aiFabVis();aiPlace()}
/* екранна клавіатура: висота вікна діалогу = видима область */
function aiVV(){const v=window.visualViewport;document.documentElement.style.setProperty('--aivh',(v?v.height:innerHeight)+'px')}

/* ---------- події ---------- */
document.addEventListener('click',e=>{const b=e.target.closest('[data-ai]');if(!b)return;const a=b.dataset.ai;
if(a==='q')aiSend(b.dataset.t);else if(a==='new'){aiReset();aiR()}else if(a==='close')aiClose();
else if(a==='hist'){AIS.hist=AIS.hist?0:1;if(AIS.hist){AIS.list=null;aiHistLoad()}aiR()}
else if(a==='open')aiOpenConv(b.dataset.id);else if(a==='del')aiDelConv(b.dataset.id)});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-ai="form"]');if(!f)return;e.preventDefault();const t=f.querySelector('textarea'),v=t.value;t.value='';t.style.height='';aiSend(v)});
document.addEventListener('keydown',e=>{const t=e.target;if(t&&t.classList&&t.classList.contains('ai-in2')&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();t.form.requestSubmit()}
if(e.key==='Escape'&&AIS.open)aiClose()});
document.addEventListener('input',e=>{const t=e.target;if(t&&t.classList&&t.classList.contains('ai-in2')){t.style.height='auto';t.style.height=Math.min(120,t.scrollHeight)+'px'}});
$('#ai-bg').onclick=aiClose;
/* вихід з акаунта: чужі діалоги на екрані не лишаються */
setInterval(()=>{if(AIS.uid&&(!CLOUD.u||CLOUD.u.id!==AIS.uid)){aiReset();AIS.uid=CLOUD.u?CLOUD.u.id:null;AIS.list=null;AIS.left=null;AIS.statAt=0;aiR()}aiFabVis();if(Date.now()-AIT0>2500&&!ld(AIHINT,0)&&!$('#ai-fab').hidden)aiHint()},2000);
/* зовнішній виклик: OrbixAI.open({type:'bot',id:'…'}) — для кнопок «Запитати AI» на картках */
window.OrbixAI={open:o=>aiOpen(o&&typeof o==='object'?o:null),close:aiClose};
const AIT0=Date.now();aiVV();aiFabInit();aiMotion();
