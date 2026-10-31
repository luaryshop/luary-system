// Biblioteca da Luary CDN (GitHub + jsDelivr). Sem dependências.
// O token do GitHub NUNCA é gravado: vive apenas na memória da aba aberta.

export const CDN = { user: "luaryshop", repo: "luary-cdn", branch: "main" };
export const FOLDERS = {
  products: { label: "Produtos (por SKU)", path: "products", numbered: true },
  home: { label: "Home / banners", path: "home" },
  categories: { label: "Categorias", path: "categories" },
  subcategorias: { label: "Subcategorias", path: "subcategorias" },
  settings: { label: "Identidade (logo, favicon)", path: "settings" },
};
export const MAX_PRODUCT_IMAGES = 10;

export const cdnUrl = (path, ref = CDN.branch) =>
  `https://cdn.jsdelivr.net/gh/${CDN.user}/${CDN.repo}@${ref}/${path}`;
export const normalizeSku = (value) => String(value || "").trim().toUpperCase();
export const isValidSku = (sku) => /^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(sku);
export const numberedName = (index) => String(index + 1).padStart(2, "0") + ".webp";
export const slugFileName = (fileName) => {
  const base = String(fileName || "imagem").replace(/\.[^.]+$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return (base || "imagem") + ".webp";
};

// Converte qualquer imagem para WebP, limitando o lado maior (peso menor, carregamento mais rápido).
export async function toWebP(file, { quality = 0.85, maxSide = 1600 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("Não foi possível converter " + file.name + " para WebP.");
  return blob;
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class GitHubCDN {
  constructor(token = "") { this.token = token; }
  setToken(token) { this.token = String(token || "").trim(); }

  async api(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`https://api.github.com/repos/${CDN.user}/${CDN.repo}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) {
      const hint = response.status === 401 ? "Token inválido ou expirado."
        : response.status === 403 ? "Sem permissão (ou limite de requisições atingido)."
        : response.status === 404 ? "Não encontrado — confira o repositório e se o token tem acesso de escrita ao conteúdo."
        : response.status === 422 ? "O repositório mudou durante a publicação. Recarregue a pasta e tente novamente."
        : "Erro " + response.status + ".";
      const error = new Error(hint); error.status = response.status; throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  // Confirma que o token consegue gravar neste repositório.
  async verify() {
    const repo = await this.api("");
    if (!repo.permissions?.push) throw new Error("Este token não tem permissão de escrita em " + CDN.repo + ".");
    return repo;
  }

  async head() {
    const ref = await this.api(`/git/ref/heads/${CDN.branch}`);
    const commit = await this.api(`/git/commits/${ref.object.sha}`);
    return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  }

  // Lista os arquivos de uma pasta (uma única chamada recursiva).
  async listFolder(folder) {
    const head = await this.head();
    const tree = await this.api(`/git/trees/${head.treeSha}?recursive=1`);
    const prefix = folder.replace(/\/+$/, "") + "/";
    const files = (tree.tree || [])
      .filter((n) => n.type === "blob" && n.path.startsWith(prefix) && !n.path.slice(prefix.length).includes("/") && /\.(webp|png|jpe?g|svg|ico|gif)$/i.test(n.path))
      .map((n) => ({ name: n.path.slice(prefix.length), path: n.path, sha: n.sha, size: n.size || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { files, head, truncated: !!tree.truncated };
  }

  // Aplica o estado final de uma pasta em UM commit.
  // entries: [{ name, sha }]  (arquivo já existente)  ou  [{ name, blob }]  (arquivo novo/substituído)
  async commitFolder(folder, entries, message) {
    const names = entries.map((e) => e.name);
    if (new Set(names).size !== names.length) throw new Error("Há nomes de arquivo repetidos.");
    const { files: existing, head, truncated } = await this.listFolder(folder);
    if (truncated) throw new Error("Repositório grande demais para esta operação.");
    const byName = new Map(existing.map((f) => [f.name, f]));
    const treeEntries = [];
    for (const entry of entries) {
      const path = `${folder}/${entry.name}`;
      let sha = entry.sha;
      if (entry.blob) {
        const created = await this.api("/git/blobs", { method: "POST", body: { content: await toBase64(entry.blob), encoding: "base64" } });
        sha = created.sha;
      }
      if (byName.get(entry.name)?.sha === sha) continue; // sem alteração
      treeEntries.push({ path, mode: "100644", type: "blob", sha });
    }
    const keep = new Set(names);
    for (const file of existing) if (!keep.has(file.name)) treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
    if (!treeEntries.length) return head.commitSha;
    const tree = await this.api("/git/trees", { method: "POST", body: { base_tree: head.treeSha, tree: treeEntries } });
    const commit = await this.api("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [head.commitSha] } });
    await this.api(`/git/refs/heads/${CDN.branch}`, { method: "PATCH", body: { sha: commit.sha } });
    return commit.sha;
  }
}

// Leitura pública (sem token) das imagens de um SKU, já com URLs imutáveis (fixadas no commit).
export async function publicProductImages(sku) {
  const { files, head } = await new GitHubCDN().listFolder(`products/${sku}`);
  return files.filter((f) => /^\d{2}\.webp$/.test(f.name)).map((f) => cdnUrl(f.path, head.commitSha));
}
