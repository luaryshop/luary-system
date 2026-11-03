// Central de conteúdo → Variações (Banho, Inicial...) e loja (produto oculto, detalhes no modal).
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url)=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(900);return p};
let p=await mk({products:{a:{sku:'CH-1',name:'Cruz',category:'C',priceWholesale:5,variations:{Banho:['Ouro','Prata']}}}},'content-admin.html');
await p.click('[data-tab=variations]');
t('sem grupos: oferece criar Banho e Inicial',await p.evaluate(()=>!document.getElementById('variation-seed').classList.contains('hidden')));
await p.click('#variation-presets');await p.waitForTimeout(600);
let types=Object.values(await p.evaluate(()=>window.__DB.variationTypes||{}));
t('pré-cadastro cria Banho (5) e Inicial (A–Z)',types.length===2&&types.find(x=>x.name==='Banho').values.length===5&&types.find(x=>x.name==='Inicial').values.length===26);
t('lista mostra uso em produtos',(await p.locator('#variation-list').textContent()).includes('usado em 1 produto'));
// novo grupo com valores soltos + duplicados
await p.fill('#variation-form [name=name]','Tamanho');await p.fill('#variation-form [name=values]','P, M\nG\nm');await p.click('#variation-form .save-btn');await p.waitForTimeout(500);
types=Object.values(await p.evaluate(()=>window.__DB.variationTypes));
t('grupo novo: valores separados e sem repetição',JSON.stringify(types.find(x=>x.name==='Tamanho').values)==='["P","M","G","m"]'||JSON.stringify(types.find(x=>x.name==='Tamanho').values)==='["P","M","G"]');
// duplicado
await p.fill('#variation-form [name=name]','banho');await p.fill('#variation-form [name=values]','X');await p.click('#variation-form .save-btn');await p.waitForTimeout(300);
t('nome repetido não cria outro grupo',Object.values(await p.evaluate(()=>window.__DB.variationTypes)).filter(x=>x.name.toLowerCase()==='banho').length===1);
// preencher A-Z
await p.click('#variation-clear');await p.click('[data-fill=letters]');
t('botão A–Z preenche 26 letras e sugere o nome Inicial',(await p.locator('#variation-form [name=values]').inputValue()).split('\n').length===26);
// renomear propaga para os produtos
await p.click('#variation-clear');
await p.locator('#variation-list .item',{hasText:'Banho'}).locator('[data-vact=edit]').click();
await p.fill('#variation-form [name=name]','Acabamento');await p.click('#variation-form .save-btn');await p.waitForTimeout(700);
t('renomear grupo atualiza os produtos que o usam',JSON.stringify(await p.evaluate(()=>window.__DB.products.a.variations))==='{"Acabamento":["Ouro","Prata"]}');
// excluir
await p.locator('#variation-list .item',{hasText:'Tamanho'}).locator('[data-vact=delete]').click();await p.waitForTimeout(400);
t('excluir remove o grupo',!Object.values(await p.evaluate(()=>window.__DB.variationTypes)).some(x=>x.name==='Tamanho'));
t('histórico das variações',Object.values(await p.evaluate(()=>window.__DB.adminLogs||{})).some(l=>l.type==='variationTypes'));
t('painel sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();

// loja
p=await mk({products:{a:{sku:'CH-1',name:'Cruz Visível',category:'C',priceWholesale:50,description:'Linha 1\nLinha 2',highlights:['Resistente','<b>x</b>'],attributes:{Material:'Metal',Tema:'Fé'}},h:{sku:'CH-2',name:'Cruz Oculta',category:'C',priceWholesale:50,active:false}},siteSettings:{public:{whatsapp:'19988207658'}}},'index.html');
t('loja: produto oculto não aparece',(await p.locator('body').textContent()).includes('Cruz Visível')&&!(await p.locator('body').textContent()).includes('Cruz Oculta'));
await p.locator('article, .product-card').first().click();await p.waitForTimeout(400);
t('modal: diferenciais e atributos',(await p.locator('#modal-highlights li').count())===2&&(await p.locator('#modal-attrs dt').allTextContents()).join()==='Material,Tema'&&(await p.locator('#modal-highlights b').count())===0);
t('modal: descrição mantém quebra de linha',(await p.locator('#modal-description').evaluate(e=>getComputedStyle(e).whiteSpace))==='pre-line');
t('loja sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
// carrinho: produto oculto some
p=await mk({products:{h:{sku:'CH-2',name:'Cruz Oculta',category:'C',priceWholesale:50,active:false}},siteSettings:{public:{}}},'carrinho.html');
await p.evaluate(()=>localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({h:2})));await p.reload();await p.waitForTimeout(700);
t('carrinho: item de produto oculto é removido',(await p.locator('.cart-row').count())===0);await p.close();
await b.close();process.exit(ok?0:1)})();
