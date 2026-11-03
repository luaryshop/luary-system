// Migrador de produtos em massa — lógica pura (sem DOM, sem Firebase), testável em node.
// Entende dois formatos:
//   1) "Modelo Luary": uma aba com 1 linha por produto (SKU, Nome, Categoria, Banho, Estoque...).
//   2) "Planilha Universal de Marketplaces": abas Mestre_Produtos + Mestre_Variacoes (1 produto → várias cores).
// Entrada: { nomeDaAba: [ {coluna: valor, ...}, ... ] }  (o navegador converte o .xlsx/.csv antes).

export const SKU_RE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
const MAX_IMAGES = 10;

export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const httpsUrl = (v) => { try { const u = new URL(clean(v)); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };

// "19,9" · "R$ 1.234,50" · 19.9 → número; vazio/ruim → null
export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = clean(v).replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- atributos / diferenciais / variações em texto ----------
export function parseAttributes(text) {
  const out = {};
  for (const part of String(text ?? "").split(/[;\n]+/)) {
    const i = part.indexOf(":"); if (i < 1) continue;
    const k = clean(part.slice(0, i)).slice(0, 40), v = clean(part.slice(i + 1)).slice(0, 120);
    if (k && v) out[k] = v;
  }
  return out;
}
export const formatAttributes = (obj) => Object.entries(obj && typeof obj === "object" ? obj : {}).map(([k, v]) => `${k}: ${v}`).join("; ");
export const parseList = (text) => [...new Set(String(text ?? "").split(/[;\n]+/).map((x) => clean(x).slice(0, 120)).filter(Boolean))].slice(0, 20);

// Valores de variação: separa por quebra de linha, vírgula, ponto e vírgula ou barra; tira | = : (usados na chave do carrinho).
export const variationValue = (s) => clean(String(s ?? "").replace(/[|=:]/g, " ")).slice(0, 40);
export const parseValues = (text) => [...new Set(String(text ?? "").split(/[\n,;/]+/).map(variationValue).filter(Boolean))].slice(0, 60);
export const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
export const PRESET_VARIATION_TYPES = [
  { name: "Banho", values: ["Ouro", "Prata", "Níquel", "Ródio", "Ouro Rosé"] },
  { name: "Inicial", values: LETTERS },
];

// ---------- cabeçalhos ----------
const HEADERS = {
  sku: ["sku", "id produto", "codigo", "referencia", "ref"],
  name: ["nome", "nome base", "titulo", "produto", "descricao do produto"],
  category: ["categoria", "categoria geral"],
  brand: ["marca"], color: ["cor"], bath: ["banho"], material: ["material"], theme: ["tema"], gender: ["genero"],
  cost: ["custo base r", "custo base", "custo", "custo r"],
  weightG: ["peso base g", "peso g", "peso"], weightKg: ["peso kg"],
  margin: ["margem alvo", "margem alvo %", "margem"],
  stock: ["estoque inicial", "estoque", "quantidade em estoque"],
  length: ["comprimento cm", "comprimento"], width: ["largura cm", "largura"], height: ["altura cm", "altura"],
  status: ["status", "situacao", "ativo"],
  priceWholesale: ["preco atacado", "atacado", "preco de atacado"],
  priceRetail: ["preco varejo", "varejo", "preco"],
  description: ["descricao longa", "descricao"], shortDescription: ["descricao curta"],
  keywords: ["palavras chave", "keywords", "tags"],
  subcategory: ["subcategoria"],
};
const LOOKUP = new Map(); for (const [field, names] of Object.entries(HEADERS)) for (const n of names) LOOKUP.set(n, field);
export function fieldOf(header) {
  const h = fold(header);
  if (!h) return null;
  if (LOOKUP.has(h)) return LOOKUP.get(h);
  if (h.startsWith("atributos")) return "attributes";
  if (h.startsWith("diferenciais")) return "highlights";
  const photo = h.match(/^url foto (capa|\d+|lifestyle)$/); if (photo) return "photo";
  return null;
}
// Linha {coluna: valor} → {campo: valor}; devolve também as colunas que não foram reconhecidas.
export function mapRow(row) {
  const out = { photos: [] }, ignored = [];
  for (const [header, value] of Object.entries(row || {})) {
    if (header.startsWith("__")) continue;
    const f = fieldOf(header);
    if (!f) { if (clean(header) && clean(value) !== "") ignored.push(clean(header)); continue; }
    if (f === "photo") { out.photos.push(value); continue; }
    if (f === "subcategory") { if (clean(value) !== "") ignored.push(clean(header)); continue; }
    if (clean(value) !== "" && out[f] === undefined) out[f] = value;
  }
  return { fields: out, ignored };
}

export function parseStatus(v) {
  const s = fold(v);
  if (!s) return undefined;
  if (["ativo", "sim", "true", "1", "active", "publicado", "ativado"].includes(s)) return true;
  if (["inativo", "nao", "false", "0", "pausado", "rascunho", "desativado", "oculto"].includes(s)) return false;
  return undefined;
}
const titleIfShouting = (s) => { const t = clean(s); return t && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t) ? t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };

// ---------- 1 linha = 1 produto (Modelo Luary e variações dele) ----------
// `splitGroups`: colunas (Banho, Cor) cujo valor tem VÁRIOS itens ("Ouro; Prata") viram variação; com um só item viram atributo.
export function recordFromRow(row, rowNumber, opts = {}) {
  const { fields: f, ignored } = mapRow(row);
  const notes = [];
  const attributes = parseAttributes(f.attributes);
  const variations = {};
  const sortOut = (field, label) => {
    const raw = clean(f[field]); if (!raw) return;
    const values = parseValues(raw);
    if (values.length > 1) variations[label] = values; else attributes[label] = clean(raw).slice(0, 120);
  };
  sortOut("bath", "Banho"); sortOut("color", "Cor");
  for (const [field, label] of [["brand", "Marca"], ["material", "Material"], ["theme", "Tema"], ["gender", "Gênero"]]) if (clean(f[field])) attributes[label] = clean(f[field]).slice(0, 120);
  const cost = toNumber(f.cost), margin = toNumber(f.margin);
  const weightG = toNumber(f.weightG) ?? (toNumber(f.weightKg) !== null ? round2(toNumber(f.weightKg) * 1000) : null);
  const images = [...new Set((f.photos || []).map(httpsUrl).filter(Boolean))].slice(0, MAX_IMAGES);
  return {
    row: row.__row ?? rowNumber, sku: clean(f.sku).toUpperCase(), name: clean(f.name).slice(0, 140), category: clean(f.category).slice(0, 60),
    description: clean(f.description).slice(0, 2000), highlights: parseList([f.highlights, ...(f.shortDescription ? String(f.shortDescription).split("\n") : [])].filter(Boolean).join(";")),
    keywords: parseList(String(f.keywords ?? "").replace(/,/g, ";")),
    cost, margin, priceWholesale: toNumber(f.priceWholesale), priceRetail: toNumber(f.priceRetail),
    stock: toNumber(f.stock) !== null ? Math.max(0, Math.trunc(toNumber(f.stock))) : null,
    weightG, lengthCm: toNumber(f.length), widthCm: toNumber(f.width), heightCm: toNumber(f.height),
    active: parseStatus(f.status), attributes, variations, images, notes, ignoredColumns: ignored,
  };
}

const longText = (v) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);

// ---------- Planilha Universal (Mestre_Produtos + Mestre_Variacoes) ----------
export function recordsFromUniversal(prodRows, varRows, opts = {}) {
  const group = clean(opts.colorGroup) || "Banho";
  const bySku = new Map();
  for (const r of varRows || []) {
    const id = clean(r.ID_Produto ?? r.id_produto).toUpperCase(); if (!id) continue;
    if (!bySku.has(id)) bySku.set(id, []);
    bySku.get(id).push(r);
  }
  const out = [];
  (prodRows || []).forEach((r, i) => {
    const { fields: f, ignored } = mapRow(r);
    const sku = clean(f.sku).toUpperCase();
    const vars = bySku.get(sku) || [];
    const notes = [];
    const colors = [...new Set(vars.map((v) => variationValue(v.Cor ?? v.cor)).filter(Boolean))];
    const prices = vars.map((v) => toNumber(v.Preco ?? v.preco)).filter((n) => n !== null && n > 0);
    const stocks = vars.map((v) => toNumber(v.Estoque ?? v.estoque)).filter((n) => n !== null);
    const photos = vars.flatMap((v) => Object.entries(v).filter(([k]) => fieldOf(k) === "photo").map(([, val]) => val));
    if (new Set(prices).size > 1) notes.push(`Preços diferentes entre as variações (${[...new Set(prices)].join(" / ")}): usado o menor.`);
    if (stocks.length) notes.push("Estoque somado de todas as variações.");
    if (!vars.length) notes.push("Produto sem linhas na aba Mestre_Variacoes.");
    const category = clean(String(f.category ?? "").split(">").pop());
    const attributes = {};
    for (const [field, label] of [["material", "Material"], ["theme", "Tema"], ["gender", "Gênero"], ["brand", "Marca"]]) if (clean(f[field])) attributes[label] = clean(f[field]).slice(0, 120);
    const variations = colors.length > 1 ? { [group]: colors } : {};
    if (colors.length === 1) attributes[group] = colors[0];
    const weightKg = toNumber(f.weightKg);
    out.push({
      row: r.__row ?? i + 2, sku, name: clean(f.name).slice(0, 140), category,
      description: longText(f.description),
      highlights: parseList(String(f.shortDescription ?? "")), keywords: parseList(String(f.keywords ?? "").replace(/,/g, ";")),
      cost: null, margin: null, priceWholesale: null, priceRetail: prices.length ? Math.min(...prices) : null,
      stock: stocks.length ? Math.max(0, Math.trunc(stocks.reduce((a, b) => a + b, 0))) : null,
      weightG: weightKg !== null ? round2(weightKg * 1000) : null, lengthCm: toNumber(f.length), widthCm: toNumber(f.width), heightCm: toNumber(f.height),
      active: undefined, attributes, variations, images: [...new Set(photos.map(httpsUrl).filter(Boolean))].slice(0, MAX_IMAGES), notes, ignoredColumns: ignored,
    });
  });
  return out;
}

// ---------- detecção do formato ----------
export function detectFormat(sheets) {
  const names = Object.keys(sheets || {});
  const find = (n) => names.find((x) => fold(x) === fold(n));
  if (find("Mestre_Produtos") && find("Mestre_Variacoes")) return { kind: "universal", products: find("Mestre_Produtos"), variations: find("Mestre_Variacoes") };
  const pick = find("Produtos") || names.find((n) => (sheets[n] || []).length && Object.keys(sheets[n][0]).some((h) => fieldOf(h) === "sku")) || names[0];
  return pick ? { kind: "simple", sheet: pick } : { kind: "empty" };
}
export function recordsFromSheets(sheets, opts = {}) {
  const fmt = detectFormat(sheets);
  if (fmt.kind === "universal") return { format: fmt.kind, label: "Planilha Universal de Marketplaces", records: recordsFromUniversal(sheets[fmt.products], sheets[fmt.variations], opts) };
  if (fmt.kind === "simple") return { format: fmt.kind, label: "Modelo de importação (1 linha por produto)", records: (sheets[fmt.sheet] || []).filter((r) => Object.entries(r).some(([k, v]) => !k.startsWith("__") && clean(v) !== "")).map((r, i) => recordFromRow(r, i + 2, opts)) };
  return { format: "empty", label: "Arquivo vazio", records: [] };
}

// ---------- categorias ----------
const catKey = (s) => fold(s).replace(/\b(\w+?)s\b/g, "$1"); // "Chaveiros" ≈ "chaveiro"
export function suggestCategoryMap(fileCategories, existingNames) {
  const map = {};
  for (const c of fileCategories) {
    const hit = existingNames.find((e) => catKey(e) === catKey(c));
    map[c] = hit || titleIfShouting(c);
  }
  return map;
}

// ---------- plano de importação ----------
// existing: produtos já cadastrados [{id, sku, ...}]; options.mode: "upsert" | "create" | "update"
export function planImport(records, existing = [], options = {}) {
  const { mode = "upsert", categoryMap = {}, defaultCategory = "", useCostMargin = true, importWithoutPrice = true } = options;
  const bySku = new Map(existing.map((p) => [clean(p.sku).toUpperCase(), p]));
  const seen = new Map();
  const items = records.map((rec) => {
    const issues = [];
    const err = (t) => issues.push({ level: "error", text: t });
    const warn = (t) => issues.push({ level: "warn", text: t });
    rec.notes.forEach((n) => warn(n));
    if (!rec.sku) err("SKU vazio."); else if (!SKU_RE.test(rec.sku)) err(`SKU inválido "${rec.sku}" (use letras, números, hífen e _; até 40).`);
    if (rec.sku && seen.has(rec.sku)) err(`SKU repetido (também na linha ${seen.get(rec.sku)}).`); else if (rec.sku) seen.set(rec.sku, rec.row);
    if (!rec.name) err("Nome vazio.");
    const fileCat = rec.category;
    let category = fileCat ? (categoryMap[fileCat] ?? clean(fileCat)) : clean(defaultCategory);
    if (!category) err("Categoria vazia (escolha uma categoria padrão acima).");
    let priceWholesale = rec.priceWholesale, priceRetail = rec.priceRetail;
    if ((priceWholesale === null || !(priceWholesale > 0)) && useCostMargin && rec.cost > 0 && rec.margin !== null && rec.margin >= 0) {
      priceWholesale = round2(rec.cost * (1 + rec.margin / 100));
      warn(`Preço atacado calculado: custo ${rec.cost} + margem ${rec.margin}% = ${priceWholesale}.`);
    }
    const hasPrice = (priceWholesale > 0) || (priceRetail > 0);
    if (!hasPrice) { if (!importWithoutPrice) err("Sem preço."); else issues.push({ level: "info", text: "Sem preço — defina depois em Preços em massa." }); }
    const existingProduct = rec.sku ? bySku.get(rec.sku) : null;
    // Campos vazios na planilha NUNCA apagam o que já existe no sistema.
    const doc = { sku: rec.sku, name: rec.name, category };
    const put = (k, v) => { if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) doc[k] = v; };
    put("description", rec.description); put("highlights", rec.highlights); put("keywords", rec.keywords);
    put("cost", rec.cost > 0 ? rec.cost : null);
    put("priceWholesale", priceWholesale > 0 ? round2(priceWholesale) : null); put("priceRetail", priceRetail > 0 ? round2(priceRetail) : null);
    put("stock", rec.stock); put("weightG", rec.weightG); put("lengthCm", rec.lengthCm); put("widthCm", rec.widthCm); put("heightCm", rec.heightCm);
    if (rec.active !== undefined) doc.active = rec.active;
    if (existingProduct) {
      put("attributes", { ...(existingProduct.attributes || {}), ...rec.attributes });
      put("variations", { ...(existingProduct.variations || {}), ...rec.variations });
      if (rec.images.length) doc.images = rec.images; // só substitui fotos quando a planilha traz URLs
    } else {
      put("attributes", rec.attributes); put("variations", rec.variations); doc.images = rec.images;
      doc.priceWholesale ??= 0; doc.priceRetail ??= 0;
      if (doc.active === undefined) doc.active = true;
    }
    let status = "new", changes = [];
    if (existingProduct) {
      changes = Object.keys(doc).filter((k) => JSON.stringify(doc[k]) !== JSON.stringify(existingProduct[k]));
      status = changes.length ? "update" : "same";
    }
    if (issues.some((x) => x.level === "error")) status = "error";
    else if (status === "new" && mode === "update") status = "skip";
    else if ((status === "update" || status === "same") && mode === "create") status = "skip";
    return { row: rec.row, sku: rec.sku, name: rec.name, category, fileCategory: fileCat, status, id: existingProduct?.id ?? null, doc, changes, issues, noPrice: !hasPrice };
  });
  const count = (s) => items.filter((i) => i.status === s).length;
  return { items, summary: { total: items.length, new: count("new"), update: count("update"), same: count("same"), skip: count("skip"), error: count("error"), noPrice: items.filter((i) => i.noPrice && ["new", "update"].includes(i.status)).length } };
}

// Id do documento para produtos novos (só letras minúsculas, números e hífen)
export const docIdForSku = (sku) => String(sku).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
