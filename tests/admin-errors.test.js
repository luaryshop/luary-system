// Mensagem de erro do painel quando as regras do Firestore negam a leitura.
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const p=await (await b.newContext()).newPage();let msg='';p.on('dialog',d=>{msg=d.message();d.accept()});
await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
await p.addInitScript('window.__FAIL=true;window.__DB={}');await p.goto(BASE+'/content-admin.html');await p.waitForTimeout(900);
t('erro mostra o e-mail logado e como corrigir as regras',/Você entrou como: \S+@\S+/.test(msg)&&msg.includes('isAdmin()'));
await b.close();process.exit(ok?0:1)})();
