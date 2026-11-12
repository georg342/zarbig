# Zarbig — Contexto do Projeto

Hub pessoal de DJ/tools com três páginas:
- `pages/extractor.html` — extrai links do YouTube a partir de playlists do Spotify.
- `pages/sets.html` — gerencia, reproduz e distribui DJ sets via Supabase Storage.
- `pages/sorter.html` — analyze, categorize, rename, export de uma pasta de música local.

## Stack
- HTML5 + CSS3 + Vanilla JS (ES Modules onde necessário).
- Supabase Storage (bucket `dj-sets`).
- YouTube Data API v3 (chave em `assets/js/extractor.js`).
- Phosphor Icons (CDN).

## Regras de código
- Idioma do código: inglês (variáveis, funções, IDs). Textos de UI: lowercase, não traduzir.
- Estilo: neo-brutalism, dark mode, Consolas monospace, `text-transform: lowercase` global.
- Sem bundlers, frameworks, TypeScript ou dependências novas.
- Não altere strings de UI visível sem confirmação.
- Não renomeie IDs HTML sem atualizar todos os seletores JS/HTML na mesma alteração.
- Legado em PT: `extractor.js` e `sets.js` são PT e não devem ser renomeados sem pedido explícito. Código novo em EN.
- Admin gate (md5 + showCustomModal) está duplicado em `sets.js`, `extractor.js` e `sorter/admin.js` — manter em sync sem unificar sem pedido.