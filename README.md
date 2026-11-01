# Luary System

Loja estática (HTML + Firebase Firestore) com painel administrativo.

| Página | Função |
|---|---|
| `index.html` | Vitrine pública (catálogo, marketplaces, banners, SEO) |
| `carrinho.html` / `checkout.html` | Pedido enviado ao WhatsApp da empresa e salvo em `orders` |
| `content-admin.html` | Empresa, SEO, banners, marketplaces, categorias, promoções, preços em massa, backup |
| `admin.html` | Produtos |
| `cdn.html` | Imagens no GitHub + jsDelivr |
| `pedidos.html` / `romaneio.html` | Pedidos e impressão de romaneios |

Guia de publicação e segurança: [`PASSO-A-PASSO-FIREBASE.md`](PASSO-A-PASSO-FIREBASE.md).
Regras do Firestore: [`firestore.rules`](firestore.rules).

```
npm install && npx playwright install chromium
npm run verify
```
