#!/usr/bin/env node
// Auditoria estática da Luary: procura padrões perigosos no código. Uso: node scripts/audit.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
const root = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", ".git", "tests", "scripts", "public"]);
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : [".html", ".js"].includes(extname(n)) && files.push(p); } })(root);

const findings = [];
const add = (sev, file, line, rule, text) => findings.push({ sev, file: relative(root, file), line, rule, text: text.trim().slice(0, 140) });
const rules = [
  { id: "eval", sev: "alto", re: /\beval\s*\(|new Function\s*\(|document\.write\s*\(/, why: "execução dinâmica de código" },
  { id: "link-sem-rel", sev: "médio", test: (l) => /target=["']_blank["']/.test(l) && !/rel=["'][^"']*noopener/.test(l), why: 'target="_blank" sem rel="noopener"' },
  { id: "http-inseguro", sev: "médio", re: /(?:src|href|action)=["']http:\/\/(?!localhost)/, why: "recurso carregado por http://" },
  { id: "segredo", sev: "alto", re: /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+)/, why: "possível segredo no código" },
  { id: "token-no-storage", sev: "alto", re: /(localStorage|sessionStorage)\.setItem\([^)]*(token|senha|password|pat)\b/i, why: "token/senha guardados no navegador" },
  { id: "inline-handler-dinamico", sev: "médio", re: /\bon(click|error|load|change|input|submit)=(?:"[^"]*|'[^']*)\$\{/, why: "handler inline com dado interpolado" },
  { id: "javascript-url", sev: "alto", re: /(href|src)=["']\s*javascript:/i, why: "URL javascript:" },
  { id: "whatsapp-placeholder", sev: "baixo", re: /5519999999999/, why: "número de WhatsApp de exemplo" },
];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const scan = line.replace(/\$\{THUMB\}/g, ""); // constante interna (SVG codificado), não é dado externo
    for (const r of rules) if (r.test ? r.test(scan) : r.re.test(scan)) add(r.sev, f, i + 1, r.id, line);
    // innerHTML com interpolação que não passa por função de escape conhecida
    if (process.argv.includes("--verbose") && (/(innerHTML|insertAdjacentHTML|outerHTML)\s*(\+?=|\()/.test(line) || /`[^`]*<[a-z][^`]*\$\{/.test(line))) {
      const exprs = [...line.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map((m) => m[1].trim());
      for (const e of exprs) {
        const safe = /^(esc|escapeHtml|escapeAttr|escapeXml|brl|currency|formatPrice|safeHttps|fmt|String\(Number|Number\(|Math\.|i\b|index\b|idx\b|count\b|qty\b|n\b)/.test(e)
          || /^["'`][^"'`$]*["'`]$/.test(e) || /\.(toFixed|length)\b/.test(e) && !/\.name|\.title/.test(e)
          || /^[a-zA-Z_.]*\?\s*["'`][^$]*["'`]\s*:\s*["'`][^$]*["'`]$/.test(e) || /^\(?[^()]*\)?\s*\?\s*["'`][^"'`]*["'`]\s*:\s*["'`][^"'`]*["'`]$/.test(e);
        if (!safe) add("revisar", f, i + 1, "interpolação-sem-escape", `\${${e}}  ←  ${line.trim().slice(0, 80)}`);
      }
    }
  });
}
const order = { alto: 0, médio: 1, baixo: 2, revisar: 3 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
const count = (s) => findings.filter((f) => f.sev === s).length;
for (const f of findings) console.log(`[${f.sev.toUpperCase()}] ${f.file}:${f.line}  ${f.rule}\n    ${f.text}`);
console.log(`\n${files.length} arquivos • alto: ${count("alto")} • médio: ${count("médio")} • baixo: ${count("baixo")} • revisar: ${count("revisar")}`);
process.exit(count("alto") + count("médio") > 0 ? 1 : 0);
