const BASE='http://localhost:8775';const {chromium}=require('playwright');const stubs=require('./stubs.js');
const D='/tmp/claude-0/-home-claude/d06457be-36cd-52f8-b367-d7f0e9494f3f/scratchpad/shots/';
const prods={};for(let i=1;i<=4;i++)prods['p'+i]={sku:'CH-'+i,name:['Cruz Vazada 3D','Pingente Redondo Nossa Senhora Aparecida','Anel','São Bento'][i%4],category:'Chaveiros',priceWholesale:20+i,description:'Chaveiro folheado com acabamento brilhante.',variations:i%2?{Banho:['Ouro','Prata','Níquel']}:undefined};
(async()=>{const b=await chromium.launch();
for(const [n,vp] of [['d',{width:1366,height:900}],['m',{width:390,height:900}]]){const p=await (await b.newContext({viewport:vp})).newPage();
await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
await p.addInitScript(`window.__DB=${JSON.stringify({products:prods,siteSettings:{public:{}}})}`);await p.goto(BASE+'/index.html');await p.waitForTimeout(1200);
await p.locator('#colecao').scrollIntoViewIfNeeded();await p.waitForTimeout(1500);
const ys=await p.evaluate(()=>[...document.querySelectorAll('.product-category')].map(e=>Math.round(e.getBoundingClientRect().top-e.closest('.product-card').getBoundingClientRect().top)));console.log(n,ys.join());
await p.locator('#products-grid').screenshot({path:D+'grid3-'+n+'.png'})}
await b.close()})();
