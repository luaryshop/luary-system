// Núcleo compartilhado das páginas da loja (carrinho e checkout): Firebase, carrinho, cupom e catálogo.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { couponDiscount, norm } from "./pricing.js";
import { lineFromProduct, normalizeSettings } from "./order-calc.js";

export const firebaseConfig = { apiKey: "AIzaSyCanlMwdfuD9gmVt62nJYYetj4K2-BfWEc", authDomain: "luary-system.firebaseapp.com", projectId: "luary-system", storageBucket: "luary-system.firebasestorage.app", messagingSenderId: "996287172742", appId: "1:996287172742:web:4ff8c22a01cabe4015c107" };
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const CART_KEY = "luary-atacado-cart-v1";   // mesmo formato do mini-carrinho da home: { productId: quantidade }
export const COUPON_KEY = "luary-cart-coupon-v1";
export const $ = (id) => document.getElementById(id);
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const safeHttps = (u) => { try { return new URL(u).protocol === "https:" ? new URL(u).href : ""; } catch { return ""; } };
export const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#e9e4d9"/><text x="60" y="68" font-family="Georgia,serif" font-size="30" fill="#b28a4b" text-anchor="middle">L</text></svg>');

const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("Armazenamento indisponível.", e); } };

export const readCart = () => { const c = read(CART_KEY, {}); return c && typeof c === "object" && !Array.isArray(c) ? c : {}; };
export const saveCart = (cart) => write(CART_KEY, cart);
export const cartCount = (cart = readCart()) => Object.values(cart).reduce((a, q) => a + (Number(q) || 0), 0);
export const getCouponCode = () => String(read(COUPON_KEY, "") || "");
export const setCouponCode = (code) => { try { code ? localStorage.setItem(COUPON_KEY, JSON.stringify(norm(code))) : localStorage.removeItem(COUPON_KEY); } catch {} };
export const clearCart = () => { try { localStorage.removeItem(CART_KEY); localStorage.removeItem(COUPON_KEY); } catch {} };

// Catálogo + promoções automáticas vigentes + configurações comerciais.
export async function loadStore() {
  const [productsSnap, settingsSnap] = await Promise.all([getDocs(collection(db, "products")), getDoc(doc(db, "siteSettings", "public")).catch(() => null)]);
  let promotions = [];
  try {
    const snap = await getDocs(query(collection(db, "promotions"), where("kind", "==", "automatic"), where("active", "==", true)));
    promotions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn("Promoções indisponíveis; usando preços normais.", e); }
  const rawSettings = settingsSnap && settingsSnap.exists() ? settingsSnap.data() : {};
  const settings = normalizeSettings(rawSettings);
  // Quantidade mínima: a do produto vale; sem ela, vale o padrão da empresa.
  const products = productsSnap.docs.map((d) => { const p = { id: d.id, ...d.data() }; if (!(Number(p.minQty) > 0)) p.minQty = settings.defaultMinQty; return p; });
  return { products, promotions, rawSettings, settings };
}

// Cupons ficam em promotions/cp_{CÓDIGO}: leitura direta por ID (a listagem pública só devolve promoções automáticas).
export async function fetchCoupon(code) {
  const c = norm(code);
  if (!/^[A-Z0-9_-]{3,30}$/.test(c)) return null;
  try { const snap = await getDoc(doc(db, "promotions", "cp_" + c)); return snap.exists() ? { id: snap.id, ...snap.data() } : null; }
  catch (e) { console.warn("Cupom indisponível.", e); return null; }
}

// Transforma { productId: qty } em linhas de pedido (preços atuais). Produtos removidos do catálogo ficam em "missing".
export function resolveCart(cart, products, promotions) {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const lines = [], couponLines = [], missing = [];
  for (const [id, qty] of Object.entries(cart)) {
    const p = byId.get(String(id));
    if (!p) { missing.push(id); continue; }
    const line = lineFromProduct(p, qty, promotions);
    lines.push(line); couponLines.push({ product: p, quantity: line.qty, unit: line.unitPrice });
  }
  lines.sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR", { numeric: true, sensitivity: "base" }));
  return { lines, couponLines, missing };
}

// Valida o cupom guardado contra o carrinho atual. Retorna { coupon: {code,name,discount}|null, message }.
export async function resolveCoupon(code, couponLines) {
  if (!code) return { coupon: null, message: "" };
  const promo = await fetchCoupon(code);
  const result = couponDiscount(code, couponLines, promo ? [promo] : []);
  if (!result.ok) return { coupon: null, message: result.reason || "Cupom inválido." };
  return { coupon: { code: norm(code), name: result.promo?.name || "", discount: result.discount }, message: "" };
}
