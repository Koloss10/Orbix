/* ---------- Orbix AI: помічник, що читає дані акаунта й пояснює (етап 1) ----------
   Розмова йде через серверну функцію ai-assistant: ключ AI-сервісу лишається на сервері, модель бачить
   лише торгові дані (без пошти, імен і ключів). AI нічого не змінює: ні ботів, ні лімітів, ні ордерів.
   Відповіді виводяться як текст (textContent), без HTML. Якщо функцію ще не викладено чи AI вимкнено —
   розділ показує це й решта Orbix працює як раніше. */
const AI={conv:null,msgs:[],list:null,busy:0,ctx:null,err:'',off:''};
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
const me=CLOUD.u.id;AI.busy=1;AI.err='';AI.msgs=[...AI.msgs,{role:'user',content:text,created_at:new Date().toISOString()}];aiR();
try{const r=await SB.functions.invoke('ai-assistant',{body:{message:text,conversationId:AI.conv,...(AI.ctx?{context:AI.ctx}:{})}});const e=await aiErr(r);
if(!CLOUD.u||CLOUD.u.id!==me)return;/* акаунт змінився, поки чекали відповідь */
if(e.off)AI.off=e.off;else if(e.err)AI.err=e.err;else{const d=e.d;AI.conv=d.conversationId;AI.ctx=null;AI.msgs=[...AI.msgs,{role:'assistant',content:d.text,metadata:{tools:d.tools,data_at:d.dataAt},created_at:new Date().toISOString()}];AI.left=d.dailyLimit-d.usedToday;aiList()}}
catch(er){if(!CLOUD.u||CLOUD.u.id!==me)return;AI.err='Немає зв\'язку з Orbix AI. Спробуйте ще раз.'}
AI.busy=0;aiR()}
/* вхід або вихід з акаунта: діалоги попереднього акаунта не показуються (ідея з гілки колеги) */
function aiInit(){Object.assign(AI,{conv:null,msgs:[],list:null,busy:0,ctx:null,err:'',off:'',left:null});if(CUR==='ai'){aiR();if(CLOUD.u)aiList()}}
/* відкрити помічника з контекстом (наприклад, з картки бота) */
function aiOpen(ctx,q){AI.conv=null;AI.msgs=[];AI.err='';AI.ctx=ctx||null;go('ai');if(q)aiSend(q)}
function aiR(){const el=$('#aix');if(!el)return;
if(!CLOUD.u){el.innerHTML='<div class="card"><h2>Orbix AI</h2><p class="mu">Увійдіть в акаунт, щоб запитати Orbix AI про своїх ботів, ризики й бектести.</p></div>';return}
if(AI.off){el.innerHTML=`<div class="card"><h2>Orbix AI <span class="chip">бета</span></h2><p class="mu" id="aioff"></p></div>`;$('#aioff').textContent=AI.off;return}
el.innerHTML=`<div class="aig"><div class="card aim"><div class="aih"><h2>Orbix AI <span class="chip">бета</span></h2><button class="b sm" id="ainw">Новий діалог</button></div>
<p class="mu">Читає дані вашого акаунта й пояснює. Нічого не змінює: ордери, боти й ліміти — лише у вас. Відповіді AI можуть бути неточними — перевіряйте цифри в Orbix.</p>
<div class="aiq" role="group" aria-label="Швидкі запити">${AI_Q.map(([l],i)=>`<button class="b sm" data-aq="${i}"${AI.busy?' disabled':''}>${l}</button>`).join('')}</div>
<div class="ail" id="ail" role="log" aria-live="polite" aria-busy="${AI.busy?'true':'false'}"></div>
<p class="dn" id="aier" ${AI.err?'':'hidden'}></p>
<form class="aif" id="aif"><label class="srl" for="aiin">Ваше питання</label><textarea id="aiin" rows="2" maxlength="2000" placeholder="Напр.: Чому BNB не відкриває угод?"${AI.busy?' disabled':''}></textarea><button class="b p" id="aisd"${AI.busy?' disabled':''}>${AI.busy?'Думаю…':'Надіслати'}</button></form>
${AI.left!=null?`<p class="mu" style="margin-top:6px">Сьогодні залишилось запитів: ${Math.max(0,AI.left)}</p>`:''}</div>
<div class="card aic"><h3>Історія</h3><div id="aicl"></div></div></div>`;
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
cl.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ac)aiOpenConv(b.dataset.ac);else if(b.dataset.ad)aiDel(b.dataset.ad)}}
