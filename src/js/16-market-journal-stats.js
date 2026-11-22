/* ---------- ринок ---------- */
let MKP='BTC/USDT';
let MKM=ld('zmkm','F');
/* список пар: вкладки (усі / ростуть / падають / обрані), обрані пари — окремо від обраних топ-ботів */
let MKT=ld('zmkt','all'),MKA=0;const FAVPAIR=new Set(ld('zfavpair',[]));const MKN=15;
const mkKey=()=>MKM==='F'&&MD.fut&&MD.fset&&MD.fset.has(MKP)?MKP+FK:MKP;
function mkt(){const fOK=MD.mode==='live'&&MD.fut;if(!fOK)MKM='S';$$('#mkm [data-mm]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.mm===MKM);b.hidden=b.dataset.mm==='F'&&!fOK});
const mc=$('#mkc');mc._p=MKP;mc._k=mkKey();if(!mc._d)lwChart(mc,()=>({pair:mc._p,key:mc._k}),'market');else mc._d();
const fT=MKM==='F'&&fOK,fr=fT&&MD.ftk[sym(MKP)];
$('#mks').textContent=MD.mode!=='live'?'Біржі недоступні, показано демо-дані. Якщо файл відкрито в перегляді застосунку Claude, він блокує інтернет-запити: відкрийте файл у Chrome чи Safari, щоб бачити реальні ціни.'
:fT?`Безстрокові ф'ючерси ${MD.fsrc}, свічки від 1 хвилини.${fr&&isFinite(fr.fr)?' Поточний funding: '+(fr.fr*100).toFixed(4)+'%.':''}${!MD.fset.has(MKP)?' Для цієї пари ф\'ючерсу немає — показано спот.':''}`
:`Спот ${MD.src} у реальному часі, свічки від 1 хвилини.${MD.mode==='live'&&!MD.fut&&MD.ferr?' Ф\'ючерсні дані недоступні: '+MD.ferr:''}`;
mkL()}
/* список пар: усі пари (не лише перші 60); рядок пошуку над ринком фільтрує список на льоту (MKQ) */
let MKQ='';
function mkL(){const fT=MKM==='F'&&MD.mode==='live'&&MD.fut;
const row=(p,c,d,x)=>`<div class="pl" data-p="${p}"><span class="plh"><button class="fvp" data-fv="${p}" aria-pressed="${FAVPAIR.has(p)}" aria-label="${FAVPAIR.has(p)?'Прибрати з обраних':'Додати в обрані'}">${FAVPAIR.has(p)?'★':'☆'}</button><b>${p}</b></span><span class="mono">${px(c)} <span class="${cls(d)}">${f(d,2)}%</span>${x||''}</span></div>`,T=fT?MD.ftk:MD.tk;
const q=MKQ.trim().toUpperCase().replace(/[^A-Z0-9]/g,''),L=PK.filter(p=>!q||p.replace('/','').includes(q)).map(p=>{if(MD.mode==='live'){const t=T[sym(p)];return t?{p,c:t.c,d:t.o?(t.c/t.o-1)*100:0,x:fT&&isFinite(t.fr)&&t.fr?` <span class="mu">f ${(t.fr*100).toFixed(3)}%</span>`:''}:null}const a=D[p],l=a[a.length-1];return{p,c:l.c,d:(l.c/a[a.length-25].c-1)*100}}).filter(Boolean);
$$('#mkt [data-mt]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mt===MKT));
let V=q?L:MKT==='up'?L.filter(r=>r.d>0).sort((a,b)=>b.d-a.d).slice(0,MKN):MKT==='dn'?L.filter(r=>r.d<0).sort((a,b)=>a.d-b.d).slice(0,MKN):MKT==='fav'?L.filter(r=>FAVPAIR.has(r.p)):L;
const more=!q&&MKT==='all'&&!MKA&&V.length>MKN;if(more)V=V.slice(0,MKN);
$('#mkl').innerHTML=(V.length?V.map(r=>row(r.p,r.c,r.d,r.x)).join(''):`<p class="mu" style="margin:10px 0 0">${q?'Пару не знайдено.':MKT==='fav'?'Обраних пар ще немає: натисніть ☆ біля пари.':'Зараз таких пар немає.'}</p>`)+(more?`<button class="b sm" id="mkall" style="margin-top:10px">Показати всі ${L.length}</button>`:'')}
$('#mkm').onclick=e=>{const b=e.target.closest('[data-mm]');if(!b)return;MKM=b.dataset.mm;sv('zmkm',MKM);mkt()};
$('#mkt').onclick=e=>{const b=e.target.closest('[data-mt]');if(!b)return;MKT=b.dataset.mt;MKA=0;sv('zmkt',MKT);mkt()};
$('#mkl').onclick=e=>{if(e.target.closest('#mkall')){MKA=1;mkt();return}const fv=e.target.closest('[data-fv]');if(fv){const p=fv.dataset.fv;FAVPAIR.has(p)?FAVPAIR.delete(p):FAVPAIR.add(p);sv('zfavpair',[...FAVPAIR]);mkt();return}const t=e.target.closest('[data-p]');if(!t)return;MKP=t.dataset.p;$('#mq').value='';MKQ='';mkt();scrollTo(0,0)};
$('#mq').oninput=()=>{MKQ=$('#mq').value;mkL()};
$('#mq').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();let p=$('#mq').value.trim().toUpperCase();if(!p.includes('/'))p+='/USDT';const f=$('#mkl [data-p]');if(!PAIRS[p]&&f)p=f.dataset.p;if(PAIRS[p]){MKP=p;$('#mq').value='';MKQ='';$('#mq').blur();mkt()}};
$('#mkb').onclick=()=>{fill({...DEF,pair:MKP},cx[0]);go('bd')};$('#mka').onclick=()=>{$('#awp').value=MKP;go('aw')};

/* ---------- журнал угод ---------- */
let JF={bot:0,res:0};
function jr(){$('#jfl').innerHTML=sel('jf-b','Бот',[[0,'Усі боти'],...bots.map(x=>[x.id,ttl(x)])],JF.bot)+sel('jf-r','Результат',[[0,'Усі'],[1,'Прибуткові'],[-1,'Збиткові'],[2,'Stop-Loss і ліквідації']],JF.res);
$('#jfl').onchange=()=>{JF={bot:+$('#jf-b').value,res:+$('#jf-r').value};jr()};
const rows=[];bots.forEach(x=>{if(JF.bot&&x.id!==JF.bot)return;x.b.tr.forEach(t=>{if(JF.res===1&&t.pnl<=0)return;if(JF.res===-1&&t.pnl>0)return;if(JF.res===2&&!t.sl&&!t.liq)return;rows.push({x,t})})});rows.sort((a,b)=>(b.t.ts||0)-(a.t.ts||0));
$('#jt').innerHTML='<tr><th>Час</th><th>Бот</th><th>Ордерів</th><th>Вихід</th><th>Фандінг</th><th>PnL</th></tr>'+(rows.length?rows.slice(0,200).map(({x,t})=>`<tr><td class="mono">${tm(t.ts)}</td><td>${x.g.pair} ${dir(x.g)}</td><td>${t.n}</td><td>${t.mn?'вручну':t.xs?'сигнал':t.liq?'ліквідація':t.sl?'SL':'TP'}</td><td class="mono ${x.g.fut?cls(fdOf(t)):''}">${x.g.fut?f(fdOf(t)):'—'}</td><td class="mono ${cls(t.pnl)}">${f(t.pnl)}</td></tr>`).join(''):'<tr><td colspan="6" class="mu">Угод ще немає.</td></tr>')}

/* ---------- стрес-тест ---------- */
let SXG=null;
function sxr(){const o=$('#sxs');o.innerHTML=bots.map(x=>`<option value="${x.id}">${ttl(x)}</option>`).join('')+(SXG?'<option value="b">Налаштування з конструктора</option>':'')||'<option value="">Немає ботів</option>';if(SXG)o.value='b'}
$('#sxo').onclick=()=>{const v=$('#sxs').value,g=v==='b'?SXG:(bots.find(x=>x.id===+v)||{}).g;if(!g)return $('#sxt').innerHTML='<p class="dn">Створіть бота або відкрийте стрес-тест із конструктора.</p>';
const M=g.base*ladder(g),r=stress(g);$('#sxt').innerHTML=`<div class="sc" tabindex="0" role="region" aria-label="Таблиця, гортайте вбік"><table><tr><th>Сценарій</th><th>Ордерів</th><th>Мін. капітал</th><th>Кінець</th><th>Результат</th></tr>${r.map(x=>`<tr><td>${x.n}</td><td>${x.dca}</td><td class="mono ${cls(x.mn)}">${f(x.mn,0)}</td><td class="mono ${cls(x.end)}">${f(x.end,0)}</td><td>${x.liq?'ліквідація':x.sl?'SL':'—'}</td></tr>`).join('')}</table></div><p class="mu" style="margin-top:8px">Маржа сітки ${n2(M,0)} USDT. Бот відкриває позицію перед ударом ринку; стопи виконуються з прослизанням 2%. Найгірший збиток: ${f(Math.min(...r.map(x=>x.mn)),0)} USDT.</p>`};
$('#pfb').onclick=()=>{const o=$('#pft2');o.textContent='Рахую…';needAll([dk({...DEF,pair:'BTC/USDT'}),dk({...DEF,pair:'ETH/USDT'})]).then(()=>setTimeout(()=>{const t0=performance.now();for(let i=0;i<100;i++)bt({...DEF,pair:'BTC/USDT',rm:30+i%10},8760,1000,0);const a=performance.now()-t0,t1=performance.now();auto({pair:'ETH/USDT',ex:'Bybit',amt:1000,per:8760,tf:0,dr:0,fut:1,lev:0},1);const b=performance.now()-t1;
o.innerHTML=KV('100 бектестів, 1 рік',Math.round(a)+' мс')+KV('Автомайстер, 1 рік, усі таймфрейми',Math.round(b)+' мс')+KV('Пар у пам’яті',Object.keys(D).length+' з '+PK.length)+KV('Активних ботів',bots.filter(x=>x.on).length)+KV('Джерело даних',MD.mode==='live'?MD.src+(MD.fut?' + '+MD.fsrc:''):'демо')},30)).catch(e=>o.textContent='Помилка: '+e.message)};

/* ---------- статистика ---------- */
function sta(){const R=bots.map(x=>{const t=x.b.tr,w=t.filter(a=>a.pnl>0).length,gp=t.filter(a=>a.pnl>0).reduce((a,b)=>a+b.pnl,0),gl=-t.filter(a=>a.pnl<=0).reduce((a,b)=>a+b.pnl,0);return{x,n:t.length,wr:t.length?w/t.length*100:0,v:bv(x),pf:gl?gp/gl:gp?Infinity:0,dd:x.dd,fd:fdBot(x)}});
const T={n:R.reduce((a,r)=>a+r.n,0),w:R.reduce((a,r)=>a+r.wr*r.n/100,0),v:R.reduce((a,r)=>a+r.v,0),dca:bots.reduce((a,x)=>a+(x.b.pos?x.b.pos.n:0),0),dd:Math.min(0,...R.map(r=>r.dd)),fd:R.reduce((a,r)=>a+r.fd,0),fut:bots.some(x=>x.g.fut)};
$('#sk').innerHTML=K('Угод',T.n)+K('Win rate',(T.n?T.w/T.n*100:0).toFixed(0)+'%')+K('PnL з відкритими, USDT',f(T.v),cls(T.v))+K('Боти працюють',bots.filter(x=>x.on).length+' з '+bots.length)+K('Відкриті DCA-ордери',T.dca)+K('Макс. просадка',f(T.dd,0),cls(T.dd))+(T.fut?K('Фандінг, USDT',f(T.fd),cls(T.fd)):'');
$('#stt').innerHTML='<tr><th>Бот</th><th>Угод</th><th>Win</th><th>PnL</th><th>PF</th><th>Просадка</th><th>Фандінг</th></tr>'+R.map(r=>`<tr><td>${ttl(r.x)}<div class="mu">${r.x.ex}</div></td><td>${r.n}</td><td>${r.wr.toFixed(0)}%</td><td class="mono ${cls(r.v)}">${f(r.v)}</td><td>${r.n?(isFinite(r.pf)?r.pf.toFixed(2):'∞'):'—'}</td><td class="mono ${cls(r.dd)}">${f(r.dd)}</td><td class="mono ${r.x.g.fut?cls(r.fd):''}">${r.x.g.fut?f(r.fd):'—'}</td></tr>`).join('');
const m=Math.max(1,...R.map(r=>Math.abs(r.v)));$('#sb').innerHTML=R.map(r=>`<div class="tr" style="gap:10px;align-items:center"><span style="width:96px;flex:none">${r.x.g.pair.split('/')[0]} ${r.x.g.d<0?'S':'L'}</span><span style="flex:1;background:var(--pan2);border-radius:6px"><i style="display:block;height:14px;border-radius:6px;width:${Math.abs(r.v)/m*100}%;background:${r.v<0?'var(--dn)':'var(--up)'}"></i></span><span class="mono ${cls(r.v)}">${f(r.v)}</span></div>`).join('')||'<p class="mu">Ботів ще немає.</p>'}

