const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');
const N=x=>x.replace(/ /g,' ');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 const mk=async(db,url,pre='')=>{const ctx=await b.newContext();const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
  await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(700);return p};
 const base=()=>({products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,images:['https://x.com/1.webp']},b:{sku:'AN-1',name:'Anel',category:'Anéis',priceWholesale:100}},
  promotions:{p1:{name:'Semana',kind:'automatic',type:'percent',value:10,active:true,scope:'categories',categories:['Chaveiros']},cp_LUARY10:{name:'Dez',kind:'coupon',coupon:'LUARY10',type:'percent',value:10,active:true,scope:'all'}},
  siteSettings:{public:{whatsapp:'(19) 98820-7658',companyName:'Luary Shop',minOrder:100,pixDiscount:5}}});
 const cartInit=`localStorage.setItem('luary-atacado-cart-v1',JSON.stringify({a:2,b:1,zzz:3}));localStorage.setItem('luary-payment-v1','"Cartão"');`;
 // ===== CARRINHO
 let p=await mk(base(),'carrinho.html',cartInit);
 t('2 linhas, item removido do catálogo some',await p.locator('.cart-row').count()===2&&!(await p.evaluate(()=>localStorage.getItem('luary-atacado-cart-v1'))).includes('zzz'));
 t('promoção aplicada na linha',N(await p.locator('.cart-row').nth(1).textContent()).includes('R$ 45,00')&&(await p.locator('.item-promo').count())===1);
 t('total sem cupom = 190',N(await p.locator('.row.total').textContent()).includes('R$ 190,00'));
 await p.fill('#coupon-input','nao-existe');await p.click('#coupon-btn');await p.waitForTimeout(300);
 t('cupom inválido mostra erro',(await p.locator('#coupon-msg').textContent()).includes('não encontrado'));
 await p.fill('#coupon-input','luary10');await p.click('#coupon-btn');await p.waitForTimeout(400);
 t('cupom válido: -19 e total 171',N(await p.locator('#totals').textContent()).includes('R$ 19,00')&&N(await p.locator('.row.total').textContent()).includes('R$ 171,00'));
 t('cupom persiste no storage',(await p.evaluate(()=>localStorage.getItem('luary-cart-coupon-v1'))).includes('LUARY10'));
 await p.locator('.cart-row').nth(1).locator('[data-act=plus]').click();await p.waitForTimeout(300);
 t('+ aumenta qtd e total (3×45+100=235; cupom 23,50)',N(await p.locator('.row.total').textContent()).includes('R$ 211,50'));
 await p.locator('.cart-row').first().locator('[data-act=remove]').click();await p.waitForTimeout(300);
 await p.locator('.cart-row').first().locator('[data-act=minus]').click();await p.locator('.cart-row').first().locator('[data-act=minus]').click();await p.waitForTimeout(300);
 t('abaixo do mínimo (45 < 100): alerta e botão bloqueado',await p.locator('#go-checkout').isDisabled()&&(await p.locator('#min-alert').isVisible()));
 t('sem erros JS carrinho',p.errs.length===0);console.log(p.errs);await p.close();
 // ===== CHECKOUT
 const fill=async p=>{await p.fill('#name','Maria Souza');await p.fill('#whatsapp','(11) 98888-7777');await p.fill('#city','São Paulo - SP');await p.fill('#street','Rua A');await p.fill('#number','10');await p.fill('#district','Centro');await p.fill('#deliveryCity','São Paulo');await p.fill('#notes','Cuidado <b>x</b>')};
 p=await mk(base(),'checkout.html',cartInit+`localStorage.setItem('luary-cart-coupon-v1','"LUARY10"');`);
 t('resumo com cupom e pagamento herdado do carrinho (Cartão, sem desconto PIX)',!N(await p.locator('#totals').textContent()).includes('Desconto PIX')&&N(await p.locator('#totals').textContent()).includes('R$ 19,00'));
 await p.check('input[value="Cartão"]',{force:true});await p.waitForTimeout(150);
 t('trocar para cartão remove PIX',!N(await p.locator('#totals').textContent()).includes('Desconto PIX'));
 await p.check('input[value="PIX"]',{force:true});
 await p.click('#submit');await p.waitForTimeout(200);
 t('campos obrigatórios acusam erro e nada é salvo',(await p.locator('[data-err=name]').textContent()).length>0&&!(await p.evaluate(()=>window.__DB.orders)));
 await p.check('#later');await p.fill('#name','Maria Souza');await p.fill('#whatsapp','(11) 98888-7777');await p.fill('#city','SP');
 t('entrega a combinar dispensa endereço',(await p.evaluate(()=>document.querySelector('#street').disabled)));
 await p.uncheck('#later');await fill(p);
 // mudança de preço entre abrir e enviar
 await p.evaluate(()=>{window.__DB.products.a.priceWholesale=60});
 await p.click('#submit');await p.waitForTimeout(500);
 t('preço mudou: avisa e NÃO envia',(await p.locator('#submit-alert').textContent()).includes('atualizados')&&!(await p.evaluate(()=>window.__DB.orders)));
 await p.click('#submit');await p.waitForTimeout(500);
 const orders=await p.evaluate(()=>window.__DB.orders||{});const ids=Object.keys(orders);const o=orders[ids[0]];
 t('pedido gravado com ID = número',ids.length===1&&/^LUA-\d{6}-[A-Z2-9]{4}$/.test(ids[0])&&o.number===ids[0]);
 t('pedido: cliente, itens e totais corretos',o.customer.name==='Maria Souza'&&o.customer.whatsapp==='11988887777'&&o.items.length===2&&o.status==='Novo'&&o.totals.couponCode==='LUARY10'&&o.payment.method==='PIX');
 t('totais: 2×54 + 100 = 208 → cupom 20,80 → PIX 9,36 → 177,84',o.totals.subtotal===208&&o.totals.couponDiscount===20.8&&o.totals.pixDiscount===9.36&&o.totals.total===177.84);
 t('observação com HTML gravada como texto',o.notes==='Cuidado <b>x</b>');
 t('carrinho e cupom limpos após salvar',(await p.evaluate(()=>localStorage.getItem('luary-atacado-cart-v1')))===null&&(await p.evaluate(()=>localStorage.getItem('luary-cart-coupon-v1')))===null);
 const wa=await p.locator('#wa-link').getAttribute('href');
 t('link do WhatsApp da loja com mensagem',wa.startsWith('https://wa.me/5519988207658?text=')&&decodeURIComponent(wa).includes(ids[0])&&decodeURIComponent(wa).includes('CH-1'));
 t('tela de confirmação sem HTML injetado',(await p.locator('#done b').count())===0);
 t('sem erros JS checkout',p.errs.length===0);console.log(p.errs);await p.close();
 // falha ao gravar
 p=await mk(base(),'checkout.html',cartInit+`window.__SETFAIL=true;`);await fill(p);await p.click('#submit');await p.waitForTimeout(500);
 t('falha ao gravar: oferece WhatsApp com aviso e mantém carrinho',(await p.locator('#done').textContent()).includes('Não conseguimos registrar')&&decodeURIComponent(await p.locator('#wa-link').getAttribute('href')).includes('só por aqui')&&(await p.evaluate(()=>localStorage.getItem('luary-atacado-cart-v1')))!==null);
 await p.close();
 // sem WhatsApp configurado
 const nb=base();delete nb.siteSettings.public.whatsapp;p=await mk(nb,'checkout.html',cartInit);await fill(p);await p.click('#submit');await p.waitForTimeout(500);
 t('sem WhatsApp da loja: registra e não cria link quebrado',(await p.locator('#wa-link').count())===0&&Object.keys(await p.evaluate(()=>window.__DB.orders)).length===1);await p.close();
 // carrinho vazio
 p=await mk(base(),'checkout.html','');t('checkout vazio mostra aviso',await p.locator('#empty').isVisible());await p.close();
 // ===== PEDIDOS (admin)
 const ord=(n,name,st,extra={})=>({number:n,status:st,source:'site',createdAtIso:'2026-11-01T10:00:00Z',customer:{name,whatsapp:'11999990000',city:'SP'},delivery:{arrangeLater:true},payment:{method:'PIX'},notes:'',items:[{sku:'CH-1',name:'Cruz',qty:2,unitOriginal:50,unitPrice:45,subtotal:90,promoName:'Semana',image:'https://x.com/1.webp'},{sku:'AN-1',name:'Anel',qty:1,unitOriginal:100,unitPrice:100,subtotal:100,image:''}],totals:{pieces:3,subtotalOriginal:200,promoDiscount:10,subtotal:190,couponCode:'',couponDiscount:0,pixPercent:5,pixDiscount:9.5,extraDiscount:0,shipping:null,shippingMode:'tbd',total:180.5},...extra});
 p=await mk({orders:{'LUA-1':ord('LUA-1','Ana','Novo'),'LUA-2':ord('LUA-2','<img src=x onerror="window.__xss=1">','Aprovado')},products:base().products},'pedidos.html');
 t('lista 2 pedidos com contadores',await p.locator('#list article').count()===2&&(await p.locator('#filters').textContent()).includes('Novo 1'));
 t('XSS no nome do cliente não executa',!(await p.evaluate(()=>window.__xss))&&(await p.locator('#list img').count())===0);
 await p.click('[data-filter=Aprovado]');t('filtro por status',await p.locator('#list article').count()===1);await p.click('[data-filter=Todos]');
 await p.fill('#search','ana');t('busca por nome',await p.locator('#list article').count()===1);await p.fill('#search','ch-1');t('busca por SKU',await p.locator('#list article').count()===2);await p.fill('#search','');
 await p.evaluate(()=>{window.__DB.orders['LUA-3']={number:'LUA-3',status:'Novo',createdAtIso:'2026-11-02T10:00:00Z',customer:{name:'Nova Cliente',whatsapp:'1',city:'x'},items:[],totals:{total:10,pieces:1},payment:{method:'PIX'}};window.__L.forEach(f=>f())});await p.waitForTimeout(200);
 t('pedido novo em tempo real gera aviso',(await p.locator('#toast').textContent()).includes('LUA-3')&&await p.locator('#list article').count()===3);
 await p.locator('#list article',{hasText:'Ana'}).locator('select').selectOption('Entregue');await p.waitForTimeout(200);
 t('alterar status grava',(await p.evaluate(()=>window.__DB.orders['LUA-1'].status))==='Entregue');
 await p.locator('#list article',{hasText:'Ana'}).locator('[data-act=edit]').click();
 await p.locator('#m-items tr').first().locator('[data-k=qty]').fill('3');await p.fill('#f-extra','10');await p.fill('#f-ship','15');
 t('modal recalcula: 3×45+100=235 −PIX 11,75 −10 +15 = 228,25',N(await p.locator('#m-totals').textContent()).includes('R$ 228,25'));
 await p.click('#m-save');await p.waitForTimeout(300);
 const e1=await p.evaluate(()=>window.__DB.orders['LUA-1']);
 t('edição gravada (itens e totais)',e1.items[0].qty===3&&e1.totals.total===228.25&&e1.totals.shipping===15&&e1.totals.pieces===4);
 await p.click('#new-order');await p.fill('#f-name','Cliente Balcão');await p.fill('#f-whatsapp','(19) 97777-6666');
 await p.click('#add-toggle');await p.waitForTimeout(300);await p.fill('#catalog-search','anel');await p.waitForTimeout(150);await p.click('#catalog-results [data-pid]');
 await p.fill('#n-name','Peça especial');await p.fill('#n-price','20');await p.fill('#n-qty','2');await p.click('#n-add');
 await p.click('#m-save');await p.waitForTimeout(300);
 const av=await p.evaluate(()=>Object.values(window.__DB.orders).find(o=>o.customer.name==='Cliente Balcão'));
 t('pedido avulso criado (source painel, catálogo + manual)',av&&av.source==='painel'&&av.status==='Novo'&&av.items.length===2&&av.totals.total===140&&av.customer.whatsapp==='19977776666');
 await p.locator('#list article',{hasText:'Cliente Balcão'}).locator('[data-act=del]').click();await p.waitForTimeout(200);
 t('excluir pedido',!(await p.evaluate(()=>Object.values(window.__DB.orders).some(o=>o.customer.name==='Cliente Balcão'))));
 const [pop]=await Promise.all([p.waitForEvent('popup',{timeout:3000}).catch(()=>null),(async()=>{await p.locator('#list article',{hasText:'Ana'}).locator('[data-act=rom]').click();await p.selectOption('#rom-layout','grade');await p.selectOption('#rom-tipo','foto');await p.click('#rom-open')})()]);
 t('menu de romaneio abre URL certa',pop&&pop.url().includes('romaneio.html?id=LUA-1&layout=grade&tipo=foto'));
 t('sem erros JS pedidos',p.errs.length===0);console.log(p.errs);await p.close();
 // falha de leitura
 p=await mk({},'pedidos.html','window.__FAIL=true');t('erro de permissão exibido',await p.locator('#load-error').isVisible());await p.close();
 // ===== ROMANEIO
 const db3={orders:{'LUA-1':ord('LUA-1','Ana <script>window.__x=1</script>','Novo',{notes:'Obs <b>x</b>',totals:{...ord().totals,couponCode:'LUARY10',couponDiscount:19,pixPercent:5}})},siteSettings:{public:{companyName:'Luary Shop',whatsapp:'(19) 98820-7658'}}};
 for(const lay of['lista','grade'])for(const tipo of['conferencia','financeiro','foto']){
   p=await mk(db3,`romaneio.html?id=LUA-1&layout=${lay}&tipo=${tipo}`);
   const txt=N(await p.locator('#doc').textContent());
   t(`romaneio ${lay}/${tipo}: itens, SKU e sem erro`,!(await p.locator('#doc').evaluate(e=>e.classList.contains('hidden')))&&txt.includes('CH-1')&&txt.includes('AN-1')&&p.errs.length===0);
   if(tipo==='conferencia')t(`romaneio ${lay}/conferencia: sem valores`,!txt.includes('Resumo financeiro')&&!txt.includes('R$ 45,00')&&await p.locator('#s-fin').evaluate(e=>e.classList.contains('invisible')));
   else t(`romaneio ${lay}/${tipo}: resumo e total recalculado`,txt.includes('Resumo financeiro')&&txt.includes('Cupom (LUARY10)'));
   if(lay==='lista'&&tipo==='financeiro'){t('romaneio: HTML do cliente escapado',!(await p.evaluate(()=>window.__x))&&txt.includes('<script>')&&txt.includes('Obs <b>x</b>'))}
   await p.close()}
 p=await mk({orders:{}},'romaneio.html?id=NAO');t('romaneio de pedido inexistente avisa',(await p.locator('#loader').textContent()).includes('não encontrado'));await p.close();
 await b.close();process.exit(ok?0:1)})();
