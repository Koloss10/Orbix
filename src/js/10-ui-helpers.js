/* ===== інтерфейс ===== */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const f=(x,d=2)=>(x>0?'+':x<0?'−':'')+Math.abs(x).toLocaleString('uk-UA',{minimumFractionDigits:d,maximumFractionDigits:d});
const n2=(x,d=0)=>(+x).toLocaleString('uk-UA',{minimumFractionDigits:d,maximumFractionDigits:d});
const cls=x=>x>0?'up':x<0?'dn':'';
const px=v=>{v=+v||0;const a=Math.abs(v);return a>=1000?v.toFixed(0):a>=10?v.toFixed(2):a>=1?v.toFixed(3):a>=.01?v.toFixed(4):a?v.toPrecision(4):'0'};
const tm=ts=>ts?new Date(ts).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const hsrc=()=>MD.mode==='live'?'реальній історії '+MD.src:'демо-історії';
const now=()=>new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
const ld=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const pf=s=>s.n?(isFinite(s.pf)?s.pf.toFixed(2):'∞'):'—';
const TFS=[[1/12,'5 хв'],[.25,'15 хв'],[1,'1 год'],[4,'4 год'],[12,'12 год'],[24,'1 день'],[168,'1 тиждень']],PER=[[168,'1 тиждень'],[720,'1 місяць'],[4380,'6 місяців'],[8760,'1 рік'],[26208,'3 роки']];
const tfl=k=>(TFS.find(x=>x[0]===k)||[0,k+' год'])[1],perl=k=>(PER.find(x=>x[0]===k)||[0,k+' год'])[1];
const K=(l,v,k='')=>`<div class="card"><div class="mu">${l}</div><div class="num ${k}">${v}</div></div>`;
const KV=(a,b)=>`<div class="tr"><span>${a}</span><span class="mono">${b}</span></div>`;
const SW=(l,on,d,sub='')=>`<div class="sw"><div>${l}${sub?`<div class="mu">${sub}</div>`:''}</div><button class="b tg" aria-pressed="${!!on}" data-sw="${d}">${on?'Увімкнено':'Вимкнено'}</button></div>`;
const dir=(g,p)=>!g.d?(p&&p.d?'Нейтр. · '+(p.d<0?'Short':'Long'):'Нейтральний'):g.d<0?'Short':'Long';
const ttl=x=>`${x.g.pair}, ${dir(x.g)}, ${tfl(x.g.tf)}${x.g.lev>1?', '+x.g.lev+'×':''}`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cx=ld('zex',['Binance','Bybit','OKX']);

