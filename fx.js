// Efeitos modernos da vitrine (sem dependências). Tudo é opcional: se este arquivo falhar, a loja funciona igual.
const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;
let level = "full";
export const fxLevel = () => (reduceMq.matches ? "off" : level);
export function setFxLevel(v) { level = ["full", "soft", "off"].includes(v) ? v : "full"; root.dataset.fx = fxLevel(); }
reduceMq.addEventListener?.("change", () => { root.dataset.fx = fxLevel(); });
const raf = (fn) => requestAnimationFrame(fn);

// ---------- palavras do título do hero ----------
function splitWords(el) {
  if (!el || el.dataset.fxSplit) return;
  el.dataset.fxSplit = "1";
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span"), s = document.createElement("span");
          w.className = "fx-word"; w.setAttribute("aria-hidden", "true");
          s.textContent = part; s.style.setProperty("--i", String(i++));
          w.appendChild(s); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
    });
  };
  walk(el);
}

// ---------- revelar ao rolar ----------
const REVEAL = ".section-heading,.promise-strip>*,.wholesale-content,.wholesale-art,.retail-copy,.retail-card,.about-inner,.instagram-heading,.instagram-post-card,.product-card";
let io = null;
function enhance(scope = document) {
  scope.querySelectorAll(".product-card").forEach((card) => {
    const photo = card.querySelector(".product-photo");
    if (photo && !photo.querySelector(".fx-glare")) { const g = document.createElement("span"); g.className = "fx-glare"; g.setAttribute("aria-hidden", "true"); photo.appendChild(g); }
  });
  if (!io) return;
  scope.querySelectorAll(REVEAL).forEach((el) => {
    if (el.dataset.fx) return;
    el.dataset.fx = "1";
    const siblings = [...(el.parentElement?.children || [])].filter((x) => x.matches(REVEAL));
    el.style.setProperty("--d", Math.min(siblings.indexOf(el), 9) * 70 + "ms");
    el.classList.add("fx-reveal");
    io.observe(el);
  });
}

// ---------- barra de leitura + cabeçalho ----------
function bindScroll() {
  const bar = document.createElement("div"); bar.className = "fx-progress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar);
  const header = document.querySelector(".site-header");
  let lastY = scrollY, ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    bar.style.setProperty("--p", Math.min(1, y / max).toFixed(4));
    if (header) {
      header.classList.toggle("is-scrolled", y > 24);
      const dy = y - lastY;
      if (fxLevel() === "full" && y > 180 && dy > 6) header.classList.add("is-hidden");
      else if (dy < -6 || y <= 180) header.classList.remove("is-hidden");
    }
    lastY = y;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; raf(update); } }, { passive: true });
  update();
}

// ---------- inclinação 3D nos cartões + botões magnéticos ----------
function bindPointer() {
  let lastCard = null;
  const reset = (card) => { const p = card?.querySelector(".product-photo"); if (p) { p.style.setProperty("--rx", "0deg"); p.style.setProperty("--ry", "0deg"); } };
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || fxLevel() !== "full") return;
    const card = e.target.closest?.(".product-card");
    if (lastCard && lastCard !== card) reset(lastCard);
    lastCard = card || null;
    if (card) {
      const p = card.querySelector(".product-photo"); if (!p) return;
      const r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      p.style.setProperty("--ry", ((x - .5) * 9).toFixed(2) + "deg");
      p.style.setProperty("--rx", ((.5 - y) * 9).toFixed(2) + "deg");
      p.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); p.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    }
    const mag = e.target.closest?.(".button-dark,.header-quote-button");
    document.querySelectorAll(".fx-magnet.is-pulled").forEach((m) => { if (m !== mag) m.classList.remove("is-pulled"); });
    if (mag) {
      mag.classList.add("fx-magnet", "is-pulled");
      const r = mag.getBoundingClientRect();
      mag.style.setProperty("--tx", ((e.clientX - (r.left + r.width / 2)) * .14).toFixed(1) + "px");
      mag.style.setProperty("--ty", ((e.clientY - (r.top + r.height / 2)) * .22).toFixed(1) + "px");
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { reset(lastCard); document.querySelectorAll(".fx-magnet.is-pulled").forEach((m) => m.classList.remove("is-pulled")); }, true);
}

// ---------- foto voa até o carrinho ----------
function bindCart() {
  document.addEventListener("luary:added", (e) => {
    const lv = fxLevel(); if (lv === "off") return;
    const btn = document.getElementById("open-cart-btn"), badge = document.getElementById("cart-count");
    const pop = () => { if (badge) { badge.classList.remove("fx-pop"); void badge.offsetWidth; badge.classList.add("fx-pop"); } if (btn) { btn.classList.remove("fx-ring"); void btn.offsetWidth; btn.classList.add("fx-ring"); } };
    const d = e.detail || {}, r = d.rect;
    if (lv !== "full" || !d.src || !r || !btn || !btn.animate) { pop(); return; }
    const t = btn.getBoundingClientRect();
    const size = Math.min(150, Math.max(70, Math.min(r.width, r.height) * .45));
    const img = document.createElement("img"); img.className = "fx-fly"; img.alt = ""; img.src = d.src;
    img.style.cssText = `left:${r.left + r.width / 2 - size / 2}px;top:${r.top + r.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
    document.body.appendChild(img);
    const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
    const anim = img.animate([
      { transform: "translate3d(0,0,0) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
      { transform: `translate3d(${dx * .35}px,${dy * .35 - 90}px,0) scale(.8) rotate(-8deg)`, opacity: 1, offset: .45 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(.12) rotate(14deg)`, opacity: .25, offset: 1 },
    ], { duration: 820, easing: "cubic-bezier(.5,.05,.25,1)" });
    anim.onfinish = () => { img.remove(); pop(); };
    anim.oncancel = () => img.remove();
  });
}

export function initFx() {
  if (initFx.done) return; initFx.done = true;
  root.dataset.fx = fxLevel();
  splitWords(document.querySelector(".hero h1"));
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: .1, rootMargin: "0px 0px -5% 0px" });
  }
  enhance();
  for (const id of ["products-grid", "retail-cards"]) { const el = document.getElementById(id); if (el) new MutationObserver(() => raf(() => enhance(el))).observe(el, { childList: true }); }
  new MutationObserver(() => raf(() => enhance())).observe(document.body, { childList: true, subtree: true });
  // rede de segurança: nada fica invisível se o observador falhar
  setTimeout(() => document.querySelectorAll(".fx-reveal:not(.is-in)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight * 1.5) el.classList.add("is-in"); }), 4500);
  bindScroll(); bindPointer(); bindCart();
}

// ---------- carrossel de banners ----------
const EFFECTS = ["kenburns", "zoom", "pan", "none"], TRANSITIONS = ["fade", "slide", "wipe", "zoom", "blur"];
const AUTO_EFFECT = ["kenburns", "zoom", "pan"], AUTO_TRANS = ["fade", "wipe", "slide", "zoom", "blur"];
const pick = (v, list, auto, i) => { const s = String(v || "").toLowerCase(); return list.includes(s) ? s : auto[i % auto.length]; };

export function mountBanners({ box, track, dots, banners, esc, safe, duration = 6500 }) {
  box.classList.add("fx-stage");
  track.setAttribute("role", "region"); track.setAttribute("aria-roledescription", "carrossel"); track.setAttribute("aria-label", "Destaques e campanhas"); track.tabIndex = 0;
  track.innerHTML = banners.map((b, i) => {
    const caption = String(b.caption || "").trim().slice(0, 90), cta = String(b.buttonLabel || "").trim().slice(0, 26);
    const link = safe(b.linkUrl);
    const media = `<div class="bn-media"><img src="${esc(safe(b.imageUrl))}" alt="${esc(b.alt || b.title || "Banner Luary")}" ${i === 0 ? "" : 'loading="lazy"'} draggable="false"></div><div class="bn-shade${caption ? "" : " is-empty"}"></div>`;
    const cap = caption ? `<div class="bn-caption"><h3>${esc(caption)}</h3>${cta && link ? `<span class="bn-cta">${esc(cta)}</span>` : ""}</div>` : "";
    const effect = pick(b.effect, EFFECTS, AUTO_EFFECT, i), trans = pick(b.transition, TRANSITIONS, AUTO_TRANS, i);
    const attrs = `class="banner-slide" data-i="${i}" data-effect="${effect}" data-transition="${trans}" data-leave="${trans === "slide" ? "slide" : "fade"}"`;
    return link ? `<a ${attrs} href="${esc(link)}" rel="noopener noreferrer">${media}${cap}</a>` : `<div ${attrs}>${media}${cap}</div>`;
  }).join("");
  const slides = [...track.querySelectorAll(".banner-slide")];
  let cur = 0;
  slides[0].classList.add("is-active");
  const many = slides.length > 1;
  dots.innerHTML = many ? slides.map((_, i) => `<button type="button" data-banner-dot="${i}" aria-label="Banner ${i + 1}" class="${i === 0 ? "active" : ""}"></button>`).join("") : "";
  box.style.setProperty("--bn-dur", duration + "ms");
  const static_ = () => fxLevel() === "off" || !many;
  box.classList.toggle("is-static", static_());
  if (many) {
    track.insertAdjacentHTML("beforeend", '<button type="button" class="bn-arrow bn-prev" aria-label="Banner anterior"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="bn-arrow bn-next" aria-label="Próximo banner"><i class="fa-solid fa-chevron-right"></i></button>');
  }
  function go(i, dir = 1) {
    i = (i + slides.length) % slides.length;
    if (i === cur) return;
    const prev = slides[cur], next = slides[i];
    slides.forEach((s) => { if (s !== prev && s !== next) s.classList.remove("is-active", "is-leaving"); });
    prev.classList.remove("is-active"); prev.style.setProperty("--dir", dir); prev.classList.add("is-leaving");
    next.classList.remove("is-leaving"); next.style.setProperty("--dir", dir); next.classList.add("is-active");
    cur = i;
    clearTimeout(go.t); go.t = setTimeout(() => prev.classList.remove("is-leaving"), 1150);
    dots.querySelectorAll("button").forEach((d, k) => d.classList.toggle("active", k === i));
  }
  dots.addEventListener("click", (e) => { const b = e.target.closest("[data-banner-dot]"); if (b) { const i = Number(b.dataset.bannerDot); go(i, i >= cur ? 1 : -1); } });
  track.addEventListener("click", (e) => { const a = e.target.closest(".bn-arrow"); if (a) { e.preventDefault(); go(cur + (a.classList.contains("bn-next") ? 1 : -1), a.classList.contains("bn-next") ? 1 : -1); } });
  track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { go(cur + 1, 1); e.preventDefault(); } if (e.key === "ArrowLeft") { go(cur - 1, -1); e.preventDefault(); } });
  // arrastar com o dedo/mouse
  let x0 = null, moved = false;
  track.addEventListener("pointerdown", (e) => { if (e.target.closest(".bn-arrow")) return; x0 = e.clientX; moved = false; });
  addEventListener("pointerup", (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 48) { moved = true; go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); } });
  track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
  // autoplay guiado pela barra de progresso da bolinha ativa (pausa com mouse, foco ou aba oculta)
  dots.addEventListener("animationend", (e) => { if (e.target.matches("button.active") && !static_()) go(cur + 1, 1); });
  const pause = (on) => box.classList.toggle("is-paused", on);
  box.addEventListener("mouseenter", () => pause(true)); box.addEventListener("mouseleave", () => pause(false));
  box.addEventListener("focusin", () => pause(true)); box.addEventListener("focusout", () => pause(false));
  document.addEventListener("visibilitychange", () => pause(document.hidden));
  return { go, get index() { return cur; } };
}
