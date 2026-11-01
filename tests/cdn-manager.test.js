const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');const zlib=require('zlib');
// PNG 1x1 válido
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
require('fs').writeFileSync(''+require('os').tmpdir()+'/luary-test-x.png',png);
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 const ctx=await b.newContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
 // Git em memória
 let n=0;const blobs={};const trees={};const commits={};
 const files=new Map();for(let i=1;i<=10;i++)files.set(`products/CH-0002/${String(i).padStart(2,'0')}.webp`,'old'+i);files.set('home/.gitkeep','k');files.set('README.md','r');
 const mkTree=m=>{const id='t'+(++n);trees[id]=new Map(m);return id};
 let headCommit='c0';commits.c0={tree:mkTree(files)};const log=[];
 await p.route('**/*',async r=>{const u=new URL(r.request().url()),m=r.request().method();
  if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});
  if(u.hostname==='localhost')return r.continue();
  if(u.host==='api.github.com'){const path=u.pathname.replace('/repos/luaryshop/luary-cdn','');const body=r.request().postData()?JSON.parse(r.request().postData()):null;
   const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
   if(path===''){return J({permissions:{push:r.request().headers().authorization==='Bearer good'}})}
   if(path==='/git/ref/heads/main')return J({object:{sha:headCommit}});
   if(path.startsWith('/git/commits/')&&m==='GET')return J({tree:{sha:commits[path.split('/').pop()].tree}});
   if(path.startsWith('/git/trees/')&&m==='GET'){const tr=trees[path.split('/').pop()];return J({truncated:false,tree:[...tr].map(([p,sha])=>({path:p,type:'blob',sha,size:10}))})}
   if(path==='/git/blobs'){const id='b'+(++n);blobs[id]=body.content;return J({sha:id},201)}
   if(path==='/git/trees'&&m==='POST'){const nm=new Map(trees[body.base_tree]);for(const e of body.tree){if(e.sha===null)nm.delete(e.path);else nm.set(e.path,e.sha)}log.push(body.tree);return J({sha:mkTree(nm)},201)}
   if(path==='/git/commits'&&m==='POST'){const id='c'+(++n);commits[id]={tree:body.tree,parent:body.parents[0]};return J({sha:id},201)}
   if(path==='/git/refs/heads/main'&&m==='PATCH'){headCommit=body.sha;return J({})}
   return J({message:'nf'},404)}
  return r.abort()});
 await p.addInitScript(`window.__DB={products:{p1:{sku:'CH-0002',name:'Chaveiro Cruz',images:['old']},p2:{sku:'OUTRO',name:'X',images:[]}}}`);
 await p.goto(BASE+'/cdn.html?sku=CH-0002');await p.waitForTimeout(800);
 t('carrega 10 imagens do SKU (ignora .gitkeep)',await p.locator('#grid .tile').count()===10);
 t('vínculo com produto exibido',(await p.locator('#product-link').textContent()).includes('Chaveiro Cruz'));
 t('publicar desabilitado sem token',await p.locator('#publish').isDisabled());
 await p.fill('#token','bad');await p.click('#connect');await p.waitForTimeout(300);
 t('token sem escrita rejeitado',(await p.locator('#token-msg').textContent()).includes('permissão'));
 await p.fill('#token','good');await p.click('#connect');await p.waitForTimeout(300);
 t('token válido conecta e é limpo do campo',(await p.locator('#token-status').textContent()).includes('Conectado')&&(await p.locator('#token').inputValue())==='');
 // remover foto 03, mover 02 para depois, adicionar nova
 await p.locator('#grid .tile').nth(2).locator('[data-act=remove]').click();
 t('9 após remover',await p.locator('#grid .tile').count()===9);
 await p.locator('#grid .tile').nth(0).locator('[data-act=right]').click();
 await p.setInputFiles('#files',''+require('os').tmpdir()+'/luary-test-x.png');await p.waitForTimeout(800);
 t('nova imagem adicionada (10)',await p.locator('#grid .tile').count()===10);
 t('publicar habilitado',!(await p.locator('#publish').isDisabled()));
 await p.click('#publish');await p.waitForTimeout(1200);
 const final=[...trees[commits[headCommit].tree]].filter(([k])=>k.startsWith('products/CH-0002/')).sort();
 t('um único commit novo',headCommit!=='c0'&&commits[headCommit].parent==='c0');
 t('pasta final 01..10 sem lacunas',final.map(([k])=>k.split('/').pop()).join()==='01.webp,02.webp,03.webp,04.webp,05.webp,06.webp,07.webp,08.webp,09.webp,10.webp');
 t('01 agora é a antiga 02 (reordenada)',final[0][1]==='old2'&&final[1][1]==='old1');
 t('10 é a nova (blob)',final[9][1].startsWith('b'));
 t('.gitkeep e README intactos',trees[commits[headCommit].tree].has('home/.gitkeep')&&trees[commits[headCommit].tree].has('README.md'));
 const imgs=await p.evaluate(()=>window.__DB.products.p1.images);
 t('Firestore atualizado com URLs fixadas no commit',imgs.length===10&&imgs[0]===`https://cdn.jsdelivr.net/gh/luaryshop/luary-cdn@${headCommit}/products/CH-0002/01.webp`);
 t('outro produto intocado',(await p.evaluate(()=>window.__DB.products.p2.images)).length===0);
 t('mensagem de sucesso',(await p.locator('#result').textContent()).includes('1 produto'));
 // pasta não-produto: nome slug e substituição
 await p.selectOption('#folder','home');await p.click('#load');await p.waitForTimeout(500);
 t('home vazia (.gitkeep ignorado)',await p.locator('#grid .tile').count()===0);
 t('sem erros JS',errs.length===0);console.log(errs);
 await b.close();process.exit(ok?0:1)})();
