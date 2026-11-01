const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');
const ROOT='../';
const stubs=require('./stubs.js');
async function page(b,file,init){
 const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();
  if(u.includes('gstatic.com/firebasejs')){const k=u.split('/').pop();return r.fulfill({contentType:'text/javascript',body:stubs[k]})}
  if(u.includes('localhost'))return r.continue();
  return r.abort()});
 await p.addInitScript(init||'');
 await p.goto(BASE+'/'+file);return {p,errs};
}
(async()=>{
 const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 // STOREFRONT
 let {p,errs}=await page(b,'index.html',`window.__DB={marketplaceGrids:{a:{title:'Luary Shop na Shopee',slug:'shopee',linkUrl:'https://shopee.com.br/luaryshop',badge:'LOJA OFICIAL',ctaLabel:'Visitar loja',position:0,active:true},b:{title:'Mercado Livre',slug:'ml',linkUrl:'javascript:alert(1)',position:1,active:true},c:{title:'Amazon',slug:'amz',linkUrl:'https://amazon.com.br/x',position:2,active:false},d:{title:'Elo7',slug:'elo7',linkUrl:'https://elo7.com.br/luary',position:3,active:true}}}`);
 await p.waitForTimeout(500);
 t('2 canais válidos (js: e inativo descartados)',await p.locator('#retail-cards .retail-card').count()===2);
 t('sem javascript: na página',!(await p.content()).includes('href="javascript'));
 t('nota EM BREVE oculta',await p.locator('#marketplace-note').count()===0);
 t('título quebrado em <em>',(await p.locator('#retail-cards .retail-info strong').first().textContent()).includes('na Shopee'));
 t('sem erros JS storefront',errs.length===0);
 await p.close();
 ({p,errs}=await page(b,'index.html',`window.__DB={marketplaceGrids:{a:{title:'X',slug:'x',linkUrl:'https://x.com',active:false}}}`));
 await p.waitForTimeout(400);
 t('nenhum ativo => seção oculta',await p.locator('#varejo').isHidden());
 t('link do menu oculto',await p.locator('#main-nav a[href="#varejo"]').isHidden());
 await p.close();
 ({p,errs}=await page(b,'index.html',`window.__FAIL=true`));
 await p.waitForTimeout(400);
 t('erro Firestore => fallback Shopee visível',await p.locator('#varejo').isVisible()&&(await p.locator('#varejo').textContent()).includes('Shopee'));
 await p.close();
 // ADMIN
 ({p,errs}=await page(b,'content-admin.html',`window.__DB={}`));
 await p.waitForTimeout(400);
 await p.click('[data-tab=marketplaces]');
 t('aviso de seed visível sem Shopee',!(await p.locator('#market-seed').getAttribute('class')).includes('hidden'));
 p.on('dialog',d=>d.accept());
 await p.click('#seed-shopee');await p.waitForTimeout(300);
 t('Shopee listada',(await p.locator('#market-list').textContent()).includes('Luary Shop na Shopee'));
 t('aviso some após cadastrar',(await p.locator('#market-seed').getAttribute('class')).includes('hidden'));
 await p.click('#market-list [data-edit]');await p.waitForTimeout(200);
 t('Editar preenche formulário',await p.inputValue('#market-form [name=title]')==='Luary Shop na Shopee');
 await p.fill('#market-form [name=ctaLabel]','Ir para a loja');await p.click('#market-form .save-btn');await p.waitForTimeout(300);
 t('edição persistida',await p.evaluate(()=>Object.values(window.__DB.marketplaceGrids)[0].ctaLabel)==='Ir para a loja');
 await p.fill('#market-form [name=title]','Teste');await p.fill('#market-form [name=slug]','teste');await p.fill('#market-form [name=linkUrl]','http://inseguro.com');await p.click('#market-form .save-btn');await p.waitForTimeout(200);
 t('http:// rejeitado',await p.evaluate(()=>Object.keys(window.__DB.marketplaceGrids).length)===1);
 await p.click('#market-list [data-delete]');await p.waitForTimeout(300);
 t('Excluir remove',await p.evaluate(()=>Object.keys(window.__DB.marketplaceGrids).length)===0);
 t('sem erros JS admin',errs.length===0);
 console.log(errs);
 await b.close();process.exit(ok?0:1);
})();
