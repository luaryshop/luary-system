const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,pre='')=>{const p=await (await b.newContext()).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(800);return p};
const db=()=>({products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:90,minQty:6},b:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100,priceRetail:150}},siteSettings:{public:{whatsapp:'19988207658'}}});
// carrinho: qty salva abaixo do mínimo sobe para o mínimo
let p=await mk(db(),'carrinho.html',`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:2,b:1}));`);
const row=p.locator('.cart-row',{hasText:'CH-1'});
t('carrinho corrige 2 → 6 (mínimo do SKU)',(await row.locator('input').inputValue())==='6'&&JSON.parse(await p.evaluate(()=>localStorage.getItem('luary-atacado-cart-v1'))).a===6);
t('mostra aviso de mínimo e bloqueia "−"',(await row.textContent()).includes('mínimo deste item: 6')&&await row.locator('[data-act=minus]').isDisabled());
t('item sem mínimo continua livre',await p.locator('.cart-row',{hasText:'AN-1'}).locator('[data-act=minus]').isDisabled()===true&&(await p.locator('.cart-row',{hasText:'AN-1'}).locator('input').inputValue())==='1');
await row.locator('input').fill('3');await row.locator('input').dispatchEvent('change');await p.waitForTimeout(300);
t('digitar 3 volta para 6',(await p.locator('.cart-row',{hasText:'CH-1'}).locator('input').inputValue())==='6');
await p.locator('.cart-row',{hasText:'CH-1'}).locator('[data-act=plus]').click();await p.waitForTimeout(250);
t('+ vai a 7 e libera "−"',(await p.locator('.cart-row',{hasText:'CH-1'}).locator('input').inputValue())==='7'&&!(await p.locator('.cart-row',{hasText:'CH-1'}).locator('[data-act=minus]').isDisabled()));
await p.locator('.cart-row',{hasText:'CH-1'}).locator('[data-act=remove]').click();await p.waitForTimeout(250);
t('remover tira o item mesmo com mínimo',await p.locator('.cart-row',{hasText:'CH-1'}).count()===0);
t('sem erros JS',p.errs.length===0);await p.close();
// checkout grava pedido com a quantidade mínima
p=await mk(db(),'checkout.html',`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:1}));`);
await p.fill('#name','Ana');await p.fill('#whatsapp','11988887777');await p.fill('#city','SP');await p.check('#later');
await p.click('#submit');await p.waitForTimeout(500);if(await p.locator('#submit-alert').isVisible()){await p.click('#submit');await p.waitForTimeout(500)}
const o=Object.values(await p.evaluate(()=>window.__DB.orders||{}))[0];
t('pedido do checkout sai com 6 un. (mínimo)',o&&o.items[0].qty===6&&o.totals.pieces===6&&o.totals.subtotal===300);await p.close();
// loja
p=await mk(db(),'index.html');
await p.waitForSelector('[data-product-id], .product-card, article',{timeout:3000}).catch(()=>{});
const opened=await p.evaluate(()=>{const c=[...document.querySelectorAll('[data-open-product],[data-product],.product-card,article')].find(e=>e.textContent.includes('Cruz'));if(c){c.click();return true}return false});
await p.waitForTimeout(400);
if(opened){
 t('modal abre com 6 e dica de mínimo',(await p.inputValue('#modal-quantity'))==='6'&&(await p.locator('.quantity-hint').textContent()).includes('6 unidades'));
 await p.click('#modal-quantity-minus');t('"−" no modal não passa de 6',(await p.inputValue('#modal-quantity'))==='6');
 await p.fill('#modal-quantity','2');await p.dispatchEvent('#modal-quantity','change');t('digitar 2 vira 6',(await p.inputValue('#modal-quantity'))==='6');
 await p.click('#add-to-cart-btn');await p.waitForTimeout(200);
 t('adicionar coloca 6 no carrinho',JSON.parse(await p.evaluate(()=>localStorage.getItem('luary-atacado-cart-v1'))).a===6);
}else t('abrir produto na loja (seletor)',false);
t('loja sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// admin produtos grava minQty
p=await mk({...db(),products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:90,minQty:6}}},'admin.html');
t('admin tem campo de mínimo',await p.locator('#prod-min-qty').count()===1);await p.close();
await b.close();process.exit(ok?0:1)})();
