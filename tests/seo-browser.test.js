const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,pre='')=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>{p.lastDialog=d.message();d.accept()});
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(900);return p};
const meta=(p,sel)=>p.evaluate(s=>document.head.querySelector(s)?.getAttribute(s.includes('canonical')?'href':'content'),sel);
const DB=(x={})=>({products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:90,images:['https://cdn.x/1.webp'],seoDescription:'Cruz folheada 18K'},b:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100,priceRetail:150}},
 categories:{c1:{name:'Anéis',position:0,active:true,seoTitle:'Anéis folheados | Luary',imageUrl:'https://cdn.x/aneis.webp'},c2:{name:'Chaveiros',position:1,active:true}},
 siteSettings:{public:{whatsapp:'19988207658',companyName:'Luary Shop',siteUrl:'https://luaryshop.github.io/luary-system/',seoTitle:'Luary — chaveiros 18K',seoDescription:'Atacado e varejo',ogImage:'https://cdn.x/og.jpg',...x}}});
// home
let p=await mk(DB(),'index.html');
t('home: título/descrição/OG do painel',(await p.title())==='Luary — chaveiros 18K'&&(await meta(p,'meta[property="og:title"]'))==='Luary — chaveiros 18K'&&(await meta(p,'meta[property="og:image"]'))==='https://cdn.x/og.jpg'&&(await meta(p,'meta[name="description"]'))==='Atacado e varejo');
t('home: canonical e JSON-LD ItemList',(await meta(p,'link[rel="canonical"]'))==='https://luaryshop.github.io/luary-system/'&&(await p.evaluate(()=>JSON.parse(document.getElementById('ld-dynamic').textContent)['@type']))==='ItemList');
// produto
await p.locator('.product-card',{hasText:'Cruz'}).first().click();await p.waitForTimeout(300);
t('abrir produto: hash, título, imagem OG e JSON-LD Product',(await p.evaluate(()=>location.hash))==='#produto=CH-1'&&(await p.title()).includes('Cruz (CH-1)')&&(await meta(p,'meta[property="og:image"]'))==='https://cdn.x/1.webp'&&(await meta(p,'meta[property="og:description"]'))==='Cruz folheada 18K'&&(await p.evaluate(()=>JSON.parse(document.getElementById('ld-dynamic').textContent).offers.price))==='90.00');
await p.evaluate(()=>{window.__shared=null;navigator.share=async d=>{window.__shared=d}});await p.click('#share-btn');await p.waitForTimeout(200);
t('compartilhar usa link com hash (sem páginas publicadas)',(await p.evaluate(()=>window.__shared.url))==='https://luaryshop.github.io/luary-system/#produto=CH-1');
await p.keyboard.press('Escape');await p.waitForTimeout(200);if(await p.locator('#product-modal').isVisible())await p.click('[data-close-product]');await p.waitForTimeout(200);
t('fechar produto limpa hash e volta metas da home',(await p.evaluate(()=>location.hash))===''&&(await p.title())==='Luary — chaveiros 18K');
// categoria
await p.locator('[data-category="ANÉIS"]').first().click();await p.waitForTimeout(200);
t('categoria: hash, título SEO e imagem',(await p.evaluate(()=>decodeURIComponent(location.hash)))==='#categoria=Anéis'&&(await p.title())==='Anéis folheados | Luary'&&(await meta(p,'meta[property="og:image"]'))==='https://cdn.x/aneis.webp');
await p.locator('[data-category="TODOS"]').first().click();await p.waitForTimeout(150);t('Todos limpa hash',(await p.evaluate(()=>location.hash))==='');
t('sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// deep links
p=await mk(DB(),'index.html#produto=ch-1');t('deep link abre o produto (SKU case-insensitive)',await p.locator('#product-modal').isVisible()&&(await p.locator('#modal-title').textContent())==='Cruz');await p.close();
p=await mk(DB(),'index.html#produto=NAO-EXISTE');t('deep link inexistente não quebra',!(await p.locator('#product-modal').isVisible())&&p.errs.length===0);await p.close();
p=await mk(DB(),'index.html#categoria=An%C3%A9is');t('deep link de categoria filtra',(await p.locator('.product-card').count())===1);await p.close();
// páginas de compartilhamento publicadas
p=await mk(DB({sharePagesPublished:true}),'index.html#produto=CH-1');await p.evaluate(()=>{navigator.share=async d=>{window.__shared=d}});await p.click('#share-btn');await p.waitForTimeout(200);
t('com páginas publicadas o link é p/ch-1.html',(await p.evaluate(()=>window.__shared.url))==='https://luaryshop.github.io/luary-system/p/ch-1.html');await p.close();
// sem settings: ainda tem meta decente
p=await mk({products:DB().products},'index.html');t('sem configuração: usa título/OG padrão',(await p.title()).includes('Luary Shop')&&(await meta(p,'meta[property="og:image"]')).includes('og-luary.jpg'));await p.close();
// painel
p=await mk(DB(),'content-admin.html','window.JSZip=class{constructor(){this.f={}}file(n,c){this.f[n]=c;window.__ZIP=this.f}generateAsync(){return Promise.resolve(new Blob(["x"]))}};');
await p.click('[data-tab=seo]');
t('aba SEO carrega valores salvos e prévias',(await p.inputValue('#seo-form [name=seoTitle]'))==='Luary — chaveiros 18K'&&(await p.locator('#seo-prev-google').textContent()).includes('Luary — chaveiros 18K')&&(await p.locator('#seo-prev-card img').getAttribute('src'))==='https://cdn.x/og.jpg');
await p.fill('#seo-form [name=seoTitle]','Novo título');t('prévia atualiza ao digitar + contador',(await p.locator('#seo-prev-google').textContent()).includes('Novo título')&&(await p.locator('#seo-title-count').textContent()).includes('/70'));
await p.fill('#seo-form [name=ogImage]','http://inseguro/x.jpg');await p.click('#seo-form .save-btn');await p.waitForTimeout(200);t('rejeita imagem http',(p.lastDialog||'').includes('https'));
await p.fill('#seo-form [name=ogImage]','https://cdn.x/og2.jpg');await p.fill('#seo-form [name=siteUrl]','https://minhaloja.com.br');await p.check('#seo-form [name=sharePagesPublished]');await p.click('#seo-form .save-btn');await p.waitForTimeout(400);
const s=await p.evaluate(()=>window.__DB.siteSettings.public);t('salva SEO (url normalizada, checkbox, mantém WhatsApp)',s.seoTitle==='Novo título'&&s.ogImage==='https://cdn.x/og2.jpg'&&s.siteUrl==='https://minhaloja.com.br/'&&s.sharePagesPublished===true&&s.whatsapp==='19988207658');
await p.click('#seo-pack');await p.waitForTimeout(500);const z=await p.evaluate(()=>window.__ZIP);
t('pacote: sitemap, robots e 2 páginas de produto',z&&Object.keys(z).sort().join()==='p/an-1.html,p/ch-1.html,robots.txt,sitemap.xml'&&z['sitemap.xml'].includes('https://minhaloja.com.br/p/ch-1.html')&&z['p/ch-1.html'].includes('og:image" content="https://cdn.x/1.webp"'));
await p.click('[data-tab=taxonomy]');t('categorias têm campos de SEO',(await p.locator('#category-form [name=seoTitle]').count())===1&&(await p.locator('#category-form [name=seoDescription]').count())===1);
t('painel sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// produto admin
p=await mk(DB(),'admin.html');t('admin de produtos tem SEO',(await p.locator('#prod-seo-title').count())===1&&(await p.locator('#prod-seo-desc').count())===1);await p.close();
// noindex
for(const f of['admin.html','content-admin.html','cdn.html','editor.html','pedidos.html','romaneio.html','carrinho.html','checkout.html']){p=await mk(DB(),f);t('noindex '+f,(await p.evaluate(()=>document.querySelector('meta[name=robots]')?.content||''))==='noindex, nofollow');await p.close()}
await b.close();process.exit(ok?0:1)})();
