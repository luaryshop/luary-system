# Como atualizar o Luary (site + Firebase)

## 1. Publicar os arquivos
1. Descompacte o zip e envie **todos** os arquivos da pasta `luary-system-main` para o repositório do site no GitHub (substituindo os antigos, incluindo os novos: `carrinho.html`, `checkout.html`, `pedidos.html`, `romaneio.html`, `order-calc.js`, `store-core.js`, `store.css`, `pricing.js`, `cdn.html`, `cdn-lib.js`).
2. Aguarde 1–2 minutos (GitHub Pages) e abra o site com Ctrl+F5.

## 2. Regras do Firestore (obrigatório para pedidos e cupons)
1. Acesse https://console.firebase.google.com → seu projeto → **Firestore Database → Regras**.
2. Abra `firestore.rules.sample`, copie o conteúdo e cole no editor.
3. Troque o e-mail do administrador (`ADMIN_EMAIL_AQUI`) pelo e-mail que você usa para entrar no painel.
4. Clique em **Simular** (Rules Playground) e teste: leitura anônima de `products` (permitida) e de `orders` (negada).
5. Clique em **Publicar**.

## 3. Administradores (Authentication)
Em **Authentication → Users**, confirme que seu e-mail existe. Só ele (o da regra) acessa Pedidos, Conteúdo e Produtos.

## 4. Domínio autorizado
Em **Authentication → Settings → Domínios autorizados**, confirme `luaryshop.github.io`.

## 5. Configurar a loja (painel → Conteúdo do Site)
1. **Empresa e Identidade**: WhatsApp da empresa (com DDD), pedido mínimo, **quantidade mínima por SKU**, desconto PIX, frete. Clique em **Salvar dados**.
2. **Marketplaces**: se a Shopee não estiver na lista, clique em *Cadastrar Shopee no painel*. Cadastre os demais canais.
3. **Banners**: clique em *Cadastrar imagem atual do topo* para poder trocar/excluir a imagem principal. Novos banners: escolha "Carrossel" ou "Imagem de fundo do topo".
4. **Cupons antigos**: abra cada cupom e clique em Salvar de novo (passa a usar o novo formato).
5. **Produtos** (admin.html): preencha "Quantidade mínima" só nos SKUs com mínimo diferente do padrão.

## 6. Testar de ponta a ponta
1. No site, adicione peças, vá em **Meu pedido → Continuar**, preencha e envie.
2. Confira a mensagem no WhatsApp e o pedido em `pedidos.html`.
3. Imprima um romaneio e confira os valores (os preços são calculados no navegador; confira antes de aprovar).

---

## 7. SEO e compartilhamento (Fase 6)
1. Painel → **Conteúdo do Site → SEO e redes sociais**: confira o endereço público da loja, título, descrição e imagem de compartilhamento (JPG 1200×630, publicada na CDN). Salve.
2. **Categorias**: preencha título/descrição SEO e a imagem de cada categoria (opcional). **Produtos**: título/descrição SEO (opcional).
3. Clique em **Baixar pacote SEO (.zip)**, descompacte e envie para a raiz do site no GitHub: `sitemap.xml`, `robots.txt` e a pasta `p/` (uma página por produto, com a prévia do WhatsApp/Facebook).
   Refaça isso quando cadastrar produtos novos ou mudar nome/foto/descrição.
4. Volte em SEO e marque **"Já publiquei as páginas de compartilhamento"** para o botão *Compartilhar* usar o link `p/SKU.html`.
5. Google: em https://search.google.com/search-console adicione o site e envie o `sitemap.xml`.
6. Teste a prévia: cole o link de um produto no WhatsApp, ou use https://developers.facebook.com/tools/debug/ (clique em "Coletar novamente" após mudanças).

Observações: o GitHub Pages de projeto (`usuario.github.io/projeto`) só aceita `robots.txt` na raiz do domínio; com domínio próprio ele passa a valer. Fotos em WebP podem não aparecer em algumas redes — por isso a imagem padrão é JPG; para a prévia de produtos, prefira também publicar uma versão JPG da foto principal.

---

## 8. Segurança e publicação (Fase 7)

### Antes de publicar
1. Troque o e-mail de exemplo em `firestore.rules` (`SEU_EMAIL_ADMIN@exemplo.com`) pelo e-mail do seu login do painel (pode listar mais de um, separados por vírgula).
2. Firebase → Firestore → **Regras** → cole o arquivo → **Simulador de regras** → faça estes testes antes de **Publicar**:
   | Teste | Esperado |
   |---|---|
   | Ler `products/qualquer` sem login | permitido |
   | Ler `siteSettings/public` sem login | permitido |
   | Ler `siteSettings/outro` sem login | **negado** |
   | Listar `orders` sem login | **negado** |
   | Criar `orders/LUA-261101-ABCD` sem login, com os campos do pedido | permitido |
   | Criar pedido com `status: "Aprovado"` | **negado** |
   | Atualizar/excluir `orders/…` sem login | **negado** |
   | Ler `promotions/cp_CODIGO` sem login (leitura por ID) | permitido |
   | Listar `promotions` sem login, sem filtro | **negado** |
   | Gravar em `products` sem login | **negado** |
   | Gravar em `products` logado com o e-mail admin | permitido |
   | Ler `adminLogs` sem login | **negado** |
3. Firebase → **Authentication → Configurações → Ações do usuário**: desative **"Permitir criação (cadastro)"**. Sem isso, qualquer pessoa poderia criar uma conta usando a chave pública do site.
4. Google Cloud Console → **APIs e serviços → Credenciais** → sua chave de API do navegador → **Restrições de aplicativos: Referenciadores HTTP** → adicione `https://luaryshop.github.io/*` (e seu domínio próprio, se houver).
5. (Recomendado quando houver volume de pedidos) Firebase → **App Check** → registre o site com reCAPTCHA v3 e ative a imposição no Firestore, para barrar robôs que criam pedidos falsos.
6. Cada administrador deve usar senha forte; ative verificação em duas etapas na conta Google do projeto.

### Verificação automática (no seu computador)
```
npm install
npx playwright install chromium
npm run verify      # auditoria + checagem de arquivos + todos os testes
```
- `npm run audit` procura padrões perigosos no código (eval, links sem rel, segredos, handlers inline com dados).
- `npm run check` confere arquivos referenciados, noindex nas páginas internas, CSP nas páginas públicas e pendências (e-mail de exemplo nas regras etc.).
- `npm test` roda a suíte completa (~330 verificações), incluindo testes de injeção de HTML/JS em todos os campos.
- No GitHub, o arquivo `.github/workflows/ci.yml` roda tudo isso a cada envio.

### Rotina
- **Backup:** Conteúdo → *Backup e histórico* → baixe um backup semanal (e antes de reajustes de preço em massa). O arquivo com pedidos contém dados pessoais de clientes: guarde com cuidado.
- **Histórico:** a mesma aba mostra quem alterou o quê (preços em massa, exclusões, promoções, backups).
- **Pedidos:** os valores são calculados no navegador do cliente; confira sempre o pedido antes de aprovar.

### Limites conhecidos
- As regras do Firestore não conseguem recalcular o preço do pedido; a conferência é humana.
- Não há limite de pedidos por visitante sem o App Check.
- As telas do painel usam o Tailwind por CDN (sem CSP rígida); as páginas públicas (loja, carrinho e checkout) têm CSP.
