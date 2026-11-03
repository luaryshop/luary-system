// Leitor mínimo de planilhas — sem dependências externas (roda no navegador e no node 18+).
//   readXlsx(arrayBuffer) → { "Nome da aba": [ { coluna: valor, __row: nº da linha }, ... ] }
//   readCsv(texto)        → { "Planilha": [ ... ] }   (separador ; , ou TAB detectado sozinho)
// Lê o VALOR gravado (fórmulas entram com o último resultado calculado). Só leitura.

const MAX_BYTES = 60 * 1024 * 1024, MAX_ROWS = 20000, MAX_COLS = 200;
const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true);
const dec = new TextDecoder("utf-8");

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Lê o diretório central do .zip e devolve { nome: () => Promise<Uint8Array> }
function zipEntries(buf) {
  const bytes = new Uint8Array(buf), view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo inválido: não parece um .xlsx.");
  const count = u16(view, eocd + 10); let p = u32(view, eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) throw new Error("Arquivo .xlsx corrompido.");
    const method = u16(view, p + 10), csize = u32(view, p + 20), usize = u32(view, p + 24), nlen = u16(view, p + 28), elen = u16(view, p + 30), clen = u16(view, p + 32), off = u32(view, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    if (usize > MAX_BYTES) throw new Error("Arquivo grande demais.");
    out[name] = async () => {
      const lnlen = u16(view, off + 26), lelen = u16(view, off + 28), start = off + 30 + lnlen + lelen;
      const data = bytes.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error("Compressão não suportada no .xlsx.");
    };
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch { return ""; } }
  return ENT[e.toLowerCase()] ?? m;
});
const textOf = (xml) => { let t = ""; for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += m[1]; return unxml(t); };
const colIndex = (letters) => letters.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function parseSheet(xml, shared) {
  const rows = [];
  let count = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (++count > MAX_ROWS + 1) throw new Error(`Planilha com mais de ${MAX_ROWS} linhas.`);
    const rn = Number((rm[1].match(/\br="(\d+)"/) || [])[1]) || count;
    const cells = [];
    for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Za-z]+)\d*"/) || [])[1]; if (!ref) continue;
      const idx = colIndex(ref); if (idx >= MAX_COLS) continue;
      const type = (attrs.match(/\bt="(\w+)"/) || [])[1];
      let value = "";
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (type === "inlineStr") value = textOf(body);
      else if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "b") value = v === "1";
      else if (v !== undefined) value = type === "str" || type === "e" ? unxml(v) : (Number.isFinite(Number(v)) ? Number(v) : unxml(v));
      cells[idx] = value;
    }
    rows.push({ rn, cells });
  }
  return rows;
}
function toObjects(rows) {
  const head = rows.find((r) => r.cells.some((c) => String(c ?? "").trim() !== ""));
  if (!head) return [];
  const names = [], seen = new Map();
  head.cells.forEach((c, i) => {
    let n = String(c ?? "").trim(); if (!n) return;
    const k = seen.get(n) || 0; seen.set(n, k + 1); if (k) n = `${n} (${k + 1})`;
    names[i] = n;
  });
  const out = [];
  for (const r of rows) {
    if (r.rn <= head.rn) continue;
    const o = { __row: r.rn }; let any = false;
    names.forEach((n, i) => { if (!n) return; const v = r.cells[i]; o[n] = v === undefined ? "" : v; if (String(o[n]).trim() !== "") any = true; });
    if (any) out.push(o);
  }
  return out;
}

export async function readXlsx(buf) {
  const files = zipEntries(buf);
  const text = async (name) => (files[name] ? dec.decode(await files[name]()) : "");
  const wb = await text("xl/workbook.xml");
  if (!wb) throw new Error("Arquivo inválido: não é uma planilha .xlsx (o .xls antigo não é suportado — salve como .xlsx ou .csv).");
  const rels = await text("xl/_rels/workbook.xml.rels");
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) { const id = (m[1].match(/\bId="([^"]+)"/) || [])[1], t = (m[1].match(/\bTarget="([^"]+)"/) || [])[1]; if (id && t) target[id] = t.replace(/^\/?(xl\/)?/, "xl/"); }
  const sst = await text("xl/sharedStrings.xml");
  const shared = [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => textOf(m[1] || ""));
  const sheets = {};
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unxml((m[1].match(/\bname="([^"]*)"/) || [])[1] || ""), rid = (m[1].match(/\br:id="([^"]+)"/) || [])[1];
    const path = target[rid]; if (!name || !path || !files[path]) continue;
    sheets[name] = toObjects(parseSheet(dec.decode(await files[path]()), shared));
  }
  return sheets;
}

export function readCsv(text, sheetName = "Planilha") {
  const src = String(text ?? "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => first.split(ch).length - 1;
  const sep = [";", "\t", ","].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; if (rows.length > MAX_ROWS + 1) throw new Error(`Planilha com mais de ${MAX_ROWS} linhas.`); }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return { [sheetName]: toObjects(rows.map((cells, i) => ({ rn: i + 1, cells }))) };
}
