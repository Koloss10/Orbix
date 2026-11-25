function agg(cs,k){if(k===1)return cs;const o=[];for(let i=0;i+k<=cs.length;i+=k){let h=-1/0,l=1/0,v=0,bv=0,nb=0,nt=0,nn=0;for(let j=i;j<i+k;j++){if(cs[j].h>h)h=cs[j].h;if(cs[j].l<l)l=cs[j].l;v+=cs[j].v||0;if(cs[j].bv!=null){bv+=cs[j].bv;nb++}if(cs[j].nt!=null){nt+=cs[j].nt;nn++}}const x={t:cs[i].t,o:cs[i].o,h,l,c:cs[i+k-1].c,v};if(nb===k)x.bv=bv;if(nn===k)x.nt=nt;o.push(x)}return o}
/* свічки старших таймфреймів вирівняні за UTC, як на біржах (тиждень — з понеділка 00:00 UTC);
   неповна перша група й ще не закрита остання відкидаються */
const tfOff=tf=>tf===168?4*864e5:0,tfMs=tf=>tf*36e5;
function aggT(cs,tf){if(tf===1)return cs;const o=[],W=tfMs(tf),off=tfOff(tf);let cur=null,key=null;
for(const c of cs){const k=Math.floor((c.t-off)/W);if(k!==key){if(cur)o.push(cur);key=k;cur={t:k*W+off,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v||0,_s:c.t};if(c.bv!=null)cur.bv=c.bv;else cur._nb=1;if(c.nt!=null)cur.nt=c.nt;else cur._nn=1;if(c.ml!=null){cur.ml=c.ml;cur.mh=c.mh}}else{if(c.h>cur.h)cur.h=c.h;if(c.l<cur.l)cur.l=c.l;cur.c=c.c;cur.v+=c.v||0;if(c.bv!=null&&!cur._nb)cur.bv+=c.bv;else{cur._nb=1;delete cur.bv}if(c.nt!=null&&!cur._nn)cur.nt+=c.nt;else{cur._nn=1;delete cur.nt}if(c.ml!=null){cur.ml=cur.ml==null?c.ml:Math.min(cur.ml,c.ml);cur.mh=cur.mh==null?c.mh:Math.max(cur.mh,c.mh)}}}
if(cur)o.push(cur);if(o.length&&o[0]._s!==o[0].t)o.shift();const L=cs[cs.length-1];if(o.length&&L&&L.t+36e5<o[o.length-1].t+W)o.pop();return o}
/* чи щойно закрилась свічка таймфрейму tf (за останньою годинною свічкою) */
const closedTf=(cs,tf)=>{const L=cs[cs.length-1];return!!L&&(tf===1||(L.t+36e5-tfOff(tf))%tfMs(tf)===0)};
const aggC=(a,k)=>{if(k===1)return a;const c=a._g||(a._g={}),e=c[k];if(e&&e.n===a.length&&e.t===a[0].t)return e.A;const A=a.length&&a[0].t!=null?aggT(a,k):agg(a,k);c[k]={n:a.length,t:a.length?a[0].t:0,A};return A};
const memo=(A,k,f)=>{const c=A._m||(A._m={}),e=c[k];if(e&&e.n===A.length)return e.v;return(c[k]={n:A.length,v:f()}).v};
const cl=A=>A.map(x=>x.c);
function ema(c,n){const a=2/(n+1),o=[c[0]];for(let i=1;i<c.length;i++)o.push(o[i-1]+a*(c[i]-o[i-1]));return o}
function rsi(c,n){const o=[50],a=1/n;let u=0,d=0;for(let i=1;i<c.length;i++){const x=c[i]-c[i-1];u=u*(1-a)+Math.max(x,0)*a;d=d*(1-a)+Math.max(-x,0)*a;o.push(d?100-100/(1+u/d):100)}return o}
function bbands(c,n,k){const L=[],U=[];for(let i=0;i<c.length;i++){if(i<n-1){L.push(-1/0);U.push(1/0);continue}let m=0;for(let j=i-n+1;j<=i;j++)m+=c[j];m/=n;let v=0;for(let j=i-n+1;j<=i;j++)v+=(c[j]-m)**2;const sd=Math.sqrt(v/(n-1));L.push(m-k*sd);U.push(m+k*sd)}return[L,U]}
function cci(A,n){const t=A.map(x=>(x.h+x.l+x.c)/3),o=[];for(let i=0;i<t.length;i++){if(i<n-1){o.push(0);continue}let m=0;for(let j=i-n+1;j<=i;j++)m+=t[j];m/=n;let md=0;for(let j=i-n+1;j<=i;j++)md+=Math.abs(t[j]-m);md/=n;o.push(md?(t[i]-m)/(.015*md):0)}return o}
function stoch(A,n=14){return A.map((_,i)=>{if(i<n-1)return 50;let hh=-1/0,ll=1/0;for(let j=i-n+1;j<=i;j++){hh=Math.max(hh,A[j].h);ll=Math.min(ll,A[j].l)}return hh>ll?(A[i].c-ll)/(hh-ll)*100:50})}
function macdH(c){const f=ema(c,12),s=ema(c,26),m=f.map((x,i)=>x-s[i]),g=ema(m,9);return m.map((x,i)=>x-g[i])}
