const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 const N=x=>x.replace(/\u00a0/g,' ');
 const mk=async(db,url)=>{const p=await b.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
  await p.addInitScript(`window.__DB=${JSON.stringify(db)}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(700);return p};
 const base={products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:80},b:{sku:'CH-2',name:'Anjo',category:'Chaveiros',priceWholesale:19.99,priceRetail:35},c:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100,priceRetail:150}},categories:{x:{name:'Chaveiros',position:0,active:true}}};
 // ---- ADMIN
 let p=await mk(base,'content-admin.html');await p.click('[data-tab=promotions]');
 const F=(n,v)=>p.fill(`#promotion-form [name=${n}]`,String(v));
 await F('name','Semana Cruz');await F('value','100');await p.selectOption('#promotion-form [name=type]','percent');await p.click('#promotion-form .save-btn');await p.waitForTimeout(200);
 t('100% rejeitado',(await p.locator('#promo-errors').textContent()).includes('menor que 100'));
 await F('value','10');await p.selectOption('#promotion-form [name=scope]','categories');await p.click('#promotion-form .save-btn');await p.waitForTimeout(200);
 t('categorias vazias rejeitado',(await p.locator('#promo-errors').textContent()).includes('categoria'));
 await p.check('#promo-cats input[value=Chaveiros]');
 t('prévia mostra exemplo',N((await p.locator('#promo-preview').textContent())).includes('R$ 45,00'));
 await p.fill('#promotion-form [name=startsAt]','2026-11-01T00:00');await p.fill('#promotion-form [name=endsAt]','2026-11-30T23:59');
 await p.click('#promotion-form .save-btn');await p.waitForTimeout(500);
 let promos=await p.evaluate(()=>Object.values(window.__DB.promotions||{}));
 t('promoção automática salva com escopo e ISO',promos.length===1&&promos[0].kind==='automatic'&&promos[0].categories[0]==='Chaveiros'&&promos[0].coupon===''&&promos[0].startsAt.endsWith('Z'));
 t('histórico registrado',(await p.evaluate(()=>Object.keys(window.__DB.adminLogs||{}).length))===1);
 // cupom + duplicidade
 await F('name','Cupom A');await p.selectOption('#promotion-form [name=kind]','coupon');await F('coupon','luary10');await F('value','10');await p.click('#promotion-form .save-btn');await p.waitForTimeout(400);
 await F('name','Cupom B');await p.selectOption('#promotion-form [name=kind]','coupon');await F('coupon','LUARY10');await F('value','5');await p.click('#promotion-form .save-btn');await p.waitForTimeout(300);
 promos=await p.evaluate(()=>Object.values(window.__DB.promotions));
 t('cupom em maiúsculas e duplicado barrado',promos.length===2&&promos.some(x=>x.coupon==='LUARY10')&&(await p.locator('#promo-errors').textContent()).includes('Já existe'));
 t('lista mostra Vigente/Agendada/Cupom',(await p.locator('#promotion-list').textContent()).includes('Cupom LUARY10'));
 await p.click('#promotion-list [data-edit]');await p.waitForTimeout(300);
 t('editar preenche o formulário',(await p.inputValue('#promotion-form [name=name]')).length>0);
 // editar a automática
 await p.evaluate(()=>document.querySelectorAll('#promotion-list [data-edit]').forEach(b=>{if(b.closest('.item').textContent.includes('Semana'))b.click()}));await p.waitForTimeout(300);
 t('edição restaura categorias e datas',await p.isChecked('#promo-cats input[value=Chaveiros]')&&(await p.inputValue('#promotion-form [name=startsAt]'))==='2026-11-01T00:00');
 // ---- Reajuste
 await p.click('[data-tab=prices]');await p.selectOption('#bp-scope','Chaveiros');await p.selectOption('#bp-field','priceWholesale');await p.fill('#bp-value','10');await p.selectOption('#bp-round','90');
 await p.waitForTimeout(200);
 t('prévia do reajuste: 50→55,90 e 19,99→21,90 e anel fora',N((await p.locator('#bp-preview').textContent())).includes('R$ 55,90')&&N((await p.locator('#bp-preview').textContent())).includes('R$ 21,90')&&!N((await p.locator('#bp-preview').textContent())).includes('AN-1'));
 await p.click('#bp-apply');await p.waitForTimeout(500);
 const prods=await p.evaluate(()=>window.__DB.products);
 t('reajuste gravado só no atacado e na categoria',prods.a.priceWholesale===55.9&&prods.b.priceWholesale===21.9&&prods.a.priceRetail===80&&prods.c.priceWholesale===100);
 t('histórico do reajuste',(await p.evaluate(()=>Object.values(window.__DB.adminLogs).some(l=>l.type==='bulk-price'&&l.count===2))));
 await p.fill('#bp-value','-100');await p.waitForTimeout(200);
 t('preço ≤0 é ignorado, não aplicado',N((await p.locator('#bp-preview').textContent())).includes('ignorado'));
 t('sem erros JS admin',p.errs.length===0);console.log(p.errs);await p.close();
 // ---- VITRINE
 const db2={...base,promotions:{p1:{name:'Semana Cruz',kind:'automatic',type:'percent',value:10,active:true,scope:'categories',categories:['Chaveiros'],audience:'all',endsAt:'2099-01-01T00:00:00Z'},p2:{name:'Cupom',kind:'coupon',coupon:'SECRETO',type:'percent',value:50,active:true},p3:{name:'Fora',kind:'automatic',type:'percent',value:90,active:true,scope:'all',endsAt:'2020-01-01T00:00:00Z'},p4:{name:'Off',kind:'automatic',type:'percent',value:90,active:false}}};
 p=await mk(db2,'index.html');
 const card=p.locator('.product-card',{hasText:'Cruz'});const txt=N(await card.textContent());
 t('card promocional: riscado, novo preço e -10%',txt.includes('R$ 50,00')&&txt.includes('R$ 45,00')&&txt.includes('-10%'));
 t('produto fora da categoria sem promo',!(await p.locator('.product-card',{hasText:'Anel'}).textContent()).includes('%'));
 t('promoção expirada e cupom não afetam',!(await p.content()).includes('SECRETO')&&!(await p.locator('.product-card',{hasText:'Anjo'}).textContent()).includes('R$ 8,'));
 await card.click();await p.waitForTimeout(200);
 t('modal mostra promoção',(await p.locator('#modal-promo').textContent()).includes('Semana Cruz'));
 t('whatsapp do produto usa preço promocional',N(decodeURIComponent(await p.locator('#modal-whatsapp-btn').getAttribute('href'))).includes('R$ 45,00'));
 await p.click('#add-to-cart-btn');await p.click('[data-close-product]');await p.click('#open-cart-btn');await p.waitForTimeout(200);
 t('carrinho: total e mensagem com promoção',(await p.locator('#cart-total-value').textContent()).includes('45,00')&&(await p.locator('#cart-checkout-btn').getAttribute('href'))==='carrinho.html');
 t('sem erros JS vitrine',p.errs.length===0);console.log(p.errs);await p.close();
 // ---- falha ao ler promoções
 p=await mk({...base,__x:1},'index.html');await p.close();
 await b.close();process.exit(ok?0:1)})();
