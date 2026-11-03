// Cálculo e montagem de pedidos da Luary (sem DOM e sem Firebase: testável e reutilizável).
//
// Ordem dos descontos:  preço de tabela → promoção automática (já no preço unitário)
//   → cupom (sobre o subtotal com promoções) → desconto PIX (sobre o que sobrou) → frete.
// Tudo é calculado no navegador. Como o pedido hoje é conferido por uma pessoa antes de
// qualquer cobrança (WhatsApp), o painel de pedidos sempre mostra os valores gravados para
// conferência; não existe pagamento automático.

import { round2, unitPrice, norm } from "./pricing.js";

export const ORDER_STATUSES = ["Novo", "Aprovado", "Entregue", "Cancelado"];
export const PAYMENT_METHODS = ["PIX", "Cartão"];
// Pedidos antigos podem ter "A combinar"; o painel ainda exibe/edita esse valor, mas a loja não oferece mais.
export const ALL_PAYMENT_LABELS = [...PAYMENT_METHODS, "A combinar"];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Configurações comerciais vindas de siteSettings/public (campos vazios = recurso desligado).
export function normalizeSettings(raw = {}) {
  return {
    pixDiscount: Math.min(90, Math.max(0, num(raw.pixDiscount))),
    shippingFlat: Math.max(0, num(raw.shippingFlat)),
    freeShippingFrom: Math.max(0, num(raw.freeShippingFrom)),
    minOrder: Math.max(0, num(raw.minOrder)),
    defaultMinQty: Math.max(1, Math.min(999, Math.trunc(num(raw.defaultMinQty)) || 1)),
    payments: (() => { const on = PAYMENT_METHODS.filter((m) => (m === "PIX" ? raw.payPix : raw.payCard) !== false); return on.length ? on : ["PIX"]; })(),
    cardNote: String(raw.cardNote || "").trim().slice(0, 120),
    cardInstallments: Math.max(0, Math.min(24, Math.trunc(num(raw.cardInstallments)) || 0)),
    storeName: String(raw.companyName || "Luary Shop").trim() || "Luary Shop",
    whatsapp: normalizePhone(raw.whatsapp),
  };
}

// Mantém só dígitos; números brasileiros sem DDI (10 ou 11 dígitos) ganham 55.
export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

// ---- Variações (Banho, Inicial, Cor...) ----
// O produto guarda `variations: { "Banho": ["Ouro","Prata"], "Inicial": ["A","B"] }` (grupos que o cliente escolhe).
// No carrinho cada combinação é uma linha: chave = `${productId}::Banho=Ouro|Inicial=A` (grupos em ordem alfabética).
const tok = (s) => String(s ?? "").replace(/[|=:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
export function productVariations(product) {
  const raw = product?.variations, out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [g, opts] of Object.entries(raw)) {
    const name = tok(g); const list = [...new Set((Array.isArray(opts) ? opts : []).map(tok).filter(Boolean))].slice(0, 60);
    if (name && list.length) out[name] = list;
  }
  return out;
}
// Cor da bolinha para opções de banho/cor conhecidas (null = sem bolinha). Só dados fixos, nunca vem do banco.
const SWATCHES = [[/\bouro ros|\brose\b|\brosa\b/, "#e0a58f"], [/\bouro\b|\bdourad[oa]s?\b|\bgold\b/, "#d4af37"], [/\bprata\b|\bpratead[oa]s?\b|\bsilver\b/, "#c4c7ce"], [/\bniquel\b|\brodio\b|\bgrafite cl/, "#b4b9c0"], [/\bgrafite\b|\bonix\b|\bpreto\b|\bnegro\b/, "#2b2e33"], [/\bcobre\b|\bbronze\b/, "#b87333"]];
export function variationSwatch(value) {
  const v = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hit = SWATCHES.find(([re]) => re.test(v));
  return hit ? hit[1] : null;
}
export const cartKey = (id, choice = {}) => {
  const parts = Object.keys(choice || {}).sort((a, b) => a.localeCompare(b, "pt-BR")).map((g) => `${tok(g)}=${tok(choice[g])}`).filter((p) => !p.startsWith("=") && !p.endsWith("="));
  return parts.length ? `${id}::${parts.join("|")}` : String(id);
};
export function splitCartKey(key) {
  const s = String(key), i = s.indexOf("::");
  if (i < 0) return { id: s, choice: {} };
  const choice = {};
  for (const part of s.slice(i + 2).split("|")) { const j = part.indexOf("="); if (j > 0) choice[part.slice(0, j)] = part.slice(j + 1); }
  return { id: s.slice(0, i), choice };
}
export const variantLabel = (choice = {}) => Object.keys(choice).sort((a, b) => a.localeCompare(b, "pt-BR")).map((g) => `${g}: ${choice[g]}`).join(" · ");
// Mantém só escolhas válidas. `complete` = todos os grupos do produto foram escolhidos.
export function validChoice(product, choice = {}) {
  const groups = productVariations(product), clean = {};
  for (const [g, opts] of Object.entries(groups)) if (opts.includes(tok(choice[g]))) clean[g] = tok(choice[g]);
  return { choice: clean, complete: Object.keys(groups).every((g) => clean[g] !== undefined) };
}

// Quantidade mínima por SKU (campo `minQty` do produto). Vazio/inválido = 1.
export const productMinQty = (product) => Math.max(1, Math.min(999, Math.trunc(num(product?.minQty)) || 1));

export function lineFromProduct(product, quantity, promos, { now, choice = {} } = {}) {
  const minQty = productMinQty(product);
  const qty = Math.max(minQty, Math.min(999, Math.trunc(num(quantity)) || 1));
  const info = unitPrice(product, promos, now ? { now } : {});
  const priced = info.final !== null && info.final > 0;
  const images = Array.isArray(product.images) ? product.images : [];
  const img = images.map((i) => (typeof i === "string" ? i : i?.url || "")).find(Boolean) || "";
  return {
    productId: String(product.id ?? ""),
    cartKey: cartKey(String(product.id ?? ""), choice),
    choice,
    variant: variantLabel(choice),
    sku: String(product.sku || product.reference || ""),
    name: String(product.name || "Peça Luary"),
    image: img,
    qty,
    minQty,
    priced,
    unitOriginal: priced ? round2(info.original) : 0,
    unitPrice: priced ? round2(info.final) : 0,
    promoName: info.promo ? String(info.promo.name || "") : "",
    subtotal: priced ? round2(info.final * qty) : 0,
  };
}

// lines: resultado de lineFromProduct;  coupon: { code, name, discount } | null
export function computeTotals({ lines, coupon = null, payment = "Cartão", settings = {} }) {
  const s = normalizeSettings(settings);
  const pieces = lines.reduce((a, l) => a + l.qty, 0);
  const subtotalOriginal = round2(lines.reduce((a, l) => a + (l.priced ? l.unitOriginal * l.qty : 0), 0));
  const subtotal = round2(lines.reduce((a, l) => a + l.subtotal, 0));
  const promoDiscount = round2(Math.max(0, subtotalOriginal - subtotal));
  const couponDiscount = round2(Math.min(Math.max(0, num(coupon?.discount)), Math.max(0, subtotal - 0.01)));
  const afterCoupon = round2(subtotal - couponDiscount);
  const pixPercent = payment === "PIX" ? s.pixDiscount : 0;
  const pixDiscount = round2(afterCoupon * (pixPercent / 100));
  const base = round2(afterCoupon - pixDiscount);

  let shipping = null, shippingMode = "tbd"; // tbd = "a combinar" (não entra no total)
  if (s.freeShippingFrom > 0 && afterCoupon >= s.freeShippingFrom) { shipping = 0; shippingMode = "free"; }
  else if (s.shippingFlat > 0) { shipping = s.shippingFlat; shippingMode = "fixed"; }

  const total = round2(Math.max(0, base + (shipping || 0)));
  const hasUnpriced = lines.some((l) => !l.priced);
  return {
    pieces, subtotalOriginal, promoDiscount, subtotal,
    couponCode: coupon?.code || "", couponName: coupon?.name || "", couponDiscount,
    pixPercent, pixDiscount, shipping, shippingMode, total,
    minOrder: s.minOrder, belowMin: s.minOrder > 0 && subtotal < s.minOrder, hasUnpriced,
  };
}

export function validateCustomer(f, { deliveryOptional = false } = {}) {
  const e = {};
  const t = (v) => String(v ?? "").trim();
  if (t(f.name).length < 3) e.name = "Informe seu nome completo.";
  const phone = String(f.whatsapp ?? "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 13) e.whatsapp = "Informe um WhatsApp válido com DDD.";
  if (t(f.city).length < 2) e.city = "Informe sua cidade.";
  if (!deliveryOptional) {
    if (t(f.street).length < 2) e.street = "Informe a rua.";
    if (!t(f.number)) e.number = "Informe o número (ou S/N).";
    if (t(f.district).length < 2) e.district = "Informe o bairro.";
    if (t(f.deliveryCity).length < 2) e.deliveryCity = "Informe a cidade da entrega.";
  }
  return e;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newOrderNumber(now = new Date(), rnd = Math.random) {
  const p = (n) => String(n).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return `LUA-${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${suffix}`;
}

// { method, installments?: {count, each} } — parcelas só existem no cartão.
function paymentInfo(method, installments) {
  const m = PAYMENT_METHODS.includes(method) ? method : "PIX";
  const n = Math.trunc(num(installments?.count));
  return m === "Cartão" && n > 1 ? { method: m, installments: n, installmentValue: round2(num(installments.each)) } : { method: m };
}
export function paymentText(payment = {}) {
  const base = String(payment.method || "—");
  return payment.installments > 1 ? `${base} — em até ${payment.installments}x de ${brl(payment.installmentValue)}` : base;
}

// Valor a pagar em cada forma habilitada (para o cliente escolher vendo o total).
export function paymentQuotes({ lines, coupon = null, settings = {} }) {
  const s = normalizeSettings(settings);
  return s.payments.map((method) => {
    const t = computeTotals({ lines, coupon, payment: method, settings });
    const n = method === "Cartão" ? s.cardInstallments : 0;
    return { method, total: t.total, pixDiscount: t.pixDiscount, pixPercent: t.pixPercent, shippingMode: t.shippingMode, installments: n > 1 ? { count: n, each: round2(t.total / n) } : null };
  });
}

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const safeHttps = (u) => { try { return new URL(u).protocol === "https:" ? String(u) : ""; } catch { return ""; } };

// Documento gravado em orders/{number}. (createdAt do servidor é acrescentado por quem grava.)
export function buildOrder({ number, form, lines, totals, deliveryOptional = false, source = "site", now = new Date(), installments = null }) {
  return {
    number, status: "Novo", source, createdAtIso: now.toISOString(),
    customer: { name: clip(form.name, 120), whatsapp: String(form.whatsapp ?? "").replace(/\D/g, "").slice(0, 15), city: clip(form.city, 80) },
    delivery: {
      arrangeLater: !!deliveryOptional,
      recipient: clip(form.recipient, 120), street: clip(form.street, 120), number: clip(form.number, 20),
      complement: clip(form.complement, 80), district: clip(form.district, 80), city: clip(form.deliveryCity, 80), state: clip(form.state, 2).toUpperCase(),
    },
    payment: paymentInfo(form.payment, installments),
    notes: clip(form.notes, 500),
    items: lines.map((l) => ({
      productId: clip(l.productId, 60), sku: clip(l.sku, 40), name: clip(l.variant ? `${l.name} — ${l.variant}` : l.name, 140), variant: clip(l.variant, 120), image: safeHttps(l.image),
      qty: l.qty, unitOriginal: l.unitOriginal, unitPrice: l.unitPrice, promoName: clip(l.promoName, 80), subtotal: l.subtotal,
    })),
    totals: {
      pieces: totals.pieces, subtotalOriginal: totals.subtotalOriginal, promoDiscount: totals.promoDiscount, subtotal: totals.subtotal,
      couponCode: totals.couponCode, couponName: clip(totals.couponName, 80), couponDiscount: totals.couponDiscount,
      pixPercent: totals.pixPercent, pixDiscount: totals.pixDiscount, extraDiscount: totals.extraDiscount || 0,
      shipping: totals.shipping, shippingMode: totals.shippingMode, total: totals.total,
    },
  };
}

// Recalcula os totais de um pedido já gravado após o painel editar itens/descontos/frete.
export function recalcOrder(order, { extraDiscount = 0, shipping = order.totals?.shipping } = {}) {
  const items = (order.items || []).map((i) => ({ ...i, qty: Math.max(1, Math.trunc(num(i.qty)) || 1), unitPrice: round2(num(i.unitPrice)), unitOriginal: round2(num(i.unitOriginal) || num(i.unitPrice)) }))
    .map((i) => ({ ...i, subtotal: round2(i.unitPrice * i.qty) }));
  const t = order.totals || {};
  const subtotal = round2(items.reduce((a, i) => a + i.subtotal, 0));
  const subtotalOriginal = round2(items.reduce((a, i) => a + i.unitOriginal * i.qty, 0));
  const couponDiscount = round2(Math.min(num(t.couponDiscount), Math.max(0, subtotal - 0.01)));
  const afterCoupon = round2(subtotal - couponDiscount);
  const pixDiscount = round2(afterCoupon * (num(t.pixPercent) / 100));
  const extra = round2(Math.min(Math.max(0, num(extraDiscount)), Math.max(0, afterCoupon - pixDiscount)));
  const ship = shipping === null || shipping === undefined ? null : round2(Math.max(0, num(shipping)));
  const total = round2(Math.max(0, afterCoupon - pixDiscount - extra + (ship || 0)));
  return {
    ...order, items,
    totals: { ...t, pieces: items.reduce((a, i) => a + i.qty, 0), subtotalOriginal, promoDiscount: round2(Math.max(0, subtotalOriginal - subtotal)), subtotal, couponDiscount, pixDiscount, extraDiscount: extra, shipping: ship, shippingMode: ship === null ? "tbd" : ship === 0 ? "free" : "fixed", total },
  };
}

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

// Mensagem do WhatsApp. Se não couber na URL, cai para a versão resumida (pedido completo está no painel).
export function buildWhatsappMessage(order, { storeName = "Luary Shop", saved = true, maxEncoded = 1800 } = {}) {
  const t = order.totals, c = order.customer, d = order.delivery;
  const head = [`*Novo pedido ${order.number} — ${storeName}*`, "", `*Cliente:* ${c.name}`, `*WhatsApp:* ${c.whatsapp}`, `*Cidade:* ${c.city}`];
  const addr = d.arrangeLater ? "a combinar no atendimento" : [d.recipient, [d.street, d.number].filter(Boolean).join(", "), d.complement, d.district, [d.city, d.state].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  head.push(`*Entrega:* ${addr}`);
  const tail = ["", `*Peças:* ${t.pieces}`, `*Subtotal:* ${brl(t.subtotal)}`];
  if (t.couponDiscount > 0) tail.push(`*Cupom ${t.couponCode}:* -${brl(t.couponDiscount)}`);
  if (t.pixDiscount > 0) tail.push(`*Desconto PIX (${t.pixPercent}%):* -${brl(t.pixDiscount)}`);
  if (t.extraDiscount > 0) tail.push(`*Desconto:* -${brl(t.extraDiscount)}`);
  tail.push(t.shippingMode === "tbd" ? "*Frete:* a combinar" : t.shipping === 0 ? "*Frete:* grátis" : `*Frete:* ${brl(t.shipping)}`);
  tail.push(`*Total:* ${brl(t.total)}${t.shippingMode === "tbd" ? " + frete" : ""}`, `*Pagamento:* ${paymentText(order.payment)}`);
  if (order.notes) tail.push(`*Obs.:* ${order.notes}`);
  if (!saved) tail.push("", "_(Pedido enviado só por aqui: confirmem os valores no atendimento.)_");

  const itemLine = (i) => `• ${i.sku || "s/ref"} — ${i.name} — ${i.qty}x ${i.unitPrice > 0 ? brl(i.unitPrice) : "valor a confirmar"}`;
  const build = (items, extra = []) => [...head, "", "*Itens:*", ...items.map(itemLine), ...extra, ...tail].join("\n");
  let msg = build(order.items);
  if (encodeURIComponent(msg).length <= maxEncoded) return msg;
  // Corta itens até caber; o restante fica registrado no painel.
  const items = [...order.items];
  while (items.length > 0) {
    items.pop();
    const hidden = order.items.length - items.length;
    msg = build(items, [`• … e mais ${hidden} item(ns)${saved ? " (lista completa no pedido " + order.number + ")" : ""}`]);
    if (encodeURIComponent(msg).length <= maxEncoded) return msg;
  }
  return [...head, ...tail].join("\n");
}

export const whatsappUrl = (phone, message) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
export { norm };
