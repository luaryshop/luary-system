// Formas de pagamento configuráveis (Empresa e Identidade → checkout).
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,pre='')=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(900);return p};
const DB=(s={})=>({products:{a:{sku:'CH-1',name:'Cruz',category:'C',priceWholesale:50}},siteSettings:{public:{whatsapp:'19988207658',pixDiscount:5,...s}}});
const cart=`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:2}));`;
const tx=async(p,sel)=>(await p.locator(sel).textContent()).replace(/\s+/g,' ');
const labels=async p=>(await p.locator('#pay label b').allTextContents()).map(x=>x.split(' — ')[0]);
let p=await mk(DB(),'checkout.html',cart);
t('padrão: só PIX e Cartão (sem "A combinar"); PIX marcado',(await labels(p)).join('|')==='PIX|Cartão de crédito'&&(await p.locator('#pay input:checked').inputValue())==='PIX');
t('opções mostram o valor a pagar',(await tx(p,'#pay')).includes('R$ 95,00')&&(await tx(p,'#pay')).includes('R$ 100,00'));
await p.close();
p=await mk(DB({cardInstallments:3}),'checkout.html',cart);t('parcelas aparecem no cartão',(await p.locator('#pay label',{hasText:'Cartão'}).textContent()).includes('até 3x'));await p.close();
p=await mk(DB({cardInstallments:4}),'checkout.html',cart);await p.check('input[value="Cartão"]',{force:true});t('resumo mostra parcela do cartão',(await tx(p,'#totals')).includes('4x de R$ 25,00'));await p.close();
p=await mk(DB({cardNote:'Até 6x sem juros <b>x</b>'}),'checkout.html',cart);const txt=await p.locator('#pay label',{hasText:'Cartão'}).textContent();t('texto personalizado do cartão (escapado)',txt.includes('Até 6x sem juros <b>x</b>')&&(await p.locator('#pay b b').count())===0);await p.close();
p=await mk(DB({payPix:false}),'checkout.html',cart);t('PIX desligado: some e cartão fica marcado, sem desconto PIX',(await labels(p)).join('|')==='Cartão de crédito'&&(await p.locator('#pay input:checked').inputValue())==='Cartão'&&!(await p.locator('#totals').textContent()).includes('PIX'));await p.close();
p=await mk(DB({payCard:false}),'checkout.html',cart);t('só PIX habilitado',(await labels(p)).join('|')==='PIX');await p.close();
// carrinho: escolha no resumo segue para o checkout
p=await mk(DB({cardInstallments:2}),'carrinho.html',cart);
t('carrinho: opções PIX e Cartão com valores',(await p.locator('.pay-opt').count())===2&&(await tx(p,'#pay-options')).includes('R$ 95,00')&&(await tx(p,'#pay-options')).includes('2x de R$ 50,00'));
await p.check('input[name="cart-pay"][value="Cartão"]',{force:true});await p.waitForTimeout(300);
t('carrinho: cartão tira desconto PIX do resumo e mostra parcela',!(await p.locator('#totals').textContent()).includes('Desconto PIX')&&(await tx(p,'#totals')).includes('2x de R$ 50,00'));
await p.goto(BASE+'/checkout.html');await p.waitForTimeout(700);
t('checkout herda Cartão escolhido no carrinho',(await p.locator('#pay input:checked').inputValue())==='Cartão');await p.close();
// escolher cartão e enviar
p=await mk(DB(),'checkout.html',cart);await p.fill('#name','Ana Souza');await p.fill('#whatsapp','11988887777');await p.fill('#city','SP');await p.check('#later');await p.check('input[value="Cartão"]',{force:true});
t('cartão: sem desconto PIX no resumo',!(await p.locator('#totals').textContent()).includes('Desconto PIX'));
await p.click('#submit');await p.waitForTimeout(600);const o=Object.values(await p.evaluate(()=>window.__DB.orders||{}))[0];
t('pedido gravado com pagamento Cartão e total sem PIX',o&&o.payment.method==='Cartão'&&o.totals.pixDiscount===0&&o.totals.total===100);
t('mensagem do WhatsApp cita Cartão',decodeURIComponent(await p.locator('#wa-link').getAttribute('href')).includes('Cartão'));await p.close();
// painel
p=await mk({siteSettings:{public:{companyName:'Luary'}}},'content-admin.html');
t('painel: caixas de pagamento marcadas por padrão (campo ausente)',await p.locator('#company-form [name=payPix]').isChecked()&&await p.locator('#company-form [name=payCard]').isChecked());
await p.fill('#company-form [name=cardInstallments]','4');await p.fill('#company-form [name=cardNote]','Link pelo WhatsApp');await p.locator('#company-form .save-btn').click();await p.waitForTimeout(400);
const s=await p.evaluate(()=>window.__DB.siteSettings.public);t('painel salva formas de pagamento',s.payPix===true&&s.payCard===true&&s.cardInstallments===4&&s.cardNote==='Link pelo WhatsApp'&&s.companyName==='Luary');
t('painel sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
await b.close();process.exit(ok?0:1)})();
