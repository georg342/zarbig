# zarbig

hub pessoal de dj/tools. duas ferramentas em html/css/js puro, sem build.

- `pages/extractor.html` — extrai links do youtube a partir de playlists do spotify.
- `pages/sets.html` — gerencia, reproduz e distribui dj sets (supabase storage).

## como rodar

precisa ser servido por **http**: o projeto usa `type="module"` e `@import` de css, então `file://` não funciona.

```bash
# opção 1
python -m http.server 8000

# opção 2
npx serve .
```

depois abra <http://localhost:8000>.

## estrutura

```
.
├── index.html              # hub com os dois cards
├── manifest.json           # manifest pwa
├── pages/
│   ├── extractor.html
│   └── sets.html
└── assets/
    ├── css/
    │   ├── main.css        # entry point: só @imports (não coloque regras aqui)
    │   ├── base.css        # tokens, reset, body, inputs e textarea
    │   ├── components.css  # header, card, help, botões, toast, modal, audio player
    │   └── pages.css       # regras específicas: hub, extractor, dj sets
    └── js/
        ├── main.js         # utils globais (window.mostrarToast, window.fetchWithTimeout, window.showCustomModal)
        ├── extractor.js
        └── sets.js         # es module (importa o supabase via cdn)
```

- ordem de carga do css: `base` → `components` → `pages`, definida no `assets/css/main.css`.
- `main.js` precisa vir **antes** dos scripts de página em cada html: `<script src=".../main.js"></script>`, depois `<script src=".../<page>.js"></script>`.
- layout: o `body` é limitado por `--max-width` (1200px). as páginas de ferramenta usam o grid `.layout` — `.col-controls` em 380px + `.col-results` fluido — e empilham numa coluna abaixo de 900px.
- `.card` (superfície dos painéis) e `.help-text` (dica curta em lowercase) vivem em `components.css`; `.admin-help` foi substituído por `.help-text`.

## stack

| item | uso |
|---|---|
| html5 / css3 / js (es modules) | tudo, sem bundler, framework ou typescript |
| [supabase](https://supabase.com) storage | bucket `dj-sets`: upload, list, remove e getpublicurl |
| `@supabase/supabase-js@2` | via cdn jsdelivr (entrada `+esm`) |
| youtube data api v3 | busca de vídeos (`/youtube/v3/search`) — **apenas no admin mode**; público usa `r.jina.ai` |
| [phosphor icons](https://phosphoricons.com) | via cdn unpkg |

## páginas

### exxxtractor (`pages/extractor.html`)

1. cola o link da playlist do spotify;
2. o app busca `open.spotify.com/embed/playlist/<id>` através de proxies (`r.jina.ai` e, se falhar, `api.allorigins.win`) e faz o parse das faixas;
3. seleciona as faixas e gera os links do youtube (ou do youtube music, conforme o toggle);
4. exporta: copiar todos os links, copiar 1 por vez (intervalo de 3s) ou baixar `.txt`.

**modo manual:** "open raw data in browser" abre a página via `r.jina.ai`; cole o texto no campo e clique em "process pasted text".

**busca dos links:** o backend depende do modo.

| modo | backend | detalhes |
|---|---|---|
| público | `r.jina.ai` (scrape de `youtube.com/results?search_query=`) | sem chave; ~20 req/min no free tier; 3 tentativas com backoff |
| admin | youtube data api v3 | `maxResults`, `delay`, lista de `suffix` e `auto-pick` configuráveis; o toggle `use official youtube api` desliga a api e força `r.jina.ai`; se a api falhar ou vier vazia, cai automaticamente para `r.jina.ai` |

**query suffix (lista):** vale nos dois modos, inclusive no público. o padrão é `official audio` + `official video`: os termos são tentados em ordem até aparecer um vídeo, então só cai para o próximo sufixo quando o anterior não retorna nada. lista vazia = busca sem sufixo.

**delay (ms):** pausa entre faixas na geração em lote (e no `retry failed`); o modo público nunca desce de 1000ms. cada tentativa de sufixo é uma requisição, então listas longas + delay baixo estouram o limite do `r.jina.ai`.

**playlist tools (público, aparecem após carregar uma playlist):**

- **already owned filter** — cole os nomes dos arquivos locais (ou use "scan folder") e clique em "uncheck owned"; as faixas encontradas ganham o badge `owned`, são desmarcadas e ficam protegidas de seleção/geração;
- **batch tools** — `check failed` (marca só as faixas com erro), `invert selection`, `retry failed` (re-tenta apenas as que falharam) e `reset links` (limpa os links gerados, com confirmação);
- **export** — copia `artista - titulo | url` da seleção ou baixa um `.csv` (`num,titulo,artista,yt_url,yt_title,yt_channel`).

**admin mode (senha → md5 `ADMIN_HASH`):** libera o card `admin tools` com a chave da youtube data api (pré-preenchida com `YOUTUBE_API_KEY`, editável via `localStorage.zb_yt_key`), limpeza das chaves do spotify, os parâmetros de busca (salvos em `localStorage.zb_admin_cfg`: `results per search`, `delay`, lista de sufixos, toggle `use official youtube api` e `auto-pick`) e o botão de lápis para trocar o vídeo de uma faixa manualmente (zarbig mode).

### sets (`pages/sets.html`)

- upload de áudio para o bucket — nome final: `<timestamp>--<nome_normalizado>.<ext>`;
- lista os sets, reproduz no player fixo e copia o link público;
- excluir um set ou limpar o bucket exige **admin mode** (senha digitada → md5 comparado com `ADMIN_HASH`).

## configuração

| o quê | onde |
|---|---|
| youtube api key (default) | `assets/js/extractor.js:1` (`YOUTUBE_API_KEY`); o admin pode sobrescrever em runtime (`localStorage.zb_yt_key`) |
| parâmetros de busca | `localStorage.zb_admin_cfg` (salvos pelo card `admin tools`: `maxResults`, `delayMs`, `suffixes[]`, `useApi`, `autoPick`) |
| supabase url / anon key | `assets/js/sets.js:6-7` |
| bucket | `assets/js/sets.js:8` (`dj-sets`) |
| hash da senha admin | `assets/js/sets.js:9` e `assets/js/extractor.js:2` (`ADMIN_HASH`, md5) |

## notas

- **as chaves vivem no front-end.** a anon key e a youtube api key são públicas por natureza: restrinja referrer/quota no google cloud e use rls/policies no bucket do supabase.
- `r.jina.ai` e `api.allorigins.win` são proxies de terceiros: podem falhar, limitar requisições ou mudar o formato. quando isso acontecer, use o modo manual.
- a busca pública de links usa `r.jina.ai` e está limitada a ~20 req/min no free tier; o delay mínimo nesse modo é 1s e a lista de sufixos também vale aqui (cada sufixo tentado é 1 requisição).
- o bloco "official spotify api (+100 tracks)" apenas salva `client id`/`client secret` no `localStorage` (`sp_cid`/`sp_csec`); a extração atual não consome esses valores.
- `.env` está no `.gitignore` e não é lido pelo app (só chaves locais de ia).
- sem service worker: `sw.js` e `old.html` foram removidos na refatoração.
