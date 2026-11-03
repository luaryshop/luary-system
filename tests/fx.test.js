// Efeitos modernos: banners animados, revelar ao rolar, 3D, voo ao carrinho, chaves de desligar e fallback.
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,{reduced=false,blockFx=false}={})=>{const ctx=await b.newContext({viewport:{width:1280,height:900},reducedMotion:reduced?'reduce':'no-preference'});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost'){if(blockFx&&u.pathname.endsWith('/fx.js'))return r.abort();return r.continue()}return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(1000);return p};
const IMG='https://x.com/';
const DB=(s={})=>({products:{a:{sku:'CH-1',name:'Cruz',category:'C',priceWholesale:50},b:{sku:'CH-2',name:'Anel',category:'C',priceWholesale:30}},
 banners:{b1:{title:'B1',imageUrl:IMG+'1.webp',placement:'carousel',position:0,active:true,caption:'Nova <b>coleção</b>',buttonLabel:'Ver agora',linkUrl:'https://luary.com/x',effect:'pan',transition:'wipe'},
  b2:{title:'B2',imageUrl:IMG+'2.webp',placement:'carousel',position:1,active:true,effect:'"><img src=x onerror=alert(1)>',transition:'nope'},
  b3:{title:'B3',imageUrl:IMG+'3.webp',placement:'carousel',position:2,active:true,transition:'slide'}},
 siteSettings:{public:{whatsapp:'19988207658',...s}}});
let p=await mk(DB(),'index.html');
t('efeitos ligados e barra de leitura criada',(await p.evaluate(()=>document.documentElement.dataset.fx))==='full'&&await p.locator('.fx-progress').count()===1);
t('banners viram palco animado com 3 slides e 1 ativo',await p.locator('#home-banners.fx-stage .banner-slide').count()===3&&await p.locator('.banner-slide.is-active').count()===1);
const at=await p.locator('.banner-slide').evaluateAll(l=>l.map(s=>s.dataset.effect+'/'+s.dataset.transition));
t('efeito e transição: usa o escolhido; inválidos caem no automático (lista fixa)',at[0]==='pan/wipe'&&['kenburns','zoom','pan'].includes(at[1].split('/')[0])&&['fade','wipe','slide','zoom','blur'].includes(at[1].split('/')[1])&&at[2].endsWith('/slide'));
t('legenda escapada e botão só com link',await p.locator('.bn-caption h3 b').count()===0&&(await p.locator('.bn-caption h3').first().textContent()).includes('<b>coleção</b>')&&await p.locator('.bn-cta').count()===1);
t('nenhum HTML injetado pelo painel',await p.locator('.banner-track img[onerror]').count()===0);
await p.locator('#banner-dots button').nth(2).click();await p.waitForTimeout(250);
t('bolinha leva ao slide e o anterior sai por baixo',await p.locator('.banner-slide').nth(2).evaluate(e=>e.classList.contains('is-active'))&&await p.locator('.banner-slide.is-leaving').count()===1&&await p.locator('#banner-dots button.active').count()===1);
await p.waitForTimeout(1300);t('classe de saída é limpa',await p.locator('.banner-slide.is-leaving').count()===0);
await p.locator('.bn-next').click({force:true});await p.waitForTimeout(200);t('seta próxima volta ao 1º (laço)',await p.locator('.banner-slide').nth(0).evaluate(e=>e.classList.contains('is-active')));
await p.locator('.bn-prev').click({force:true});await p.waitForTimeout(200);t('seta anterior',await p.locator('.banner-slide').nth(2).evaluate(e=>e.classList.contains('is-active')));
await p.locator('#banner-track').focus();await p.keyboard.press('ArrowRight');await p.waitForTimeout(200);t('teclado → avança',await p.locator('.banner-slide').nth(0).evaluate(e=>e.classList.contains('is-active')));
await p.mouse.move(5,5);await p.evaluate(()=>document.getElementById('home-banners').style.setProperty('--bn-dur','300ms'));
await p.locator('#banner-dots button').nth(1).click({force:true});await p.mouse.move(5,5);
const idx=()=>p.evaluate(()=>[...document.querySelectorAll('.banner-slide')].findIndex(x=>x.classList.contains('is-active')));
const i0=await idx();let moved=false;for(let k=0;k<10&&!moved;k++){await p.waitForTimeout(200);moved=(await idx())!==i0}
t('autoplay pela barra de progresso avança sozinho',moved);
await p.hover('#banner-track');t('mouse em cima pausa',await p.locator('#home-banners.is-paused').count()===1);
t('hero: título em palavras animadas, leitura de tela preservada',(await p.locator('.hero h1 .fx-word').count())>=4&&(await p.locator('.hero h1').getAttribute('aria-label')).includes('Grandes significados'));
await p.waitForTimeout(800);
t('produtos entram com revelar ao rolar',await p.locator('.product-card.fx-reveal.is-in').count()===2);
const card=p.locator('.product-card').first();await card.scrollIntoViewIfNeeded();const bb=await card.locator('.product-photo').boundingBox();
await p.mouse.move(bb.x+bb.width*.8,bb.y+bb.height*.2);await p.waitForTimeout(150);
t('mouse inclina a foto em 3D e move o brilho',(await card.locator('.product-photo').evaluate(e=>e.style.getPropertyValue('--ry')))!=='0deg'&&await card.locator('.fx-glare').count()===1&&(await card.locator('.product-photo').evaluate(e=>e.style.getPropertyValue('--mx'))).includes('%'));
await p.mouse.move(2,2);
// voo ao carrinho
await card.click();await p.waitForTimeout(400);await p.click('#add-to-cart-btn');await p.waitForTimeout(150);
t('foto voa até o carrinho',await p.locator('.fx-fly').count()===1);
await p.waitForTimeout(1300);
t('ao chegar, o selo pula e a foto some',await p.locator('.fx-fly').count()===0&&(await p.locator('#cart-count').getAttribute('class')||'').includes('fx-pop'));
t('loja sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// rolagem: cabeçalho
p=await mk(DB(),'index.html');await p.evaluate(()=>window.scrollTo(0,900));await p.waitForTimeout(500);
t('cabeçalho vira vidro e some ao descer',await p.locator('.site-header.is-scrolled.is-hidden').count()===1);
await p.evaluate(()=>window.scrollTo(0,500));await p.waitForTimeout(500);t('volta ao subir',await p.locator('.site-header.is-hidden').count()===0);
t('barra de leitura avança',parseFloat(await p.locator('.fx-progress').evaluate(e=>e.style.getPropertyValue('--p')))>0);await p.close();
// chaves
p=await mk(DB({fxIntensity:'off'}),'index.html');
t('Animações desligadas: data-fx=off, banners estáticos e produtos visíveis',(await p.evaluate(()=>document.documentElement.dataset.fx))==='off'&&await p.locator('#home-banners.is-static').count()===1&&(await p.locator('.product-card').first().evaluate(e=>getComputedStyle(e).opacity))==='1');
await p.close();
p=await mk(DB({fxIntensity:'soft'}),'index.html');t('Suaves: data-fx=soft',(await p.evaluate(()=>document.documentElement.dataset.fx))==='soft');await p.close();
p=await mk(DB(),'index.html',{reduced:true});t('"Reduzir movimento" do aparelho = sem efeitos',(await p.evaluate(()=>document.documentElement.dataset.fx))==='off'&&(await p.locator('.product-card').first().evaluate(e=>getComputedStyle(e).opacity))==='1');await p.close();
// fallback sem fx.js
p=await mk(DB(),'index.html',{blockFx:true});
t('sem fx.js a loja continua: banners no carrossel antigo e produtos visíveis',await p.locator('.banner-slide').count()===3&&await p.locator('#home-banners.fx-stage').count()===0&&await p.locator('.product-card').count()===2);
t('fallback sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// painel
p=await mk({banners:{},siteSettings:{public:{companyName:'Luary Shop',whatsapp:'19988207658'}}},'content-admin.html');
await p.click('[data-tab=banners]');
await p.fill('#banner-form [name=title]','Novo');await p.fill('#banner-form [name=imageUrl]','https://x.com/n.webp');await p.fill('#banner-form [name=caption]','Frase');await p.fill('#banner-form [name=buttonLabel]','Ver');await p.selectOption('#banner-form [name=effect]','zoom');await p.selectOption('#banner-form [name=transition]','blur');
await p.click('#banner-form .save-btn');await p.waitForTimeout(500);
const bn=Object.values(await p.evaluate(()=>window.__DB.banners))[0];
t('painel grava legenda, botão, movimento e transição',bn&&bn.caption==='Frase'&&bn.buttonLabel==='Ver'&&bn.effect==='zoom'&&bn.transition==='blur');
await p.selectOption('#company-form [name=fxIntensity]','soft');await p.locator('#company-form .save-btn').first().click();await p.waitForTimeout(500);
t('painel grava intensidade das animações',(await p.evaluate(()=>window.__DB.siteSettings.public.fxIntensity))==='soft');
t('painel sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
await b.close();process.exit(ok?0:1)})();
