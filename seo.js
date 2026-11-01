// SEO, Open Graph e compartilhamento — funções puras (sem Firebase), usadas pela loja e pelo painel.
export const DEFAULT_SITE_URL = "https://luaryshop.github.io/luary-system/";
export const DEFAULT_TITLE = "Luary Shop | Acessórios com significado";
export const DEFAULT_DESCRIPTION = "Chaveiros folheados e presentes com significado. Monte seu pedido de atacado ou encontre a loja oficial da Luary no varejo.";
export const DEFAULT_OG_IMAGE = "public/images/og-luary.jpg";

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const clip = (text, max) => { const t = clean(text); return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:\-–]+$/, "") + "…"; };
export const safeHttps = (v) => { try { const u = new URL(v); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
export const escapeXml = (v) => String(v ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
export const escapeAttr = escapeXml;

// URL base do site, sempre https e terminando em "/". Inválida → padrão.
export function normalizeSiteUrl(v) {
  const u = safeHttps(clean(v));
  if (!u) return DEFAULT_SITE_URL;
  const x = new URL(u); x.hash = ""; x.search = "";
  return x.href.endsWith("/") ? x.href : x.href.replace(/[^/]*$/, "");
}
const absolute = (base, path) => { const direct = safeHttps(path); if (direct) return direct; try { return new URL(String(path || ""), base).href; } catch { return base; } };

export const skuSlug = (sku) => clean(sku).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const productHash = (sku) => `#produto=${encodeURIComponent(clean(sku))}`;
export const categoryHash = (name) => `#categoria=${encodeURIComponent(clean(name))}`;
export function parseHash(hash) {
  const m = String(hash || "").match(/^#(produto|categoria)=(.+)$/);
  if (!m) return null;
  try { return { type: m[1], value: decodeURIComponent(m[2]) }; } catch { return null; }
}
export const sharePageUrl = (siteUrl, sku) => `${normalizeSiteUrl(siteUrl)}p/${skuSlug(sku)}.html`;
export function shareLink(settings, product) {
  const base = normalizeSiteUrl(settings?.siteUrl);
  return settings?.sharePagesPublished && skuSlug(product.sku) ? sharePageUrl(base, product.sku) : base + productHash(product.sku);
}

const productImage = (p) => {
  const arr = Array.isArray(p?.images) ? p.images : [];
  return arr.map((i) => (typeof i === "string" ? i : i?.url || "")).map(safeHttps).find(Boolean) || "";
};
const priceOf = (p) => { const n = Number(p?.priceRetail) > 0 ? Number(p.priceRetail) : 0; return n; };

// Metadados de uma página. `kind`: home | category | product.
export function buildMeta({ kind = "home", settings = {}, product = null, category = null } = {}) {
  const base = normalizeSiteUrl(settings.siteUrl);
  const siteName = clean(settings.companyName) || "Luary Shop";
  const defTitle = clean(settings.seoTitle) || DEFAULT_TITLE;
  const defDesc = clean(settings.seoDescription) || DEFAULT_DESCRIPTION;
  const ogDefault = safeHttps(settings.ogImage) || absolute(base, DEFAULT_OG_IMAGE);
  let title = defTitle, description = defDesc, image = ogDefault, url = base, type = "website";
  if (kind === "category" && category) {
    const name = clean(category.name || category);
    title = clean(category.seoTitle) || `${name} | ${siteName}`;
    description = clean(category.seoDescription) || `Conheça ${name} da ${siteName}. Escolha as peças e monte seu pedido.`;
    if (safeHttps(category.imageUrl)) image = safeHttps(category.imageUrl);
    url = base + categoryHash(name);
  } else if (kind === "product" && product) {
    const name = clean(product.name) || "Peça Luary";
    title = clean(product.seoTitle) || `${name}${product.sku ? ` (${clean(product.sku)})` : ""} | ${siteName}`;
    description = clean(product.seoDescription) || clean(product.description || product.details) || `${name} — ${clean(product.category) || "acessórios"} da ${siteName}. Consulte condições de atacado e varejo.`;
    image = productImage(product) || ogDefault;
    url = shareLink(settings, product);
    type = "product";
  }
  return { title: clip(title, 70), description: clip(description, 200), image, url, canonical: kind === "home" ? base : url, type, siteName, twitter: clean(settings.twitterHandle).replace(/^@?/, "@").replace(/^@$/, "") };
}

// Dados estruturados (JSON-LD)
export function jsonLdOrganization(settings = {}) {
  const base = normalizeSiteUrl(settings.siteUrl);
  const sameAs = [settings.instagram, settings.facebook].map((x) => clean(x)).map((x) => (x && !/^https?:/i.test(x) ? "https://www.instagram.com/" + x.replace(/^@/, "") + "/" : x)).map(safeHttps).filter(Boolean);
  const logo = safeHttps(settings.logoUrl);
  return { "@context": "https://schema.org", "@type": "Organization", name: clean(settings.companyName) || "Luary Shop", url: base, ...(logo ? { logo } : {}), ...(sameAs.length ? { sameAs } : {}) };
}
export function jsonLdProduct(product, settings = {}) {
  const meta = buildMeta({ kind: "product", settings, product });
  const price = priceOf(product);
  return {
    "@context": "https://schema.org", "@type": "Product",
    name: clean(product.name) || "Peça Luary", ...(product.sku ? { sku: clean(product.sku) } : {}),
    description: meta.description, ...(meta.image ? { image: [meta.image] } : {}),
    brand: { "@type": "Brand", name: meta.siteName }, ...(product.category ? { category: clean(product.category) } : {}),
    ...(price > 0 ? { offers: { "@type": "Offer", priceCurrency: "BRL", price: price.toFixed(2), url: meta.url, availability: "https://schema.org/InStock" } } : {}),
  };
}
export function jsonLdItemList(products, settings = {}, limit = 50) {
  const base = normalizeSiteUrl(settings.siteUrl);
  return { "@context": "https://schema.org", "@type": "ItemList", itemListElement: products.slice(0, limit).map((p, i) => ({ "@type": "ListItem", position: i + 1, name: clean(p.name) || "Peça Luary", url: shareLink(settings, p) || base })) };
}
// JSON dentro de <script>: impede fechar a tag.
export const jsonLdScript = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

// Aplica no documento do navegador.
export function applyMeta(doc, meta, ld = null) {
  const set = (sel, attr, val, create) => {
    let el = doc.head.querySelector(sel);
    if (!el && create) { el = doc.createElement(create.tag); Object.entries(create.attrs).forEach(([k, v]) => el.setAttribute(k, v)); doc.head.appendChild(el); }
    if (el) el.setAttribute(attr, val);
  };
  doc.title = meta.title;
  set('meta[name="description"]', "content", meta.description, { tag: "meta", attrs: { name: "description" } });
  set('link[rel="canonical"]', "href", meta.canonical, { tag: "link", attrs: { rel: "canonical" } });
  const og = { "og:title": meta.title, "og:description": meta.description, "og:image": meta.image, "og:url": meta.url, "og:type": meta.type, "og:site_name": meta.siteName, "og:locale": "pt_BR" };
  for (const [k, v] of Object.entries(og)) set(`meta[property="${k}"]`, "content", v, { tag: "meta", attrs: { property: k } });
  const tw = { "twitter:card": "summary_large_image", "twitter:title": meta.title, "twitter:description": meta.description, "twitter:image": meta.image };
  if (meta.twitter) tw["twitter:site"] = meta.twitter;
  for (const [k, v] of Object.entries(tw)) set(`meta[name="${k}"]`, "content", v, { tag: "meta", attrs: { name: k } });
  let script = doc.getElementById("ld-dynamic");
  if (ld) {
    if (!script) { script = doc.createElement("script"); script.id = "ld-dynamic"; script.type = "application/ld+json"; doc.head.appendChild(script); }
    script.textContent = jsonLdScript(ld);
  } else if (script) script.remove();
}

// Arquivos gerados pelo painel
export function buildSitemap(settings, products = []) {
  const base = normalizeSiteUrl(settings.siteUrl);
  const urls = [base, ...products.filter((p) => skuSlug(p.sku)).map((p) => shareLink({ ...settings, sharePagesPublished: true }, p))];
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`;
}
export const buildRobots = (settings) => `User-agent: *\nAllow: /\nDisallow: /carrinho.html\nDisallow: /checkout.html\n\nSitemap: ${normalizeSiteUrl(settings.siteUrl)}sitemap.xml\n`;

// Página estática de compartilhamento: tem as tags OG para o WhatsApp/Facebook (que não executam JavaScript)
// e leva a pessoa para a vitrine com o produto aberto.
export function buildSharePage(settings, product) {
  const base = normalizeSiteUrl(settings.siteUrl);
  const meta = buildMeta({ kind: "product", settings: { ...settings, sharePagesPublished: true }, product });
  const target = base + productHash(product.sku);
  const e = escapeAttr;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(meta.title)}</title>
<meta name="description" content="${e(meta.description)}">
<link rel="canonical" href="${e(meta.canonical)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="${e(meta.siteName)}"><meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${e(meta.title)}"><meta property="og:description" content="${e(meta.description)}">
<meta property="og:url" content="${e(meta.url)}"><meta property="og:image" content="${e(meta.image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(meta.title)}"><meta name="twitter:description" content="${e(meta.description)}"><meta name="twitter:image" content="${e(meta.image)}">
<script type="application/ld+json">${jsonLdScript(jsonLdProduct(product, { ...settings, sharePagesPublished: true }))}</script>
<meta http-equiv="refresh" content="0;url=${e(target)}">
</head><body><p><a href="${e(target)}">${e(meta.title)}</a></p><script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script></body></html>
`;
}
