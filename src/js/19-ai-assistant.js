/* ---------- Orbix AI: помічник, що читає дані акаунта й пояснює (етап 1) ----------
   Розмова йде через серверну функцію ai-assistant: ключ AI-сервісу лишається на сервері, модель бачить
   лише торгові дані (без пошти, імен і ключів). AI нічого не змінює: ні ботів, ні лімітів, ні ордерів.
   Відповіді виводяться як текст (textContent), без HTML. Якщо функцію ще не викладено чи AI вимкнено —
   розділ показує це й решта Orbix працює як раніше. */
const AI={conv:null,msgs:[],list:null,busy:0,ctx:null,err:'',off:'',pop:0};
const AI_Q=[['Стан усіх ботів','Як зараз почуваються всі мої боти? Чи є проблеми?'],['Перевірка ризиків','Перевір мої ризики: ліміти, зайняту експозицію, денний збиток. Чи блокується щось?'],
['Найкращі й найгірші','Які мої боти мають найкращі й найгірші результати і чому?'],['Аналіз портфеля','Зроби короткий огляд мого акаунта: скільки ботів працює, загальний результат моделі й біржі.'],
['Останні бектести','Поясни результати моїх останніх бектестів: що добре, що слабко.'],['Пошук проблем','Чи є помилки біржі, розбіжності моделі з біржею або боти, які давно не оброблялись сервером?']];
const aiT=t=>{try{return new Date(t).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return''}};
async function aiErr(r){let d=r.data;if(r.error){try{d=await r.error.context.json()}catch(e){d=null}const s=r.error.context&&r.error.context.status;
if(s===404||(!d&&/Failed to send|FunctionsFetchError|404/.test(r.error.message||'')))return{off:'Orbix AI ще не підключено на сервері.'};
if(d&&d.code==='disabled')return{off:'Orbix AI вимкнено адміністратором. Боти й решта Orbix працюють як завжди.'};
return{err:(d&&d.error)||'Orbix AI тимчасово недоступний. Боти працюють як завжди.'}}return{d}}
async function aiList(){if(!SB||!CLOUD.u)return;const r=await SB.from('ai_conversations').select('id,title,updated_at,context_type').order('updated_at',{ascending:false}).limit(20);
if(r.error){AI.list=[];if(/ai_conversations|does not exist|schema cache/.test(r.error.message||''))AI.off='Orbix AI ще не підключено на сервері.';}else AI.list=r.data||[];aiR()}
async function aiOpenConv(id){if(!SB)return;AI.conv=id;AI.msgs=[];AI.err='';aiR();
const r=await SB.from('ai_messages').select('role,content,metadata,created_at').eq('conversation_id',id).order('id',{ascending:true}).limit(200);
if(r.error){AI.err='Не вдалося завантажити діалог.';}else AI.msgs=r.data||[];aiR()}
function aiNew(){AI.conv=null;AI.msgs=[];AI.err='';AI.ctx=null;aiR();const t=$('#aiin');t&&t.focus()}
async function aiDel(id){if(!SB||!confirm('Видалити цей діалог?'))return;const r=await SB.from('ai_conversations').delete().eq('id',id);
if(r.error)return toast('Не вдалося видалити діалог.');if(AI.conv===id)aiNew();aiList()}
async function aiSend(text){text=String(text||'').trim();if(!text||AI.busy)return;if(!SB||!CLOUD.u){AI.err='Увійдіть в акаунт, щоб користуватися Orbix AI.';return aiR()}
if(text.length>2000){AI.err='Питання задовге: до 2000 символів.';return aiR()}
const me=CLOUD.u.id;{const ti=$('#aiin');if(ti)ti.value=''}AI.busy=1;AI.err='';AI.msgs=[...AI.msgs,{role:'user',content:text,created_at:new Date().toISOString()}];aiR();
try{const r=await SB.functions.invoke('ai-assistant',{body:{message:text,conversationId:AI.conv,...(AI.ctx?{context:AI.ctx}:{})}});const e=await aiErr(r);
if(!CLOUD.u||CLOUD.u.id!==me)return;/* акаунт змінився, поки чекали відповідь */
if(e.off)AI.off=e.off;else if(e.err)AI.err=e.err;else{const d=e.d;AI.conv=d.conversationId;AI.ctx=null;AI.msgs=[...AI.msgs,{role:'assistant',content:d.text,metadata:{tools:d.tools,data_at:d.dataAt},created_at:new Date().toISOString()}];AI.left=d.dailyLimit-d.usedToday;aiList()}}
catch(er){if(!CLOUD.u||CLOUD.u.id!==me)return;AI.err='Немає зв\'язку з Orbix AI. Спробуйте ще раз.'}
AI.busy=0;aiR()}
/* вхід або вихід з акаунта: діалоги попереднього акаунта не показуються (ідея з гілки колеги) */
function aiInit(){Object.assign(AI,{conv:null,msgs:[],list:null,busy:0,ctx:null,err:'',off:'',left:null});if(CUR==='ai'||AI.pop){aiR();if(CLOUD.u)aiList()}}
/* відкрити помічника з контекстом (наприклад, з картки бота) */
function aiOpen(ctx,q){if(AI.pop)aiPop(0,1);AI.conv=null;AI.msgs=[];AI.err='';AI.ctx=ctx||null;go('ai');if(q)aiSend(q)}
/* ---------- Плаваюча кнопка Orbix AI (на всіх розділах, крім самого «Orbix AI») ----------
   Натиск — відкрити або закрити вікно помічника. Утримати (або одразу потягнути) — перетягнути кнопку;
   після відпускання вона «прилипає» до найближчого краю. Місце запам'ятовується в цьому браузері (zaifab).
   Клавіатура: Enter/Пробіл — відкрити, Alt+↑/↓ — пересунути, Esc — закрити вікно. */
const FAB={k:'zaifab',s:56,m:12,p:null,drag:0,moved:0,t:0,sx:0,sy:0,ox:0,oy:0};
const fabLoad=()=>{try{const v=JSON.parse(localStorage.getItem(FAB.k)||'null');return v&&(v.side==='l'||v.side==='r')&&isFinite(v.y)?v:null}catch(e){return null}};
const fabSave=p=>{try{localStorage.setItem(FAB.k,JSON.stringify(p))}catch(e){}};
/* межі: не під шапкою і не під нижньою панеллю вкладок */
function fabBounds(){const t=$('#tab'),tb=t&&!t.hidden?t.getBoundingClientRect().height:0;return{x0:FAB.m,x1:innerWidth-FAB.s-FAB.m,y0:72,y1:Math.max(80,innerHeight-FAB.s-FAB.m-tb)}}
function fabPut(x,y){const b=$('#aifab');if(b)b.style.transform=`translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;FAB.x=x;FAB.y=y}
function fabPlace(){const B=fabBounds(),p=FAB.p||{side:'r',y:B.y1-24};fabPut(p.side==='l'?B.x0:B.x1,Math.min(Math.max(p.y,B.y0),B.y1))}
function fabSnap(){const B=fabBounds(),side=FAB.x+FAB.s/2<innerWidth/2?'l':'r';FAB.p={side,y:Math.min(Math.max(FAB.y,B.y0),B.y1)};fabSave(FAB.p);
const b=$('#aifab');b.classList.add('snap');fabPlace();setTimeout(()=>b.classList.remove('snap'),260)}
function aiFabSync(){const b=$('#aifab');if(!b)return;const hide=CUR==='ai';b.hidden=hide;if(!hide)fabPlace();if(hide&&AI.pop)aiPop(0,1)}
/* відкрити/закрити вікно; контекст — розділ, з якого відкрито (якщо діалог новий) */
function aiPop(o,quiet){const w=$('#aipop'),b=$('#aifab');if(!w)return;AI.pop=o?1:0;w.hidden=!o;b.setAttribute('aria-expanded',o?'true':'false');b.classList.toggle('on',!!o);
if(o){if(!AI.conv&&!AI.msgs.length){const c={mon:'monitor',bs:'backtest',mk:'market',sx:'risk'}[CUR];AI.ctx=c?{type:c,id:null}:AI.ctx&&AI.ctx.type==='bot'?AI.ctx:null}
w.classList.toggle('l',FAB.p&&FAB.p.side==='l');aiR();if(CLOUD.u&&AI.list===null&&!AI.off)aiList();if(!quiet){const t=$('#aiin')||$('#aipx');t.focus()}}
else{$('#aipb').innerHTML='';if(CUR==='ai')aiR();if(!quiet)b.focus()}}
function fabInit(){const b=$('#aifab');if(!b)return;FAB.p=fabLoad();fabPlace();aiFabSync();
b.addEventListener('pointerdown',e=>{if(e.button)return;FAB.drag=0;FAB.moved=0;FAB.sx=e.clientX;FAB.sy=e.clientY;FAB.ox=FAB.x;FAB.oy=FAB.y;b.setPointerCapture(e.pointerId);
clearTimeout(FAB.t);FAB.t=setTimeout(()=>{FAB.drag=1;b.classList.add('drag');if(navigator.vibrate)try{navigator.vibrate(12)}catch(er){}},260)});
b.addEventListener('pointermove',e=>{if(!b.hasPointerCapture(e.pointerId))return;const dx=e.clientX-FAB.sx,dy=e.clientY-FAB.sy;
if(!FAB.drag&&Math.hypot(dx,dy)>8){FAB.drag=1;clearTimeout(FAB.t);b.classList.add('drag')}
if(FAB.drag){FAB.moved=1;const B=fabBounds();fabPut(Math.min(Math.max(FAB.ox+dx,B.x0),B.x1),Math.min(Math.max(FAB.oy+dy,B.y0),B.y1));e.preventDefault()}});
const up=e=>{clearTimeout(FAB.t);if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId);const was=FAB.drag;FAB.drag=0;b.classList.remove('drag');
if(was){fabSnap();if(AI.pop)$('#aipop').classList.toggle('l',FAB.p.side==='l');FAB.skip=1;setTimeout(()=>FAB.skip=0,50)}};
b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);
b.addEventListener('click',e=>{if(FAB.skip){e.preventDefault();return}aiPop(!AI.pop)});
b.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();FAB.y+=e.key==='ArrowUp'?-48:48;fabSnap()}});
b.addEventListener('contextmenu',e=>e.preventDefault());
$('#aipx').onclick=()=>aiPop(0);$('#aipo').onclick=()=>{aiPop(0,1);go('ai')};
addEventListener('keydown',e=>{if(e.key==='Escape'&&AI.pop)aiPop(0)});
addEventListener('resize',()=>fabPlace())}
fabInit();
function aiR(){const pop=!!AI.pop,el=$(pop?'#aipb':'#aix');if(!el)return;const oth=$(pop?'#aix':'#aipb');if(oth)oth.innerHTML='';
/* перемальовування не губить набраний текст і фокус (історія діалогів довантажується у фоні) */
const ti0=$('#aiin'),keep=ti0?ti0.value:'',hadF=!!(ti0&&document.activeElement===ti0);
if(!CLOUD.u){el.innerHTML='<div class="card"><h2>Orbix AI</h2><p class="mu">Увійдіть в акаунт, щоб запитати Orbix AI про своїх ботів, ризики й бектести.</p></div>';return}
if(AI.off){el.innerHTML=`<div class="card"><h2>Orbix AI <span class="chip">бета</span></h2><p class="mu" id="aioff"></p></div>`;$('#aioff').textContent=AI.off;return}
el.innerHTML=`<div class="aig${pop?' pop':''}"><div class="card aim"><div class="aih"><h2>Orbix AI <span class="chip">бета</span></h2><button class="b sm" id="ainw">Новий діалог</button></div>
<p class="mu aiint">Читає дані вашого акаунта й пояснює. Нічого не змінює: ордери, боти й ліміти — лише у вас. Відповіді AI можуть бути неточними — перевіряйте цифри в Orbix.</p>
<div class="aiq" role="group" aria-label="Швидкі запити">${AI_Q.map(([l],i)=>`<button class="b sm" data-aq="${i}"${AI.busy?' disabled':''}>${l}</button>`).join('')}</div>
<div class="ail" id="ail" role="log" aria-live="polite" aria-busy="${AI.busy?'true':'false'}"></div>
<p class="dn" id="aier" ${AI.err?'':'hidden'}></p>
<form class="aif" id="aif"><label class="srl" for="aiin">Ваше питання</label><textarea id="aiin" rows="2" maxlength="2000" placeholder="Напр.: Чому BNB не відкриває угод?"${AI.busy?' disabled':''}></textarea><button class="b p" id="aisd"${AI.busy?' disabled':''}>${AI.busy?'Думаю…':'Надіслати'}</button></form>
${AI.left!=null?`<p class="mu" style="margin-top:6px">Сьогодні залишилось запитів: ${Math.max(0,AI.left)}</p>`:''}</div>
<${pop?'details':'div'} class="card aic">${pop?'<summary>Історія діалогів</summary>':'<h3>Історія</h3>'}<div id="aicl"></div></${pop?'details':'div'}></div>`;
const log=$('#ail');
if(!AI.msgs.length){const p=document.createElement('p');p.className='mu';p.textContent=AI.ctx&&AI.ctx.type==='bot'?'Питання стосуватиметься вибраного бота.':'Поставте питання або виберіть швидкий запит.';log.append(p)}
for(const m of AI.msgs){const d=document.createElement('div');d.className='aimg '+(m.role==='user'?'u':'a');const t=document.createElement('div');t.className='aitx';t.textContent=m.content;d.append(t);
if(m.role==='assistant'){const md=m.metadata||{},s=document.createElement('p');s.className='mu aimt';s.textContent=(md.data_at?'Дані Orbix на '+aiT(md.data_at):'Без даних акаунта')+(md.tools&&md.tools.length?' · джерел: '+md.tools.length:'');d.append(s)}log.append(d)}
if(AI.busy){const d=document.createElement('div');d.className='aimg a aiw';d.textContent='Orbix AI читає дані…';log.append(d)}
log.scrollTop=log.scrollHeight;
if(AI.err)$('#aier').textContent=AI.err;
const cl=$('#aicl');if(AI.list===null)cl.innerHTML='<p class="mu">Завантаження…</p>';else if(!AI.list.length)cl.innerHTML='<p class="mu">Ще немає діалогів.</p>';
else for(const c of AI.list){const r=document.createElement('div');r.className='aici'+(c.id===AI.conv?' on':'');const o=document.createElement('button');o.className='b sm';o.dataset.ac=c.id;o.textContent=c.title;o.title=aiT(c.updated_at);
const x=document.createElement('button');x.className='b sm';x.dataset.ad=c.id;x.setAttribute('aria-label','Видалити діалог «'+c.title+'»');x.textContent='×';r.append(o,x);cl.append(r)}
$('#ainw').onclick=aiNew;$('#aif').onsubmit=e=>{e.preventDefault();const t=$('#aiin');aiSend(t.value)};
$('#aiin').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend(e.target.value)}};
$$('[data-aq]').forEach(b=>b.onclick=()=>aiSend(AI_Q[+b.dataset.aq][1]));
cl.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ac)aiOpenConv(b.dataset.ac);else if(b.dataset.ad)aiDel(b.dataset.ad)};
const ti=$('#aiin');if(ti&&keep&&!ti.disabled)ti.value=keep;if(ti&&hadF&&!ti.disabled)ti.focus()}
