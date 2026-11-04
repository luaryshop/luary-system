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

---

## 9. Fotos 1:1 e formas de pagamento
- **Fotos:** em `cdn.html`, o campo **Enquadramento** vem em *Automático*: produtos, categorias e subcategorias saem quadrados (1:1) com a foto inteira sobre fundo branco (a cor pode ser trocada); home e identidade mantêm a proporção. Para fotos já publicadas, abra o SKU e clique em **Padronizar fotos atuais em 1:1** e depois em **Publicar na CDN**.
- **Loja:** os cards, o modal, as miniaturas e o carrinho exibem a foto inteira em caixa quadrada, sem cortar, em desktop, tablet e celular.
- **Pagamento:** em **Conteúdo → Empresa e Identidade → Formas de pagamento no checkout**, ligue/desligue PIX, Cartão e "A combinar", defina o máximo de parcelas e o texto do cartão. Clique em **Salvar dados**.

## 10. Pagamento escolhido no carrinho (versão 2026.11.02-d)

- No resumo do carrinho o cliente escolhe **PIX** ou **Cartão** e já vê o valor a pagar (PIX com desconto; cartão com o valor da parcela). A escolha segue para o checkout.
- A opção "A combinar" foi removida do checkout. Pedidos antigos continuam exibindo o rótulo normalmente.
- Parcelas do cartão: painel `content-admin.html` → **Empresa** → "Formas de pagamento no checkout" → campo **Parcelas no cartão** (0 a 24; 0 = sem parcelamento).
- Para conferir que o novo arquivo foi publicado, abra o painel: ao lado de "Configurações, vitrines e campanhas" deve aparecer **versão 2026.11.02-d**. Se não aparecer, o GitHub ainda serve a versão antiga (envie todos os arquivos do zip e dê Ctrl+F5).

## 11. Categorias únicas, Variações e Importação (versão 2026.11.03-e)

**Republique as regras do Firestore** (arquivo `firestore.rules` deste zip): entrou a coleção `variationTypes` (grupos como Banho e Inicial, só o administrador acessa) e saiu `subcategories`. Firebase Console → Firestore Database → Regras → cole → Publicar. Sem isso, a aba **Variações** mostra "Sem permissão".

1. **Categorias:** só existem categorias. O cadastro de produto usa a lista de *Conteúdo do Site → Categorias*. Se algum produto antigo tiver uma categoria que não está cadastrada, aparece um aviso amarelo com o botão **Cadastrar todas agora**.
2. **Variações:** *Conteúdo do Site → Variações* → **Criar Banho e Inicial** (ou crie os seus: um item por linha, **Preencher A–Z** para iniciais). Depois, em *Produtos*, marque as opções que cada peça tem. Na loja o cliente escolhe uma opção de cada grupo antes de adicionar; cada combinação é uma linha própria do carrinho e do pedido.
3. **Importar:** abra `importar.html` (botão **Importar** no topo da Central) → envie o `.xlsx`/`.csv` → confira as categorias, a prévia e os avisos → **Importar**. Funciona com o *modelo de importação da Luary* e com a *Planilha Universal de Marketplaces* (abas Mestre_Produtos + Mestre_Variacoes). Antes, baixe o **backup (JSON)** dos produtos atuais.
   - O SKU é a chave: SKU existente é atualizado (só os campos preenchidos; preço, fotos e quantidade mínima que já existem não são apagados); SKU novo é criado.
   - Coluna **Banho/Cor** com um valor (Ouro) vira atributo do produto; com vários (Ouro; Prata) vira variação escolhida pelo cliente.
   - Produtos sem preço entram com preço zero; ajuste em *Preços em massa*.
4. Novos campos do produto: visível na loja (ativo), descrição, atributos, diferenciais, estoque, custo, peso e dimensões. Produto desmarcado como visível some da loja e do carrinho, sem ser excluído.

## 12. Variações para o cliente escolher (versão 2026.11.03-f)

- *Conteúdo do Site → Variações* oferece grupos prontos: **Banho** (Ouro, Prata, Níquel, Ródio, Ouro Rosé), **Inicial** (A–Z) e **Signo** (12 signos). Crie outros (Cor, Tamanho…) com um item por linha.
- **Aplicar a vários produtos de uma vez** (mesma aba): escolha o grupo e as opções, depois todos os produtos, uma categoria ou uma lista de SKUs. Modos: *acrescentar*, *substituir* ou *remover o grupo*. Mostra quantos produtos serão alterados antes de aplicar.
- No cadastro do produto cada grupo tem **Marcar todas / Limpar** e contador.
- Na loja o cartão do produto mostra os grupos (com bolinhas de cor para os banhos) e, na página do produto, o cliente escolhe uma opção de cada grupo antes de adicionar. A escolha aparece no carrinho, no pedido e no WhatsApp.

## 13. Efeitos modernos da vitrine (versão 2026.11.03-g)

**Arquivos novos:** `fx.js` e `fx.css` (suba junto com os demais). Se eles faltarem, a loja funciona normalmente, só sem os efeitos.

- **Banners:** transições (esmaecer, deslizar, cortina, zoom, desfoque), movimento da imagem (zoom aproximando/afastando, panorâmica), frase e botão animados sobre a imagem, setas, arrastar com o dedo, teclado ← →, bolinha com barra de progresso e pausa ao passar o mouse. Em *Conteúdo do Site → Banners* cada banner tem **Frase**, **Texto do botão**, **Movimento** e **Transição** (o padrão é Automático: varia a cada banner).
- **Topo da página:** título com palavras subindo e brilho dourado; imagem de fundo com zoom lento.
- **Ao rolar:** barra dourada de leitura, cabeçalho que vira vidro, some ao descer e volta ao subir, seções e produtos que aparecem escalonados.
- **Produtos:** foto inclina em 3D com brilho que segue o mouse (só mouse); botões principais com leve efeito magnético.
- **Carrinho:** ao adicionar, a foto voa até o botão "Meu pedido" e o contador pula.
- **Controle:** *Empresa e identidade → Animações da vitrine*: Completas, Suaves ou Desligadas. Quem ativa "reduzir movimento" no aparelho nunca vê animações.

## 14. Modelo de planilha corrigido e planilha dos produtos atuais (versão 2026.11.04-h)

Em `importar.html`:
- **Baixar modelo (Excel .xlsx)** ou **Modelo em CSV**: colunas na ordem de preenchimento (SKU, Nome, Categoria, Preços, Estoque, Banho, Cor, Material, Marca, Descrição, Diferenciais, Atributos, Custo, Margem, Peso, Medidas, Status, Quantidade Mínima, Fotos, Variações). Os nomes das colunas não têm `;` nem parênteses, para o CSV não desalinhar. Vem com 2 linhas de exemplo (SKU `EXEMPLO-…`, ignoradas na importação) e uma aba de instruções.
- **Baixar produtos atuais (Excel .xlsx)**: exporta todo o catálogo no mesmo formato do modelo, com uma coluna `Variação …` para cada grupo (Inicial, Signo…). Edite no Excel e envie de volta no mesmo importador: o que não mudou aparece como "sem mudança".
