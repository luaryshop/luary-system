const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');
const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.includes('gstatic.com/firebasejs'))return r.fulfill({contentType:'text/javascript',body:stubs[u.split('/').pop()]});if(u.includes('localhost'))return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB={
  siteSettings:{public:{whatsapp:'+55 (11) 98888-7777',instagram:'@minhaloja',logoUrl:'https://x.com/logo.png',faviconUrl:'https://x.com/f.png',aboutText:'Texto novo.'}},
  banners:{a:{imageUrl:'https://x.com/b2.webp',position:2,active:true,alt:'B2'},b:{imageUrl:'https://x.com/b1.webp',position:1,active:true,linkUrl:'https://x.com',alt:'B1'},c:{imageUrl:'javascript:1',active:true},d:{imageUrl:'https://x.com/off.webp',active:false}},
  categories:{a:{name:'Chaveiros',position:0,active:true},b:{name:'Anéis',position:1,active:false},c:{name:'Colares',position:2,active:true}},
  products:{p1:{name:'A',sku:'S1',category:'Colares',priceWholesale:10},p2:{name:'B',sku:'S2',category:'Chaveiros',priceWholesale:10},p3:{name:'C',sku:'S3',category:'Anéis',priceWholesale:10}}};`);
 await p.goto(BASE+'/index.html');await p.waitForTimeout(600);
 t('2 banners válidos, ordenados',await p.locator('.banner-slide').count()===2&&await p.locator('.banner-slide img').first().getAttribute('alt')==='B1');
 t('filtros: ordem do painel e inativa fora',(await p.locator('#category-filters button').allTextContents()).join('|')==='Todos|CHAVEIROS|COLARES');
 t('anel ainda em Todos',(await p.locator('.product-card').count())===3);
 t('whatsapp do painel',await(async()=>{await p.locator('.product-card').first().click();await p.waitForTimeout(300);return (await p.locator('#modal-whatsapp-btn').getAttribute('href')).includes('wa.me/5511988887777')})());
 t('instagram do painel',(await p.locator('.instagram-link').getAttribute('href'))==='https://www.instagram.com/minhaloja/'&&(await p.locator('[data-instagram-handle]').first().textContent())==='@minhaloja');
 t('logo aplicada',await p.locator('.brand-emblem img').count()===2);
 t('sobre atualizado',(await p.locator('#about-text').textContent())==='Texto novo.');
 t('sem erros JS',errs.length===0);console.log(errs);
 await p.close();
 const q=await b.newPage();await q.route('**/*',r=>{const u=r.request().url();if(u.includes('gstatic.com/firebasejs'))return r.fulfill({contentType:'text/javascript',body:stubs[u.split('/').pop()]});if(u.includes('localhost'))return r.continue();return r.abort()});
 await q.addInitScript('window.__FAIL=true');await q.goto(BASE+'/index.html');await q.waitForTimeout(500);
 t('falha total: banners ocultos, sem crash',await q.locator('#home-banners').isHidden());
 await b.close();process.exit(ok?0:1)})();
