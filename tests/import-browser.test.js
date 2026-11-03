// Página de importação: arquivo real → prévia → gravação no Firestore (simulado).
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');const path=require('path');
const FIX=n=>path.join(__dirname,'fixtures',n);
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
const mk=async(db)=>{const p=await (await b.newContext({viewport:{width:1280,height:900},acceptDownloads:true})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();return r.abort()});
 await p.addInitScript(`window.__DB=${JSON.stringify(db)}`);await p.goto(BASE+'/importar.html');await p.waitForTimeout(700);return p};
const DB=()=>({categories:{c1:{name:'Chaveiros',active:true,position:1}},products:{old:{sku:'CH-0004',name:'Antigo',category:'Chaveiros',priceWholesale:40,priceRetail:70,images:['https://a/1.webp'],minQty:6}}});
let p=await mk(DB());
const vis=(p,sel)=>p.evaluate(x=>!document.querySelector(x).closest('.hidden'),sel);
t('página abre logada, sem etapas abertas',(await vis(p,'#app'))&&!(await vis(p,'#step-preview')));
await p.setInputFiles('#file',FIX('modelo-importacao.xlsx'));await p.waitForTimeout(1200);
t('reconhece o modelo e mostra 149 produtos',(await p.locator('#file-status').textContent()).includes('149 produto'));
const s=(await p.locator('#summary').textContent()).replace(/\s+/g,' ');
t('resumo: 148 novos, 1 a atualizar (CH-0004 já existe)',s.includes('148 novos')&&s.includes('1 a atualizar')&&s.includes('sem preço'));
t('mapa de categorias: CHAVEIRO → Chaveiros (existente) e PIERCING → Piercing',(await p.locator('#cat-map input').evaluateAll(l=>l.map(i=>i.dataset.fileCat+'>'+i.value))).join()==='CHAVEIRO>Chaveiros,PIERCING>Piercing');
t('subcategoria listada como ignorada',(await p.locator('#ignored').textContent()).includes('Subcategoria'));
await p.selectOption('#flt','update');
t('filtro mostra só a linha a atualizar com o campo que muda',(await p.locator('#rows tr').count())===1&&(await p.locator('#rows').textContent()).includes('Muda:'));
await p.selectOption('#flt','all');
await p.click('#go');await p.waitForTimeout(1500);
const db=await p.evaluate(()=>window.__DB);
const prods=Object.values(db.products);
t('149 produtos no sistema (148 novos + 1 existente)',prods.length===149);
t('novo: id pelo SKU, categoria, atributos, estoque e preço calculado',(()=>{const x=db.products['ch-0002'];return x&&x.sku==='CH-0002'&&x.category==='Chaveiros'&&x.attributes.Banho==='Ouro'&&x.stock===10&&x.priceWholesale===35.7&&x.active===true&&x.images.length===0})());
t('existente: preço, fotos e minQty preservados; nome atualizado',(()=>{const x=db.products.old;return x.priceWholesale===40&&x.priceRetail===70&&x.images.length===1&&x.minQty===6&&x.name.startsWith('CRUZ PORTUGUESA')&&x.attributes.Marca==='Luary'})());
t('categoria PIERCING criada uma vez como "Piercing"',Object.values(db.categories).filter(c=>c.name==='Piercing').length===1&&Object.values(db.categories).length===2);
t('histórico registrado',Object.values(db.adminLogs||{}).some(l=>l.type==='products'&&l.summary.includes('148 novos')));
t('mensagem de conclusão',(await p.locator('#done-text').textContent()).includes('148 produto(s) criado(s)'));
await p.click('#go').catch(()=>{});
t('repetir não duplica: nada mais a importar',await p.locator('#go').isDisabled());
t('sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();

// planilha universal
p=await mk({categories:{},products:{}});
await p.setInputFiles('#file',FIX('planilha-universal-marketplaces.xlsx'));await p.waitForTimeout(1000);
t('reconhece planilha universal',(await p.locator('#file-status').textContent()).includes('Universal'));
t('opção de grupo (Banho/Cor) visível',await vis(p,'#opt-group'));
await p.selectOption('#opt-group','Cor');await p.waitForTimeout(300);
await p.click('#go');await p.waitForTimeout(800);
const x=await p.evaluate(()=>window.__DB.products['sbento']);
t('universal: produto com variação Cor Dourado/Níquel, varejo 19,90, estoque 50',x&&JSON.stringify(x.variations)==='{"Cor":["Dourado","Níquel"]}'&&x.priceRetail===19.9&&x.stock===50&&x.category==='Chaveiros'&&x.description.includes('PROTEÇÃO'));
await p.close();

// CSV com erro + categoria padrão + modelo/backup
p=await mk({categories:{},products:{}});
await p.setInputFiles('#file',{name:'x.csv',mimeType:'text/csv',buffer:Buffer.from('SKU;Nome;Categoria;Preço Varejo\nA-1;Um;;10,5\nB 2;Dois;C;5\nA-3;Três;C;')});await p.waitForTimeout(800);
const s3=(await p.locator('#summary').textContent()).replace(/\s+/g,' ');
t('csv: 1 novo, 2 com erro (sem categoria; SKU inválido)',s3.includes('1 novos')&&s3.includes('2 com erro'));
await p.fill('#opt-defcat','Geral');await p.waitForTimeout(200);
t('categoria padrão resolve a linha vazia',(await p.locator('#summary').textContent()).includes('2 novos'));
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#dl-template')]);t('baixa o modelo CSV',dl.suggestedFilename().endsWith('.csv'));
const [bk]=await Promise.all([p.waitForEvent('download'),p.click('#dl-backup')]);t('baixa o backup JSON',bk.suggestedFilename().startsWith('backup-produtos'));
await p.setInputFiles('#file',{name:'x.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('nao e xlsx')});await p.waitForTimeout(600);
t('arquivo inválido: mensagem amigável',(await p.locator('#file-status').textContent()).includes('Não foi possível ler'));
await p.close();
await b.close();process.exit(ok?0:1)})();
