// Motor de preços e promoções da Luary (sem dependências, usado pela vitrine e pelo painel).
//
// Modelo de promoção (coleção "promotions"):
//   kind      "automatic" (aplica direto no preço do produto) | "coupon" (aplica no pedido, com código)
//   type      "percent" | "fixed"        value  número > 0
//   scope     "all" | "categories" | "skus"   categories: [nomes]   skus: [SKU]
//   audience  "all" | "wholesale" | "retail"
//   coupon    código (só kind "coupon")   minOrder  pedido mínimo em R$ (só kind "coupon")
//   startsAt / endsAt  (ISO ou datetime-local)   priority  maior vence   active  boolean
//
// IMPORTANTE: tudo aqui roda no navegador e serve para EXIBIR preços. A validação que vale
// (checkout, cupom, limite de uso) precisa ser repetida no servidor — ver Fase 5/7.

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const norm = (s) => String(s ?? "").trim().toUpperCase();
export const toDate = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const promoKind = (p) => p?.kind || (norm(p?.coupon) ? "coupon" : "automatic");

// "active" | "scheduled" | "expired" | "inactive"
export function promoStatus(p, now = new Date()) {
  if (!p || p.active === false) return "inactive";
  const start = toDate(p.startsAt), end = toDate(p.endsAt);
  if (start && now < start) return "scheduled";
  if (end && now > end) return "expired";
  return "active";
}

export function appliesToProduct(p, product) {
  const scope = p.scope || "all";
  if (scope === "all") return true;
  if (scope === "categories") return (p.categories || []).map(norm).includes(norm(product?.category));
  if (scope === "skus") return (p.skus || []).map(norm).includes(norm(product?.sku || product?.reference));
  return false;
}

export const audienceAllows = (p, channel = "wholesale") => !p.audience || p.audience === "all" || p.audience === channel;

// Preço após aplicar a promoção a UM valor. Retorna null se o resultado for inválido (<= 0).
export function discountedPrice(price, p) {
  const base = Number(price), value = Number(p?.value);
  if (!(base > 0) || !(value > 0)) return null;
  const result = p.type === "fixed" ? base - value : base * (1 - value / 100);
  return result > 0 ? round2(result) : null;
}

// Preço unitário exibido na vitrine: melhor promoção automática vigente para o produto.
export function unitPrice(product, promos, { now = new Date(), channel = "wholesale", field = "priceWholesale" } = {}) {
  const original = Number(product?.[field]);
  if (!(original > 0)) return { original: null, final: null, promo: null, percentOff: 0 };
  const candidates = (promos || [])
    .filter((p) => promoKind(p) === "automatic" && !(Number(p.minOrder) > 0) && promoStatus(p, now) === "active" && audienceAllows(p, channel) && appliesToProduct(p, product))
    .map((p) => ({ promo: p, final: discountedPrice(original, p) }))
    .filter((c) => c.final !== null && c.final < original)
    .sort((a, b) => (Number(b.promo.priority) || 0) - (Number(a.promo.priority) || 0) || a.final - b.final);
  if (!candidates.length) return { original, final: original, promo: null, percentOff: 0 };
  const best = candidates[0];
  return { original, final: best.final, promo: best.promo, percentOff: Math.round((1 - best.final / original) * 100) };
}

// Cupom aplicado ao pedido. lines: [{ product, quantity, unit }]  (unit = preço unitário já com promoção automática)
export function couponDiscount(code, lines, promos, { now = new Date(), channel = "wholesale" } = {}) {
  const wanted = norm(code);
  if (!wanted) return { ok: false, reason: "Informe o cupom.", discount: 0, promo: null };
  const promo = (promos || []).find((p) => promoKind(p) === "coupon" && norm(p.coupon) === wanted);
  if (!promo) return { ok: false, reason: "Cupom não encontrado.", discount: 0, promo: null };
  const status = promoStatus(promo, now);
  if (status === "scheduled") return { ok: false, reason: "Este cupom ainda não está válido.", discount: 0, promo };
  if (status !== "active") return { ok: false, reason: "Este cupom não está mais disponível.", discount: 0, promo };
  if (!audienceAllows(promo, channel)) return { ok: false, reason: "Cupom indisponível para este tipo de compra.", discount: 0, promo };
  const total = round2(lines.reduce((s, l) => s + Number(l.unit) * Number(l.quantity), 0));
  const eligible = round2(lines.filter((l) => appliesToProduct(promo, l.product)).reduce((s, l) => s + Number(l.unit) * Number(l.quantity), 0));
  if (Number(promo.minOrder) > 0 && total < Number(promo.minOrder)) return { ok: false, reason: `Pedido mínimo para este cupom: R$ ${Number(promo.minOrder).toFixed(2).replace(".", ",")}.`, discount: 0, promo };
  if (eligible <= 0) return { ok: false, reason: "O cupom não se aplica aos itens do pedido.", discount: 0, promo };
  const raw = promo.type === "fixed" ? Number(promo.value) : eligible * (Number(promo.value) / 100);
  const discount = round2(Math.min(raw, eligible - 0.01 > 0 ? eligible - 0.01 : eligible));
  return { ok: discount > 0, reason: discount > 0 ? "" : "Cupom inválido.", discount, promo };
}

// Validação do cadastro (usada pelo painel). Retorna lista de mensagens; vazia = válido.
export function validatePromotion(p, { existing = [], selfId = null } = {}) {
  const errors = [];
  const value = Number(p.value);
  if (!String(p.name || "").trim()) errors.push("Informe o nome da campanha.");
  if (!(value > 0)) errors.push("O valor do desconto deve ser maior que zero.");
  if (p.type === "percent" && value >= 100) errors.push("Desconto percentual deve ser menor que 100%.");
  const start = toDate(p.startsAt), end = toDate(p.endsAt);
  if (start && end && end <= start) errors.push("O término deve ser depois do início.");
  const kind = promoKind(p);
  if (kind === "coupon") {
    const code = norm(p.coupon);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) errors.push("Cupom: use de 3 a 30 letras, números, hífen ou _ (sem espaços).");
    else if (existing.some((o) => o.id !== selfId && promoKind(o) === "coupon" && norm(o.coupon) === code)) errors.push("Já existe um cupom com este código.");
  }
  if (p.scope === "categories" && !(p.categories || []).length) errors.push("Selecione ao menos uma categoria.");
  if (p.scope === "skus" && !(p.skus || []).length) errors.push("Informe ao menos um SKU.");
  return errors;
}

export const parseSkus = (text) => [...new Set(String(text || "").split(/[\s,;]+/).map(norm).filter(Boolean))];
export const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
