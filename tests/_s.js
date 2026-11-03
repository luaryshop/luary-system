const BASE='http://localhost:8772';const {chromium}=require('playwright');const stubs=require('./stubs.js');
const D='/tmp/claude-0/-home-claude/d06457be-36cd-52f8-b367-d7f0e9494f3f/scratchpad/shots/';
(async()=>{const b=await chromium.launch();
for(const [n,vp] of [['d',{width:1280,height:520}],['m',{width:390,height:520}]]){const p=await (await b.newContext({viewport:vp})).newPage();
await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
await p.addInitScript(`window.__DB={products:{},siteSettings:{public:{}}}`);await p.goto(BASE+'/index.html');await p.waitForTimeout(1500);await p.screenshot({path:D+'logo-'+n+'.png'});
const h=await p.evaluate(()=>[document.querySelector('.brand-emblem').offsetWidth,document.querySelector('.site-header').offsetHeight,document.documentElement.scrollWidth<=innerWidth]);console.log(n,h)}
await b.close()})();
