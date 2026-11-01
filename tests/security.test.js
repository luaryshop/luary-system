// Segurança: injeção de HTML/JS em todos os campos vindos do Firestore + CSP + links externos.
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
const X='"><img src=x onerror="window.__xss=1"><svg onload="window.__xss=3"></svg><script>window.__xss=2</script>\'';
const J='javascript:window.__xss=4';
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,pre='')=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.csp=[];
 p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))p.csp.push(m.text().slice(0,160))});p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(900);return p};
const clean=async(p,label)=>{const r=await p.evaluate(()=>({xss:window.__xss||0,img:document.querySelectorAll('img[src="x"]').length,svg:document.querySelectorAll('svg[onload]').length,onerr:[...document.querySelectorAll('[onerror],[onload],[onclick]')].filter(e=>/__xss/.test(e.getAttribute('onerror')||e.getAttribute('onload')||e.getAttribute('onclick')||'')).length,js:[...document.querySelectorAll('a[href],iframe[src],form[action]')].filter(e=>/^\s*javascript:/i.test(e.getAttribute('href')||e.getAttribute('src')||e.getAttribute('action')||'')).length,sc:[...document.scripts].filter(s=>!/json/.test(s.type)&&/__xss/.test(s.textContent)).length}));
 t(label+': nada executou nem foi injetado',!r.xss&&!r.img&&!r.svg&&!r.onerr&&!r.js&&!r.sc);if(r.xss||r.img||r.svg||r.onerr||r.js||r.sc){console.log('   ',JSON.stringify(r));console.log('   ',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('[onerror],[onload],[onclick]')].filter(e=>/__xss/.test(e.outerHTML)).map(e=>e.outerHTML.slice(0,240)))))}};
const DB={
 products:{a:{sku:X,name:X,category:X,description:X,details:X,seoTitle:X,seoDescription:X,priceWholesale:50,priceRetail:90,images:[J,'https://cdn.x/'+X]},b:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100,images:['https://cdn.x/1.webp']}},
 categories:{c:{name:X,slug:X,active:true,position:0,imageUrl:J,seoTitle:X,seoDescription:X}},
 subcategories:{s:{name:X,slug:X,categoryId:'c',active:true}},
 banners:{b:{title:X,alt:X,imageUrl:J,linkUrl:J,active:true,position:0},h:{title:X,imageUrl:'https://x.com/a.jpg"); background:url(x',placement:'hero',active:true}},
 marketplaceGrids:{m:{title:X,slug:'x',linkUrl:J,badge:X,ctaLabel:X,description:X,imageUrl:J,active:true},n:{title:X,slug:'y',linkUrl:'https://ok.com/'+X,badge:X,ctaLabel:X,description:X,imageUrl:'https://ok.com/'+X,active:true}},
 promotions:{p:{name:X,kind:'automatic',type:'percent',value:10,active:true,scope:'all'},cp_X:{name:X,kind:'coupon',coupon:'XSS',type:'percent',value:10,active:true,scope:'all'}},
 siteSettings:{public:{companyName:X,slogan:X,whatsapp:'19988207658',instagram:X,logoUrl:J,faviconUrl:J,aboutText:X,seoTitle:X,seoDescription:X,ogImage:J,siteUrl:J,twitterHandle:X}},
 orders:{o:{number:X,status:'Novo',createdAtIso:'2026-11-01T10:00:00Z',customer:{name:X,whatsapp:X,city:X},delivery:{street:X,number:X,complement:X,district:X,city:X,state:X,recipient:X,arrangeLater:false},payment:{method:X},notes:X,items:[{sku:X,name:X,qty:1,unitOriginal:10,unitPrice:10,subtotal:10,image:J,promoName:X}],totals:{pieces:1,subtotal:10,total:10,couponCode:X,shippingMode:'tbd'}}}
};
const cart=`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:2,b:1}));localStorage.setItem('luary-cart-coupon-v1',JSON.stringify('XSS'));localStorage.setItem('luary-customer-v1',JSON.stringify({name:${JSON.stringify(X)},notes:${JSON.stringify(X)}}));`;
// ---- loja
let p=await mk(DB,'index.html',cart);
await p.locator('.product-card').first().click({timeout:3000}).catch(()=>{});await p.waitForTimeout(300);await clean(p,'index (catálogo/modal/banners/marketplaces)');
await p.click('#open-cart-btn').catch(()=>{});await p.waitForTimeout(300);await clean(p,'index (mini-carrinho)');
t('index: CSP não bloqueou nada',p.csp.length===0);if(p.csp.length)console.log(p.csp);t('index: sem erros JS',p.errs.length===0);console.log(p.errs.slice(0,3));await p.close();
p=await mk(DB,'index.html#produto='+encodeURIComponent(X));await clean(p,'index (deep link malicioso)');await p.close();
p=await mk(DB,'index.html#categoria='+encodeURIComponent(X));await clean(p,'index (categoria maliciosa)');await p.close();
// ---- carrinho e checkout
p=await mk(DB,'carrinho.html',cart);await clean(p,'carrinho');t('carrinho: CSP ok',p.csp.length===0);await p.close();
p=await mk(DB,'checkout.html',cart);await clean(p,'checkout');t('checkout: CSP ok',p.csp.length===0);
await p.fill('#name',X.slice(0,100)).catch(()=>{});await p.fill('#whatsapp','11988887777').catch(()=>{});await p.fill('#city','SP').catch(()=>{});await p.check('#later').catch(()=>{});await p.fill('#notes',X).catch(()=>{});
await p.click('#submit').catch(()=>{});await p.waitForTimeout(600);if(await p.locator('#submit-alert').isVisible().catch(()=>false)){await p.click('#submit');await p.waitForTimeout(600)}
await clean(p,'checkout (tela de confirmação)');
const wa=await p.locator('#wa-link').getAttribute('href').catch(()=>null);t('link do WhatsApp só vai para wa.me',!wa||new URL(wa).host==='wa.me');await p.close();
// ---- painel
p=await mk(DB,'pedidos.html');await clean(p,'pedidos (lista)');await p.locator('[data-act=edit]').first().click().catch(()=>{});await p.waitForTimeout(200);await clean(p,'pedidos (edição)');await p.close();
for(const lay of['lista','grade'])for(const tipo of['conferencia','financeiro','foto']){p=await mk(DB,`romaneio.html?id=o&layout=${lay}&tipo=${tipo}`);await clean(p,`romaneio ${lay}/${tipo}`);await p.close()}
p=await mk(DB,'content-admin.html');for(const tab of['company','seo','banners','marketplaces','taxonomy','promotions','prices','backup'])await p.click(`[data-tab=${tab}]`).catch(()=>{});await p.waitForTimeout(300);await clean(p,'content-admin (todas as abas)');
t('content-admin: sem erros JS',p.errs.length===0);console.log(p.errs.slice(0,3));await p.close();
p=await mk(DB,'admin.html');await clean(p,'admin de produtos');await p.close();
// ---- links externos e CSP estática
const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..');
for(const f of['index.html','carrinho.html','checkout.html']){const h=fs.readFileSync(path.join(root,f),'utf8');
 t(f+': tem Content-Security-Policy sem unsafe-eval e com object-src none',/Content-Security-Policy/.test(h)&&!/unsafe-eval/.test(h)&&/object-src 'none'/.test(h));
 t(f+': tem referrer policy',/name="referrer"/.test(h))}
for(const f of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){const h=fs.readFileSync(path.join(root,f),'utf8');const bad=(h.match(/<a\b[^>]*target="_blank"[^>]*>/g)||[]).filter(a=>!/rel="[^"]*noopener/.test(a));t(f+': links _blank com noopener',bad.length===0)}
await b.close();process.exit(ok?0:1)})();
