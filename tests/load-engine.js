// Завантажує торговий рушій з модулів src/js і виконує його в ізольованому контексті Node.
// CI окремо перевіряє, що orbix.html зібрано саме з цих модулів (node tools/build.js --check).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
// Рушій — модулі src/js/01…05 (дані, індикатори, торгова логіка, walk-forward), без інтерфейсу.
function loadEngine() {
  const dir = path.join(__dirname, '..', 'src', 'js');
  const mods = fs.readdirSync(dir).filter(f => /^0\d-.*\.js$/.test(f)).sort();
  if (!mods.length) throw new Error('не знайдено модулів рушія в src/js');
  const code = mods.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('') + `
;({Bot,run,summ,ladder,lv,entry,normG,rnd,wfo,wfPlan,wfFold,wfSum,searchWin,lbT,SIG,agg,aggC,ema,rsi,bbands,cci,stoch,macdH,auto,evalC,stress,DEF,PAIRS,DT,MD,STR,
  atr,wma,hma,supertrend,psar,
  bt:typeof bt==='function'?bt:null,aggT:typeof aggT==='function'?aggT:null,closedTf:typeof closedTf==='function'?closedTf:null,
  replay:typeof replay==='function'?replay:null,whale:typeof whale==='function'?whale:null,swings:typeof swings==='function'?swings:null,liqZones:typeof liqZones==='function'?liqZones:null,liq:typeof liq==='function'?liq:null,act:typeof act==='function'?act:null,casc:typeof casc==='function'?casc:null,htf:typeof htf==='function'?htf:null,htfNeed:typeof htfNeed==='function'?htfNeed:null,qualityA,qMarket})`;
  const ctx = vm.createContext({ console, Math, Date, JSON, Array, Object, Number, String, Set, Map, Promise, Proxy,
    isFinite, Infinity, NaN, setTimeout, clearTimeout, AbortController, indexedDB: undefined, fetch: undefined });
  return vm.runInContext(code, ctx, { filename: 'orbix-engine.js' });
}
module.exports = { loadEngine };
