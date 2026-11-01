#!/usr/bin/env node
// Executa toda a suíte: testes unitários (node) e de navegador (Playwright, com Firebase simulado).
// Uso: node tests/run.mjs [filtro]      Requer: npm i -D playwright && npx playwright install chromium
import http from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = normalize(join(here, ".."));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end("404"); }
  try { res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file)); } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://localhost:${server.address().port}`;
const filter = process.argv[2] || "";
const files = readdirSync(here).filter((f) => /\.test\.m?js$/.test(f) && f.includes(filter)).sort();
let pass = 0, fail = 0; const bad = [];
for (const f of files) {
  const r = await new Promise((resolve) => {
    const child = spawn("node", [join(here, f)], { env: { ...process.env, BASE }, cwd: root });
    let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 300000);
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, out }); });
  });
  const out = r.out;
  const p = (out.match(/^PASS/gm) || []).length, fl = (out.match(/^FAIL/gm) || []).length;
  const crashed = r.status !== 0 && fl === 0;
  pass += p; fail += fl + (crashed ? 1 : 0);
  console.log(`${fl || crashed ? "✗" : "✓"} ${f.padEnd(34)} ${p} ok${fl ? `, ${fl} falha(s)` : ""}${crashed ? " — erro de execução" : ""}`);
  if (fl || crashed) { bad.push(f); console.log(out.split("\n").filter((l) => /^FAIL|Error|error/.test(l)).slice(0, 6).map((l) => "    " + l).join("\n")); }
}
server.close();
console.log(`\n${files.length} arquivos • ${pass} verificações ok • ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
