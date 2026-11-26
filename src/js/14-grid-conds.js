/* ---------- конструктор: сітка вручну й умови докупівлі (як у Veles) ----------
   Відступи — від попереднього ордера, у %; обсяги — пропорції ордерів (наприклад, % суми бота: 11 16 24 49).
   Числа розділяються пробілом, «;» або комою з пробілом; дробові — з крапкою (або комою, якщо між числами є пробіл).
   Умови докупівлі: для кожного ордера 2…N — список умов «індикатор · таймфрейм · < або > · значення»; усі мають виконатися. */
function gridNums(t){t=String(t||'').trim();if(!t)return[];const P=/[;\s]/.test(t)?t.split(/[;\s]+/).map(x=>x.replace(/,$/,'').replace(',','.')):t.split(',');
return P.filter(x=>x!=='').map(Number)}
function gnTxt(a){return(a||[]).map(x=>String(+(+x).toFixed(4)).replace('.',',')).join('  ')}
function gridHtml(){return'<label class="fw">Відступи вручну, % від попереднього ордера (порожньо — за кроком і множником)<input id="fgs" type="text" inputmode="decimal" placeholder="напр. 2  3  5"></label>'+
'<label class="fw">Обсяги ордерів вручну, пропорції з першим ордером (порожньо — мартингейл)<input id="fgv" type="text" inputmode="decimal" placeholder="напр. 11  16  24  49"></label>'+
'<div class="fw ocb"><b>Умови докупівлі</b><span class="mu"> — ордер з умовами виконується за закриттям свічки, коли ціна дійшла до рівня і всі умови виконані. Умови задаються для Long; для Short — дзеркально.</span><div id="foc"></div></div>'}
function ocRow(k,c){const OCTF=[[0,'ТФ бота'],[1/12,'5 хв'],[.25,'15 хв'],[1,'1 год'],[4,'4 год'],[12,'12 год'],[24,'1 день']];return`<div class="ocr" data-k="${k}"><select data-o="i">${Object.entries(OCI).map(([a,v])=>`<option value="${a}"${a===c.i?' selected':''}>${v[0]}</option>`).join('')}</select>`+
`<select data-o="tf">${OCTF.map(([a,b])=>`<option value="${a}"${a==(c.tf||0)?' selected':''}>${b}</option>`).join('')}</select>`+
`<select data-o="op"><option value="<"${c.op==='<'?' selected':''}>менше</option><option value=">"${c.op==='>'?' selected':''}>більше</option></select>`+
`<input data-o="v" type="number" inputmode="decimal" step="any" value="${isFinite(c.v)?c.v:''}"><button type="button" class="ghost ocx" title="Прибрати умову">×</button></div>`}
/* умови з форми: oc[k] — масив умов ордера k+1 (k ≥ 1), oc[0] порожній */
function ocRead(){const o=[];$$('#foc .ocr').forEach(r=>{const k=+r.dataset.k,v=x=>r.querySelector(`[data-o="${x}"]`).value;(o[k]=o[k]||[]).push({i:v('i'),tf:+v('tf'),op:v('op'),v:v('v')===''?NaN:+v('v')})});
for(let k=0;k<o.length;k++)if(!o[k])o[k]=[];return o.some(x=>x.length)?o:[]}
function ocDraw(oc){const n=Math.max(1,Math.round(+$('#fo').value||1)),e=$('#foc');if(!e)return;let h='';
for(let k=1;k<n;k++)h+=`<div class="ocg"><div class="ocn">Ордер ${k+1}</div>${(oc[k]||[]).map(c=>ocRow(k,c)).join('')}<button type="button" class="ghost oca" data-k="${k}">+ умова</button></div>`;
const extra=oc.slice(n).some(c=>c&&c.length);e.innerHTML=(n>1?h:'<span class="mu">Лише один ордер — докупівель немає.</span>')+(extra?'<div class="mu">Умови для ордерів понад кількість ордерів буде прибрано.</div>':'');e.dataset.n=n}
function gridFill(g){$('#fgs').value=gnTxt((g.gs||[]).map(x=>x*100));$('#fgv').value=gnTxt(g.gv);ocDraw(Array.isArray(g.oc)?g.oc:[])}
$('#foc').addEventListener('click',e=>{const a=e.target.closest('.oca'),x=e.target.closest('.ocx');if(!a&&!x)return;e.preventDefault();const oc=ocRead();
if(a){const k=+a.dataset.k;(oc[k]=oc[k]||[]).push({i:'rsi',tf:0,op:'<',v:30})}else{const r=x.closest('.ocr'),k=+r.dataset.k,j=[...r.parentNode.querySelectorAll('.ocr')].indexOf(r);oc[k].splice(j,1)}
ocDraw(oc.slice(0,Math.max(1,Math.round(+$('#fo').value||1))));pv()});
$('#fo').addEventListener('input',()=>{const n=Math.max(1,Math.round(+$('#fo').value||1));if(+$('#foc').dataset.n!==n)ocDraw(ocRead().slice(0,n))});
ocDraw([]);
