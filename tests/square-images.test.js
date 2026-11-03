// Fotos 1:1: conversão no upload (ajustar/cortar/original), padronização das fotos já publicadas e exibição sem cortes.
const BASE=process.env.BASE||'http://localhost:8765';
const {chromium}=require('playwright');const stubs=require('./stubs.js');const zlib=require('zlib');
function png(w,h,rgb){const crc=(b)=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return(x^0xffffffff)>>>0};
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 const row=Buffer.concat([Buffer.from([0]),Buffer.from(Array(w).fill(rgb).flat())]);const raw=Buffer.concat(Array(h).fill(row));
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}
const WIDE=png(300,100,[255,0,0]);const TALL=png(100,300,[0,0,255]);
const tmp=require('os').tmpdir();require('fs').writeFileSync(tmp+'/luary-wide.png',WIDE);require('fs').writeFileSync(tmp+'/luary-tall.png',TALL);
(async()=>{const b=await chromium.launch();let ok=true;const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false};
 const mkpage=async(setup)=>{const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());await setup(p);return p};
 // ===== A. biblioteca
 let p=await mkpage(async p=>{await p.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='localhost'?r.continue():r.abort()})});
 await p.goto(BASE+'/404.html');
 const lib=await p.evaluate(async(wideB64)=>{const {toWebP,imageSize}=await import('/cdn-lib.js');
  const wide=await (await fetch('data:image/png;base64,'+wideB64)).blob();
  const px=async(blob,x,y)=>{const bm=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;const g=c.getContext('2d');g.drawImage(bm,0,0);const d=g.getImageData(x,y,1,1).data;return[d[0],d[1],d[2]]};
  const fit=await toWebP(wide,{frame:'fit',background:'#00ff00',quality:1});const crop=await toWebP(wide,{frame:'crop',quality:1});const orig=await toWebP(wide,{frame:'original'});const bad=await toWebP(wide,{frame:'fit',background:'url(x)'});
  const small=await toWebP(wide,{frame:'fit',maxSide:150});
  return{fit:await imageSize(fit),crop:await imageSize(crop),orig:await imageSize(orig),small:await imageSize(small),fitCorner:await px(fit,5,5),fitCenter:await px(fit,150,150),cropEdge:await px(crop,2,50),badCorner:await px(bad,5,5)}},WIDE.toString('base64'));
 t('fit: 300×100 vira 300×300',lib.fit.width===300&&lib.fit.height===300);
 t('fit: fundo escolhido nas bordas e foto inteira no centro',lib.fitCorner[1]>200&&lib.fitCorner[0]<40&&lib.fitCenter[0]>200&&lib.fitCenter[1]<40);
 t('crop: 300×100 vira 100×100 preenchido pela foto',lib.crop.width===100&&lib.crop.height===100&&lib.cropEdge[0]>200);
 t('original mantém 300×100',lib.orig.width===300&&lib.orig.height===100);
 t('lado máximo respeitado (150×150)',lib.small.width===150&&lib.small.height===150);
 t('cor de fundo inválida cai para branco',lib.badCorner.every(v=>v>240));
 await p.close();
 // ===== B. gerenciador cdn.html
 let n=0;const trees={},commits={},blobs={};const files=new Map([['products/CH-0002/01.webp','old1'],['products/CH-0002/02.webp','old2'],['home/LEIA-ME.txt','k']]);
 const mkTree=m=>{const id='t'+(++n);trees[id]=new Map(m);return id};let head='c0';commits.c0={tree:mkTree(files)};
 p=await mkpage(async p=>{await p.route('**/*',async r=>{const u=new URL(r.request().url()),m=r.request().method();
  if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});
  if(u.hostname==='localhost')return r.continue();
  if(u.host==='cdn.jsdelivr.net'){const sq=/02\.webp/.test(u.pathname);return r.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:sq?png(200,200,[0,128,0]):WIDE})}
  if(u.host==='api.github.com'){const path=u.pathname.replace('/repos/luaryshop/luary-cdn','');const body=r.request().postData()?JSON.parse(r.request().postData()):null;const J=(o,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
   if(path==='')return J({permissions:{push:true}});if(path==='/git/ref/heads/main')return J({object:{sha:head}});
   if(path.startsWith('/git/commits/')&&m==='GET')return J({tree:{sha:commits[path.split('/').pop()].tree}});
   if(path.startsWith('/git/trees/')&&m==='GET'){const tr=trees[path.split('/').pop()];return J({truncated:false,tree:[...tr].map(([p,sha])=>({path:p,type:'blob',sha,size:10}))})}
   if(path==='/git/blobs'){const id='b'+(++n);blobs[id]=body.content;return J({sha:id},201)}
   if(path==='/git/trees'&&m==='POST'){const nm=new Map(trees[body.base_tree]);for(const e of body.tree){if(e.sha===null)nm.delete(e.path);else nm.set(e.path,e.sha)}return J({sha:mkTree(nm)},201)}
   if(path==='/git/commits'&&m==='POST'){const id='c'+(++n);commits[id]={tree:body.tree};return J({sha:id},201)}
   if(path==='/git/refs/heads/main'&&m==='PATCH'){head=body.sha;return J({})}return J({message:'nf'},404)}
  return r.abort()});await p.addInitScript(`window.__DB={products:{p1:{sku:'CH-0002',name:'Cruz',images:[]}}}`)});
 await p.goto(BASE+'/cdn.html?sku=CH-0002');await p.waitForTimeout(800);await p.fill('#token','good');await p.click('#connect');await p.waitForTimeout(400);
 const dims=()=>p.evaluate(async()=>{const imgs=[...document.querySelectorAll('#grid .tile img')];imgs.forEach(i=>{i.loading='eager'});await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return imgs.map(i=>[i.naturalWidth,i.naturalHeight])});
 let d=await dims();t('fotos publicadas aparecem (300×100 e 200×200)',d.length===2&&d[0][0]===300&&d[0][1]===100&&d[1][0]===200);
 t('o tile mostra a foto inteira (contain) em caixa quadrada',(await p.locator('#grid .tile img').first().evaluate(i=>getComputedStyle(i).objectFit))==='contain');
 t('enquadramento padrão é automático',(await p.inputValue('#frame'))==='auto');
 await p.setInputFiles('#files',tmp+'/luary-wide.png');await p.waitForTimeout(900);d=await dims();
 t('upload horizontal em produtos vira quadrado automaticamente',d.length===3&&d[2][0]===d[2][1]&&d[2][0]===300);
 await p.setInputFiles('#files',tmp+'/luary-tall.png');await p.waitForTimeout(900);d=await dims();
 t('upload vertical também vira quadrado (300×300)',d.length===4&&d[3][0]===300&&d[3][1]===300);
 await p.selectOption('#frame','crop');await p.setInputFiles('#files',tmp+'/luary-wide.png');await p.waitForTimeout(900);d=await dims();
 t('modo cortar gera 100×100',d.length===5&&d[4][0]===100&&d[4][1]===100);
 await p.selectOption('#frame','original');await p.setInputFiles('#files',tmp+'/luary-wide.png');await p.waitForTimeout(900);d=await dims();
 t('modo original mantém 300×100',d.length===6&&d[5][0]===300&&d[5][1]===100);
 await p.click('#square-existing');await p.waitForTimeout(1500);d=await dims();
 t('padronizar: só a foto não quadrada foi refeita (1ª → 300×300; 2ª continua 200×200)',d[0][0]===300&&d[0][1]===300&&d[1][0]===200&&d[1][1]===200);
 t('mensagem informa 1 foto ajustada',(await p.locator('#result').textContent()).includes('1 foto(s) ajustada(s)'));
 t('sem erros JS no gerenciador',p.errs.length===0);console.log(p.errs);await p.close();
 // ===== C. vitrine
 const DB={products:{a:{sku:'CH-1',name:'Cruz larga',category:'Chaveiros',priceWholesale:50,priceRetail:90,images:['https://img.test/wide.png','https://img.test/tall.png']}},siteSettings:{public:{whatsapp:'19988207658'}}};
 p=await mkpage(async p=>{await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='www.gstatic.com')return r.fulfill({contentType:'text/javascript',body:stubs[u.pathname.split('/').pop()]});if(u.hostname==='localhost')return r.continue();if(u.host==='img.test')return r.fulfill({contentType:'image/png',body:/wide/.test(u.pathname)?WIDE:TALL});return r.abort()});await p.addInitScript(`window.__DB=${JSON.stringify(DB)}`)});
 await p.goto(BASE+'/index.html');await p.waitForTimeout(1000);
 const box=await p.locator('.product-card .product-photo').first().boundingBox();t('foto do card é quadrada (1:1)',Math.abs(box.width-box.height)<2);
 t('imagem do card não é cortada (contain)',(await p.locator('.product-photo img').first().evaluate(i=>getComputedStyle(i).objectFit))==='contain');
 await p.locator('.product-card').first().click();await p.waitForTimeout(500);
 const mb=await p.locator('.detail-main-photo').boundingBox();t('foto do modal é quadrada',Math.abs(mb.width-mb.height)<2&&mb.width>=250);
 t('foto do modal e miniaturas sem corte',(await p.locator('#modal-main-img').evaluate(i=>getComputedStyle(i).objectFit))==='contain'&&(await p.locator('.thumbnail img').first().evaluate(i=>getComputedStyle(i).objectFit))==='contain');
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);const mm=await p.locator('.detail-main-photo').boundingBox();t('modal no celular continua quadrado e dentro da tela',Math.abs(mm.width-mm.height)<2&&mm.x>=0&&mm.x+mm.width<=390);
 t('vitrine sem erros JS',p.errs.length===0);console.log(p.errs);await p.close();
 await b.close();process.exit(ok?0:1)})();
