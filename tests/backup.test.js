// Backup, restauração, histórico de alterações e ações da tabela de produtos.
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');const fs=require('fs'),os=require('os'),path=require('path');
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db,url,pre='')=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>{p.dlg=d.message();d.accept()});
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)};${pre}`);await p.goto(BASE+'/'+url);await p.waitForTimeout(900);return p};
const DB=()=>({products:{a:{sku:'CH-1',name:'Cruz',category:'Chaveiros',priceWholesale:50,priceRetail:90}},categories:{c1:{name:'Anéis',position:0,active:true}},banners:{b1:{title:'B',imageUrl:'https://x.com/b.jpg',active:true,position:0}},marketplaceGrids:{},promotions:{},subcategories:{},
 siteSettings:{public:{companyName:'Luary Shop',whatsapp:'19988207658'}},orders:{'LUA-1':{number:'LUA-1',customer:{name:'Ana'},items:[],totals:{total:1}}},adminLogs:{}});
const tmp=name=>path.join(os.tmpdir(),'luary-'+name);
// backup sem pedidos
let p=await mk(DB(),'content-admin.html');await p.click('[data-tab=backup]');
await p.click('#bk-download');await p.waitForTimeout(500);
let bk=await p.evaluate(()=>window.__BACKUP);
t('backup tem formato, coleções e registros',bk&&bk.format==='luary-backup'&&bk.version===1&&bk.collections.products.length===1&&bk.collections.categories[0].id==='c1'&&bk.collections.siteSettings[0].data.whatsapp==='19988207658');
t('backup NÃO inclui pedidos por padrão',!('orders' in bk.collections));
await p.check('#bk-orders');await p.click('#bk-download');await p.waitForTimeout(500);bk=await p.evaluate(()=>window.__BACKUP);
t('marcando a opção, inclui pedidos',bk.collections.orders&&bk.collections.orders.length===1);
await p.click('#log-reload');await p.waitForTimeout(300);
t('histórico registra os backups com o usuário',(await p.locator('#log-list').textContent()).includes('Baixou backup'));
// restauração
const good={format:'luary-backup',version:1,createdAt:'2026-10-01T00:00:00Z',collections:{products:[{id:'p9',data:{sku:'NOVO-1',name:'Peça restaurada',priceWholesale:10}}],banners:[{id:'b1',data:{title:'Restaurado',imageUrl:'https://x.com/r.jpg',active:true}}],naoPermitida:[{id:'x',data:{a:1}}],adminLogs:[{id:'z',data:{summary:'forjado'}}]}};
fs.writeFileSync(tmp('bk-ok.json'),JSON.stringify(good));
await p.setInputFiles('#bk-file',tmp('bk-ok.json'));await p.waitForTimeout(400);
t('prévia lista só coleções permitidas',(await p.locator('#bk-preview').textContent()).includes('products 1')&&!(await p.locator('#bk-preview').textContent()).includes('naoPermitida')&&!(await p.locator('#bk-preview').textContent()).includes('adminLogs')&&!(await p.locator('#bk-restore').isDisabled()));
await p.click('#bk-restore');await p.waitForTimeout(700);
const db=await p.evaluate(()=>window.__DB);
t('restaurou/atualizou por ID e não apagou nada',db.products.p9.sku==='NOVO-1'&&db.products.a.sku==='CH-1'&&db.banners.b1.title==='Restaurado');
t('coleções não permitidas foram ignoradas',!db.naoPermitida&&!(db.adminLogs&&db.adminLogs.z));
await p.click('#log-reload');await p.waitForTimeout(300);t('histórico registra a restauração',(await p.locator('#log-list').textContent()).includes('Restaurou backup'));
// arquivos inválidos
for(const [n,c] of [['lixo','isto não é json'],['outro',JSON.stringify({format:'outro',version:1,collections:{}})],['id-ruim',JSON.stringify({format:'luary-backup',version:1,collections:{products:[{id:'../x',data:{}}]}})],['nao-array',JSON.stringify({format:'luary-backup',version:1,collections:{products:{a:1}}})]]){
 fs.writeFileSync(tmp('bk-'+n+'.json'),c);await p.setInputFiles('#bk-file',tmp('bk-'+n+'.json'));await p.waitForTimeout(300);
 t('rejeita arquivo inválido: '+n,(await p.locator('#bk-preview').textContent()).includes('inválido')&&await p.locator('#bk-restore').isDisabled())}
t('sem erros JS no painel',p.errs.length===0);console.log(p.errs);await p.close();
// histórico de alterações nas ações do painel
p=await mk(DB(),'content-admin.html');await p.click('[data-tab=banners]');await p.locator('#banner-list [data-delete]').first().click();await p.waitForTimeout(500);
await p.click('[data-tab=backup]');await p.waitForTimeout(400);t('excluir registro entra no histórico',(await p.locator('#log-list').textContent()).includes('Excluiu'));await p.close();
// tabela de produtos (delegação, sem handlers inline)
p=await mk({products:{a:{sku:"X'),alert(1),('",name:'Cruz',category:'C',priceWholesale:5,priceRetail:9}}},'admin.html');
t('admin: botões sem onclick inline',(await p.locator('#products-table-body [onclick]').count())===0&&(await p.locator('#products-table-body button[data-act]').count())===3);
await p.locator('#products-table-body [data-act=edit]').click();await p.waitForTimeout(200);t('editar preenche o formulário',(await p.inputValue('#prod-name'))==='Cruz');
await p.locator('#products-table-body [data-act=delete]').click();await p.waitForTimeout(500);t('excluir remove o produto',Object.keys(await p.evaluate(()=>window.__DB.products||{})).length===0);
t('admin sem erros JS',p.errs.length===0);await p.close();
await b.close();process.exit(ok?0:1)})();
