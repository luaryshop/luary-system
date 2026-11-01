const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,vp,pre='')=>{const ctx=await b.newContext({viewport:vp});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(800);return p};
const DB=()=>({products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:90},b:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100,minQty:3}},
 marketplaceGrids:{m1:{title:'Luary Shop na Shopee',linkUrl:'https://shopee.com.br/luaryshop',badge:'LOJA OFICIAL',ctaLabel:'Visitar loja',position:0,active:true,description:'x'},m2:{title:'Luary Shop no Mercado Livre',linkUrl:'https://mercadolivre.com.br/',position:1,active:true},m3:{title:'Luary Shop na Amazon com nome muito muito longo',linkUrl:'https://amazon.com.br/',position:2,active:true}},
 siteSettings:{public:{whatsapp:'19988207658',companyName:'Luary Shop',defaultMinQty:6}},
 banners:{h:{title:'Hero',imageUrl:'https://x.com/hero.webp',placement:'hero',active:true,position:0}},
 orders:{'LUA-1':{number:'LUA-1',status:'Novo',createdAtIso:'2026-11-01T10:00:00Z',customer:{name:'Ana',whatsapp:'11999990000',city:'SP'},delivery:{arrangeLater:true},payment:{method:'PIX'},items:[{sku:'CH-1',name:'Cruz',qty:2,unitOriginal:50,unitPrice:45,subtotal:90}],totals:{pieces:2,subtotal:90,total:85.5,pixPercent:5,pixDiscount:4.5,shippingMode:'tbd'}}}});
const cart=`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:6,b:3}));`;
const vps={desktop:{width:1440,height:900},tablet:{width:820,height:1180},mobile:{width:390,height:844}};
const pages=['index.html','carrinho.html','checkout.html','pedidos.html','content-admin.html','admin.html','cdn.html','romaneio.html?id=LUA-1'];
for(const [vn,vp] of Object.entries(vps))for(const pg of pages){
 const p=await mk(DB(),pg,vp,cart);
 const o=await p.evaluate(()=>{const de=document.documentElement;const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>de.clientWidth+1&&!e.closest('[hidden],.hidden,.overlay,.main-nav,#banner-track,.thumbnails,.banner-track,table,.overflow-x-auto,.overflow-auto,pre')&&getComputedStyle(e).position!=='fixed'&&getComputedStyle(e).position!=='absolute'}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,30));return{sw:de.scrollWidth,cw:de.clientWidth,bad}});
 t(`${vn} ${pg}: sem rolagem horizontal (${o.sw}/${o.cw}) ${o.bad.join(',')}`,o.sw<=o.cw+1&&p.errs.length===0);
 if(pg==='index.html'&&vn!=='desktop'||pg==='index.html'&&vn==='desktop'){await p.locator('#varejo').scrollIntoViewIfNeeded();await p.screenshot({path:`/tmp/claude-0/-home-claude/d06457be-36cd-52f8-b367-d7f0e9494f3f/scratchpad/t/varejo-${vn}.png`})}
 await p.close()}
// funcionalidades novas
let p=await mk(DB(),'index.html',vps.desktop);
t('varejo: 3 cards compactos, sem texto/botões duplicados',await p.locator('#varejo .retail-card').count()===3&&await p.locator('#retail-buttons,#retail-text,#marketplace-note').count()===0);
const h=await p.locator('#varejo .retail-card').first().boundingBox();t('card compacto (altura '+Math.round(h.height)+'px)',h.height<110);
t('hero usa imagem do painel',(await p.evaluate(()=>document.querySelector('.hero').style.getPropertyValue('--hero-img'))).includes('x.com/hero.webp')&&(await p.locator('#home-banners').isHidden()));
await p.locator('.product-card',{hasText:'Cruz'}).first().click();await p.waitForTimeout(300);
t('mínimo padrão da empresa (6) no SKU sem mínimo',(await p.inputValue('#modal-quantity'))==='6');await p.close();
p=await mk(DB(),'index.html',vps.desktop);await p.locator('.product-card',{hasText:'Anel'}).first().click();await p.waitForTimeout(300);
t('mínimo próprio do produto (3) vence o padrão',(await p.inputValue('#modal-quantity'))==='3');await p.close();
p=await mk(DB(),'carrinho.html',vps.desktop,`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:1,b:1}));`);
t('carrinho aplica padrão 6 e próprio 3',(await p.locator('.cart-row',{hasText:'CH-1'}).locator('input').inputValue())==='6'&&(await p.locator('.cart-row',{hasText:'AN-1'}).locator('input').inputValue())==='3');await p.close();
// painel: banners
const d2=DB();d2.banners={};
p=await mk(d2,'content-admin.html',vps.desktop,"window.__HERO_BASE='https://luaryshop.github.io/luary-system/admin.html';");await p.click('[data-tab=banners]');
t('aviso de imagem não cadastrada visível',!(await p.locator('#banner-seed').evaluate(e=>e.classList.contains('hidden'))));
await p.click('#seed-hero');await p.waitForTimeout(500);
const bs=Object.values(await p.evaluate(()=>window.__DB.banners));
t('importa imagem do topo (placement hero, https)',bs.length===1&&bs[0].placement==='hero'&&bs[0].imageUrl.endsWith('/public/images/luary-hero.webp'));
t('aviso some e banner aparece na lista (editar/excluir)',(await p.locator('#banner-seed').evaluate(e=>e.classList.contains('hidden')))&&(await p.locator('#banner-list [data-edit]').count())===1&&(await p.locator('#banner-list [data-delete]').count())===1);
await p.click('[data-tab=empresa]').catch(()=>{});
t('campo mínimo padrão na Empresa',await p.locator('#company-form [name=defaultMinQty]').count()===1);
await p.fill('#company-form [name=defaultMinQty]','12');await p.locator('#company-form .save-btn').click();await p.waitForTimeout(400);
t('salva defaultMinQty',(await p.evaluate(()=>window.__DB.siteSettings.public.defaultMinQty))===12);
await p.fill('#company-form [name=minOrder]','');await p.locator('#company-form .save-btn').click();await p.waitForTimeout(300);
t('limpar campo numérico desliga a regra (0)',(await p.evaluate(()=>window.__DB.siteSettings.public.minOrder))===0);
t('painel sem erros JS',p.errs.length===0);await p.close();
await b.close();process.exit(ok?0:1)})();
