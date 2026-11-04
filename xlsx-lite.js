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
  const objs = toObjects(rows.map((cells, i) => ({ rn: i + 1, cells })));
  // Linhas com mais/menos colunas que o cabeçalho = texto com o separador dentro sem aspas (colunas deslocadas)
  const headRow = rows.find((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const width = headRow ? headRow.length : 0;
  const bad = [];
  rows.forEach((r, i) => { const used = r.length; let n = used; while (n > 0 && String(r[n - 1] ?? "").trim() === "") n--; if (r !== headRow && n > 0 && (n > width)) bad.push(i + 1); });
  const broken = headRow ? headRow.filter((h) => String(h).split("(").length !== String(h).split(")").length) : [];
  if (broken.length) bad.push("cabeçalho");
  objs.warnings = [];
  if (broken.length) objs.warnings.push(`O cabeçalho parece partido (${broken.slice(0, 2).map((h) => `"${String(h).trim()}"`).join(", ")}): um nome de coluna com ponto e vírgula foi dividido em dois e as colunas seguintes ficaram deslocadas. Baixe o modelo novo ou coloque esse nome entre aspas.`);
  const long = bad.filter((x) => x !== "cabeçalho");
  if (long.length) objs.warnings.push(`${long.length} linha(s) têm mais colunas que o cabeçalho (linhas ${long.slice(0, 5).join(", ")}${long.length > 5 ? "…" : ""}). Provável texto com ponto e vírgula sem aspas — as colunas seguintes ficam deslocadas.`);
  return { [sheetName]: objs };
}

// ---------- escrita de .xlsx (sem compressão, sem dependências) ----------
const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const xmlEsc = (v) => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
const colName = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function zipStore(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}
// sheets: [{ name, rows: [[...],[...]], widths?: [n,...], header?: true }]  — células: número, texto ou vazio
export function writeXlsx(sheets) {
  const sheetXml = (sh) => {
    const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      if (v === "" || v === null || v === undefined) return "";
      const ref = colName(c) + (r + 1), st = sh.header && r === 0 ? ' s="1"' : "";
      return typeof v === "number" && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const cols = sh.widths ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zipStore(files);
}
