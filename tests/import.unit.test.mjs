// Migrador: leitor de .xlsx próprio + regras de importação, com as planilhas reais do cliente.
import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {readXlsx,readCsv,writeXlsx} from "../xlsx-lite.js";import * as C from "../import-core.js";
let n=0;const ok=(name,fn)=>{try{fn();n++;console.log("PASS "+name)}catch(e){console.log("FAIL "+name);throw e}};
const load=async f=>{const b=readFileSync(new URL("./fixtures/"+f,import.meta.url));return readXlsx(b.buffer.slice(b.byteOffset,b.byteOffset+b.length))};
const luary=await load("modelo-importacao.xlsx"),uni=await load("planilha-universal-marketplaces.xlsx");
ok("lê abas e linhas do modelo",()=>{assert.deepEqual(Object.keys(luary),["Produtos"]);assert.equal(luary.Produtos.length,149);assert.equal(luary.Produtos[0].SKU,"CH-0002");assert.equal(luary.Produtos[0].Nome,"CRUZ VAZADA 3D");assert.equal(luary.Produtos[0]["Custo Base (R$)"],25.5)});
ok("lê abas da planilha universal",()=>{for(const a of ["Mestre_Produtos","Mestre_Variacoes","Shopee","Amazon","Facebook_Instagram"])assert.ok(uni[a],a);assert.equal(uni.Mestre_Variacoes.length,2);assert.equal(uni.Mestre_Variacoes[1].SKU,"CHV-SBENTO-NIQ")});
ok("detecta formatos",()=>{assert.equal(C.detectFormat(luary).kind,"simple");assert.equal(C.detectFormat(uni).kind,"universal")});
const r1=C.recordsFromSheets(luary);
ok("modelo: 149 registros; Banho único vira atributo (não variação)",()=>{assert.equal(r1.records.length,149);const r=r1.records[0];assert.equal(r.sku,"CH-0002");assert.equal(r.attributes.Banho,"Ouro");assert.equal(r.attributes.Marca,"Luary");assert.deepEqual(r.variations,{});assert.equal(r.cost,25.5);assert.equal(r.stock,10);assert.equal(r.weightG,200);assert.equal(r.ignoredColumns.join(),"Subcategoria")});
const cats=[...new Set(r1.records.map(r=>r.category))];
ok("sugestão de categoria casa singular/plural e ajusta CAIXA ALTA",()=>{const m=C.suggestCategoryMap(cats,["Chaveiros"]);assert.equal(m.CHAVEIRO,"Chaveiros");assert.equal(m.PIERCING,"Piercing")});
const plan1=C.planImport(r1.records,[],{categoryMap:C.suggestCategoryMap(cats,["Chaveiros"])});
ok("plano do modelo: 149 novos, sem erros, 148 sem preço, 1 com preço calculado",()=>{assert.equal(plan1.summary.new,149);assert.equal(plan1.summary.error,0);assert.equal(plan1.summary.noPrice,148);const it=plan1.items[0];assert.equal(it.doc.priceWholesale,35.7);assert.equal(it.doc.category,"Chaveiros");assert.equal(it.doc.active,true);assert.equal(it.doc.priceRetail,0)});
ok("custo+margem desligado: sem preço",()=>{const p=C.planImport(r1.records,[],{useCostMargin:false});assert.equal(p.summary.noPrice,149)});
const r2=C.recordsFromSheets(uni,{colorGroup:"Banho"});
ok("universal: 1 produto com 2 cores viram grupo Banho",()=>{assert.equal(r2.records.length,1);const r=r2.records[0];assert.equal(r.sku,"SBENTO");assert.equal(r.category,"Chaveiros");assert.deepEqual(r.variations,{Banho:["Dourado","Níquel"]});assert.equal(r.priceRetail,19.9);assert.equal(r.stock,50);assert.equal(r.weightG,15);assert.equal(r.attributes.Material,"Metal folheado");assert.equal(r.images.length,0);assert.ok(r.highlights.length>=4);assert.ok(r.description.includes("PROTEÇÃO E FÉ"))});
ok("universal: grupo escolhido (Cor)",()=>{assert.deepEqual(C.recordsFromSheets(uni,{colorGroup:"Cor"}).records[0].variations,{Cor:["Dourado","Níquel"]})});
ok("universal: URLs de exemplo <...> não viram imagem",()=>{assert.deepEqual(r2.records[0].images,[])});
const existing=[{id:"abc",sku:"CH-0002",name:"Antigo",category:"Chaveiros",priceWholesale:50,priceRetail:80,images:["https://x/1.webp"],minQty:12,attributes:{Linha:"Fé"},variations:{Inicial:["A"]}}];
const plan2=C.planImport(r1.records.slice(0,2),existing,{categoryMap:{CHAVEIRO:"Chaveiros"}});
ok("existente: atualiza só o que veio, preserva preço/fotos/minQty/atributos",()=>{const it=plan2.items[0];assert.equal(it.status,"update");assert.equal(it.id,"abc");assert.equal(it.doc.priceRetail,undefined);assert.ok(!it.changes.includes("images"));assert.deepEqual(it.doc.attributes,{Linha:"Fé",Banho:"Ouro",Cor:"Dourado",Marca:"Luary",Material:"Metal"});assert.deepEqual(it.doc.variations,{Inicial:["A"]});assert.equal(it.doc.minQty,undefined);assert.equal(plan2.items[1].status,"new")});
ok("modo só-criar ignora existentes; só-atualizar ignora novos",()=>{const c=C.planImport(r1.records.slice(0,2),existing,{mode:"create",categoryMap:{CHAVEIRO:"Chaveiros"}});assert.equal(c.items[0].status,"skip");assert.equal(c.items[1].status,"new");const u=C.planImport(r1.records.slice(0,2),existing,{mode:"update",categoryMap:{CHAVEIRO:"Chaveiros"}});assert.equal(u.items[0].status,"update");assert.equal(u.items[1].status,"skip")});
ok("segunda importação idêntica = sem mudança",()=>{const first=C.planImport(r1.records.slice(0,1),[],{categoryMap:{CHAVEIRO:"Chaveiros"}}).items[0];const again=C.planImport(r1.records.slice(0,1),[{id:"x",...first.doc}],{categoryMap:{CHAVEIRO:"Chaveiros"}});assert.equal(again.items[0].status,"same")});
ok("validação: SKU vazio/inválido/repetido, nome e categoria vazios",()=>{const csv=C.recordsFromSheets(readCsv("SKU;Nome;Categoria\n;Sem sku;A\nab c;Inválido;A\nOK-1;Bom;A\nok-1;Repetido;A\nOK-2;;A\nOK-3;Sem cat;\n"));const p=C.planImport(csv.records,[]);assert.deepEqual(p.items.map(i=>i.status),["error","error","new","error","error","error"]);assert.ok(p.items[3].issues[0].text.includes("repetido"))});
ok("categoria padrão resolve linha sem categoria",()=>{const csv=C.recordsFromSheets(readCsv("SKU;Nome;Categoria\nOK-3;Sem cat;\n"));assert.equal(C.planImport(csv.records,[],{defaultCategory:"Geral"}).items[0].status,"new")});
ok("CSV: separador, aspas, vírgula decimal, BOM, status",()=>{const t=readCsv('﻿SKU;Nome;Categoria;Preço Atacado;Banho;Status\n"a-1";"Nome; com ponto e vírgula";C;"R$ 1.234,50";"Ouro; Prata";Inativo\n');const r=C.recordsFromSheets(t).records[0];assert.equal(r.sku,"A-1");assert.equal(r.name,"Nome; com ponto e vírgula");assert.equal(r.priceWholesale,1234.5);assert.deepEqual(r.variations,{Banho:["Ouro","Prata"]});assert.equal(r.active,false)});
ok("CSV com vírgula e TAB",()=>{assert.equal(readCsv("SKU,Nome\nA,B\n").Planilha[0].Nome,"B");assert.equal(readCsv("SKU\tNome\nA\tB\n").Planilha[0].Nome,"B")});
ok("toNumber",()=>{assert.equal(C.toNumber("19,9"),19.9);assert.equal(C.toNumber("1.234,5"),1234.5);assert.equal(C.toNumber(""),null);assert.equal(C.toNumber("abc"),null);assert.equal(C.toNumber(7),7)});
ok("atributos/valores: parse e formatação",()=>{assert.deepEqual(C.parseAttributes("Material: Metal; Tema:Fé;;x"),{Material:"Metal",Tema:"Fé"});assert.equal(C.formatAttributes({A:"1",B:"2"}),"A: 1; B: 2");assert.deepEqual(C.parseValues("Ouro, Prata\nOuro/Níquel"),["Ouro","Prata","Níquel"]);assert.equal(C.variationValue("a|b=c:d"),"a b c d");assert.equal(C.LETTERS.length,26)});

// ----- modelo de planilha (regressão: cabeçalho com ; desalinhava as colunas) -----
const defect=readCsv(readFileSync(new URL("./fixtures/modelo-baixado-com-defeito.csv",import.meta.url),"utf8"));
ok("CSV antigo com defeito é detectado e avisa",()=>{assert.ok(defect.Planilha.warnings.length>=1);assert.match(defect.Planilha.warnings[0],/cabeçalho parece partido/)});
ok("nomes de coluna do modelo não têm ; , \" nem parênteses soltos",()=>{for(const c of C.TEMPLATE_FILE_COLUMNS){assert.ok(!/[;,"\n]/.test(c),c);assert.equal(c.split("(").length,c.split(")").length)}});
ok("modelo CSV: volta com todas as colunas alinhadas e valores no lugar certo",()=>{
  const csv=C.toCsv(C.TEMPLATE_FILE_COLUMNS,C.TEMPLATE_SAMPLE);const back=readCsv(csv);const rows=back.Planilha;
  assert.deepEqual(back.Planilha.warnings,[]);assert.equal(rows.length,2);assert.equal(Object.keys(rows[0]).filter(k=>k!=="__row").length,C.TEMPLATE_FILE_COLUMNS.length);
  const r=C.recordsFromSheets(back).records[0];
  assert.equal(r.sku,"EXEMPLO-01");assert.equal(r.priceWholesale,19.9);assert.equal(r.priceRetail,29.9);assert.equal(r.stock,25);assert.equal(r.active,true);
  assert.deepEqual(r.variations,{Banho:["Ouro","Prata","Níquel"]});assert.deepEqual(r.highlights,["Acabamento resistente","Tamanho compacto"]);assert.equal(r.attributes.Tema,"Religioso");assert.equal(r.attributes["Gênero"],"Unissex");
  assert.equal(r.description,"Chaveiro folheado de São Bento.");assert.equal(r.weightG,15);assert.equal(r.lengthCm,8);assert.deepEqual(r.ignoredColumns,[]);assert.equal(r.cost,12.5);assert.equal(r.margin,40)});
const bytes=writeXlsx([{name:"Produtos",rows:[C.TEMPLATE_FILE_COLUMNS,...C.TEMPLATE_SAMPLE.map(x=>C.TEMPLATE_FILE_COLUMNS.map(c=>x[c]??""))],header:true},{name:"Instrucoes",rows:C.TEMPLATE_HELP.map(t=>[t])}]);
import {writeFileSync} from "node:fs";if(process.env.XLSX_OUT)writeFileSync(process.env.XLSX_OUT,bytes);
const back=await readXlsx(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
ok("modelo .xlsx: abas e colunas corretas, lido pelo importador sem avisos",()=>{assert.deepEqual(Object.keys(back),["Produtos","Instrucoes"]);const r=C.recordsFromSheets(back);assert.equal(r.records.length,2);assert.deepEqual(r.records[0].ignoredColumns,[]);assert.equal(r.records[0].priceWholesale,19.9);assert.equal(r.records[1].attributes.Banho,"Ouro");assert.equal(C.planImport(r.records,[]).summary.error,0)});
ok("xlsx escrito escapa XML e aceita acentos",()=>{const b=writeXlsx([{name:"A&B",rows:[["x<y>&\"'","ação"],[1.5,""]]}]);return readXlsx(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)).then(r=>{assert.equal(Object.keys(r)[0],"A&B");assert.equal(r["A&B"].length,1)})});
{
  const name="exportar catálogo → reimportar a mesma planilha = tudo 'sem mudança' (ida e volta)";
  const prods=[
   {id:"1",sku:"CH-1",name:"Cruz",category:"Chaveiros",priceWholesale:19.9,priceRetail:29.9,stock:5,minQty:12,active:true,description:"Linda; peça",highlights:["A","B"],attributes:{Marca:"Luary",Material:"Metal",Tema:"Fé"},variations:{Banho:["Ouro","Prata"],Inicial:["A","B","C"],Signo:["Áries"]},images:["https://x/1.webp","https://x/2.webp"],cost:10,weightG:15,lengthCm:8},
   {id:"2",sku:"AN-2",name:"Anel",category:"Anéis",priceWholesale:0,priceRetail:0,active:false,attributes:{Banho:"Ouro",Cor:"Dourado"},variations:{Cor:["Azul","Verde"]}}];
  const cols=C.catalogColumns(C.groupsInProducts(prods));
  assert.ok(cols.includes("Variação Inicial")&&cols.includes("Variação Signo")&&!cols.some(c=>/[;"]/.test(c)));
  const b=writeXlsx([{name:"Produtos",rows:[cols,...prods.map(p=>C.productToRow(p,cols))],header:true}]);
  const sh=await readXlsx(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
  const plan=C.planImport(C.recordsFromSheets(sh).records,prods,{categoryMap:{Chaveiros:"Chaveiros","Anéis":"Anéis"}});
  assert.deepEqual(plan.items.map(i=>i.status+":"+i.changes.join()),["same:","same:"]);
  n++;console.log("PASS "+name);
}
ok("modelo traz Quantidade Mínima, Fotos e Variação Inicial/Signo e o exemplo é lido certo",()=>{for(const c of ["Quantidade Mínima","Fotos","Variação Inicial","Variação Signo"])assert.ok(C.TEMPLATE_FILE_COLUMNS.includes(c),c);const r=C.recordsFromSheets(readCsv(C.toCsv(C.TEMPLATE_FILE_COLUMNS,C.TEMPLATE_SAMPLE))).records;assert.equal(r[0].minQty,12);assert.deepEqual(r[1].variations.Inicial,["A","B","C"]);assert.deepEqual(r[1].variations.Signo,["Áries","Touro"]);assert.deepEqual(r[0].variations.Banho,["Ouro","Prata","Níquel"])});
await assert.rejects(()=>readXlsx(new TextEncoder().encode("isto nao e um zip").buffer),/inválido/);n++;console.log("PASS xlsx inválido gera erro claro");
ok("injeção: SKU/nomes não executam nada e docId é seguro",()=>{assert.equal(C.docIdForSku("CH-0002"),"ch-0002");assert.equal(C.docIdForSku("A_B C"),"a-b-c");const p=C.planImport(C.recordsFromSheets(readCsv("SKU;Nome;Categoria\nX-1;<img src=x onerror=alert(1)>;C\n")).records,[]);assert.equal(p.items[0].status,"new")});

