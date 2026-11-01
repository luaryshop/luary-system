#!/usr/bin/env node
// Verificação pré-publicação: arquivos referenciados existem, páginas privadas com noindex, pendências de configuração.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";
const root = new URL("..", import.meta.url).pathname;
const errors = [], warns = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m);
const htmls = readdirSync(root).filter((f) => f.endsWith(".html"));
const PRIVATE = ["admin.html", "content-admin.html", "cdn.html", "editor.html", "pedidos.html", "romaneio.html", "carrinho.html", "checkout.html"];
const PUBLIC_CSP = ["index.html", "carrinho.html", "checkout.html"];

for (const f of htmls) {
  const h = readFileSync(join(root, f), "utf8");
  if (!/<title>[^<]+<\/title>/.test(h)) err(`${f}: sem <title>`);
  if (!/<html[^>]*lang=/.test(h)) warn(`${f}: sem lang no <html>`);
  if (PRIVATE.includes(f) && !/name="robots"[^>]*noindex/.test(h)) err(`${f}: página interna sem noindex`);
  if (PUBLIC_CSP.includes(f) && !/Content-Security-Policy/.test(h)) err(`${f}: sem Content-Security-Policy`);
  // arquivos locais referenciados (src/href e imports)
  const refs = [...h.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((m) => m[1]).concat([...h.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]));
  for (const r of new Set(refs)) {
    if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/|\$\{)/i.test(r) || r.includes("${")) continue;
    if (!existsSync(normalize(join(root, dirname(f), r)))) err(`${f}: arquivo não encontrado → ${r}`);
  }
}
// módulos JS: imports relativos
for (const f of readdirSync(root).filter((x) => x.endsWith(".js"))) {
  const s = readFileSync(join(root, f), "utf8");
  for (const m of s.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) if (!existsSync(normalize(join(root, m[1])))) err(`${f}: import não encontrado → ${m[1]}`);
}
for (const f of ["index.html", "404.html", "robots.txt", "sitemap.xml", "firestore.rules", "public/images/og-luary.jpg", "public/images/luary-hero.webp"]) if (!existsSync(join(root, f))) err(`arquivo obrigatório ausente: ${f}`);
const rules = existsSync(join(root, "firestore.rules")) ? readFileSync(join(root, "firestore.rules"), "utf8") : "";
if (/SEU_EMAIL_ADMIN/.test(rules)) warn("firestore.rules ainda tem o e-mail de exemplo (SEU_EMAIL_ADMIN@exemplo.com) — troque antes de publicar as regras.");
if (/allow\s+(read|write|read,\s*write)\s*:\s*if\s+true/.test(rules.replace(/allow read: if true;/g, ""))) warn("firestore.rules: há 'write: if true' — revise.");
const idx = readFileSync(join(root, "index.html"), "utf8");
const canon = (idx.match(/rel="canonical" href="([^"]+)"/) || [])[1] || "";
const sitemap = existsSync(join(root, "sitemap.xml")) ? readFileSync(join(root, "sitemap.xml"), "utf8") : "";
if (canon && !sitemap.includes(canon)) warn(`sitemap.xml não contém o endereço canônico (${canon}). Gere o pacote em Conteúdo → SEO e redes sociais.`);
if (/5519999999999/.test(idx)) warn("index.html usa número de WhatsApp de exemplo.");
if (/via\.placeholder\.com/.test(idx)) warn("index.html usa imagem de placeholder externa.");
for (const f of ["public/images/luary-hero.webp", "public/images/og-luary.jpg"]) { const p = join(root, f); if (existsSync(p) && statSync(p).size > 600 * 1024) warn(`${f} tem ${(statSync(p).size / 1024) | 0} KB — considere otimizar.`); }

errors.forEach((e) => console.log("✗ ERRO   " + e)); warns.forEach((w) => console.log("! AVISO  " + w));
console.log(`\n${htmls.length} páginas verificadas • ${errors.length} erro(s) • ${warns.length} aviso(s)`);
process.exit(errors.length ? 1 : 0);
