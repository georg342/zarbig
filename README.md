# zarbig

hub pessoal de dj/tools. quatro ferramentas em html/css/js puro, sem build.

- `pages/extractor.html` — extrai links do youtube a partir de playlists do spotify.
- `pages/sets.html` — gerencia, reproduz e distribui dj sets (supabase storage).
- `pages/sorter.html` — analisa, categoriza, renomeia e exporta uma pasta de música local.
- `pages/files.html` — upload, download e exclusão de qualquer arquivo (admin only).

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
├── index.html              # hub com os quatro cards
├── manifest.json           # manifest pwa
├── pages/
│   ├── extractor.html
│   ├── sets.html
│   ├── sorter.html
│   └── files.html
└── assets/
    ├── css/
    │   ├── main.css        # entry point: só @imports (não coloque regras aqui)
    │   ├── base.css        # tokens, reset, body, inputs e textarea
    │   ├── components.css  # header, card, help, botões, toast, modal, audio player
    │   ├── pages.css       # regras específicas: hub, extractor, dj sets, file share
    │   └── sorter.css      # regras específicas do track sorter
    └── js/
        ├── main.js         # utils globais (window.mostrarToast, window.fetchWithTimeout, window.showCustomModal)
        ├── extractor.js
        ├── sets.js         # es module (importa o supabase via cdn)
        ├── files.js        # es module: file share (admin only, pasta files/ do bucket)
        └── sorter/         # módulos do track sorter
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
4. na barra de ferramentas acima da lista (ícones, nome completo no hover): `only selected tracks` (fica ligado), `check failed`, `invert selection`, `check visible`, `uncheck all`; a barra só aparece com playlist carregada;
5. exporta pelos `playlist tools`: `artista - titulo | link`, `.csv`, `yt/ytm links`, `auto copy (3s)` e `.txt`.

**modo manual:** "open raw data in browser" abre a página via `r.jina.ai`; cole o texto no campo e clique em "process pasted text".

**busca dos links:** o backend depende do modo.

| modo | backend | detalhes |
|---|---|---|
| público | `r.jina.ai` (scrape de `youtube.com/results?search_query=`) | sem chave; ~20 req/min no free tier; 3 tentativas com backoff |
| admin | youtube data api v3 | `maxResults`, `delay`, lista de `suffix` e `auto-pick` configuráveis; o toggle `use official youtube api` desliga a api e força `r.jina.ai`; se a api falhar ou vier vazia, cai automaticamente para `r.jina.ai` |

**query suffix (lista):** o padrão é `topic` + `official audio`, nessa ordem — `topic` primeiro é o que acha o art track, então a query crua (`título artista`) não é mais disparada. no modo público a busca sempre usa os dois; só o admin pode editar/remover (lista vazia = volta para a query crua). os termos são tentados em ordem até aparecer um candidato aprovado.

**jina + paralelismo:** a busca usa `r.jina.ai` com a key pública embutida (~500 req/min; sem chave cai para ~20) e **6 buscas em paralelo** (admin: `parallel searches`, 1..10). termos do mesmo track continuam sequenciais; o paralelismo é entre tracks. o `#status` mostra `6p · 120/500 rpm`. se a key falhar (401/403) o código segue sem chave e avisa no log. o campo `jina api key` fica no card público (salva em `localStorage.zb_jina_key`) e `reset to default` volta para a chave embutida.

**auto-pick:** escolhe só entre candidatos aprovados — todo pedaço do nome do artista (créditos separados por vírgula, cada um quebrado por espaço) precisa estar no título **ou** no canal, e o título do spotify precisa bater. entre os aprovados, art track primeiro. **se nada passa, a faixa fica failed** (nada de link aleatório). link já salvo no cache não é revalidado; o badge amarelo avisa quando artista/título não batem.

**exclude title keywords:** campo de pills — digite e tecle `enter` ou `,` para virar uma pill, `X` remove, `backspace` com o campo vazio apaga a última. a comparação ignora caixa e acento. `recheck keywords` (playlist tools) marca como failed as faixas cujo link salvo tem alguma keyword no título, para você dar `retry failed` sem refazer tudo.

**delay (ms):** pausa entre faixas na geração em lote (e no `retry failed`); o modo público nunca desce de 1000ms. cada tentativa de sufixo é uma requisição, então listas longas + delay baixo estouram o limite do `r.jina.ai`.

**playlist tools (público, aparecem após carregar uma playlist):**

- **already owned filter** — cole os nomes dos arquivos locais (ou use "scan folder") e clique em "uncheck owned"; as faixas encontradas ganham o badge `owned`, são desmarcadas e ficam protegidas de seleção/geração;
- **batch tools** — `retry failed` (re-tenta apenas as que falharam), `reset links` (limpa os links gerados, com confirmação) e `recheck keywords` (marca como failed as que têm keyword no título do vídeo salvo);
- **export** — `artista - titulo | link` (copia), `.csv` (`num,titulo,artista,yt_url,yt_title,yt_channel`), `yt/ytm links`, `auto copy (3s)` e `.txt`.

**admin mode (senha → md5 `ADMIN_HASH`):** libera o card `admin tools` com a chave da youtube data api (pré-preenchida com `YOUTUBE_API_KEY`, editável via `localStorage.zb_yt_key`), os parâmetros de busca (salvos em `localStorage.zb_admin_cfg`: `results per search`, `delay`, lista de sufixos, toggle `use official youtube api` e `auto-pick`), os parâmetros do agente de download (lote, timeout, cookies, `auto-download links`) e o botão de lápis para trocar o vídeo de uma faixa manualmente (zarbig mode).

### agente local de download (`agent/`)

o download das faixas roda fora do navegador: cors e falta de filesystem impedem que a página chame o youtube e grave arquivos. o agente é um servidor python local (`127.0.0.1:8787`) que executa o `yt-dlp` e salva **só o áudio** em disco.

1. no card `local agent`, baixe `zarbig-yt-agent.zip` (asset de release);
2. rode `start.bat`: na primeira vez baixa `yt-dlp`, `deno` e `ffmpeg` (~300 MB) em `%LOCALAPPDATA%\zarbig-yt-agent` e imprime o token (também copiado para a área de transferência);
3. `paste token` na página → status vira `online`;
4. `download` baixa **todas** as faixas marcadas que já têm link, em lotes encadeados e **3 downloads em paralelo** no agente (1 fragmento por arquivo), um arquivo por faixa, com metadados quando o youtube fornece. o agente mantém o `archive.txt` (checa antes de subir o yt-dlp) e a linha mostra `dl 42%` piscando;
5. `folder` troca a pasta de destino (padrão `%USERPROFILE%\Downloads\zarbig`, salva em `localStorage.zb_dl_folder`).

formato: `-x --audio-format best`, ou seja, `.opus` quando a fonte é opus; se só existir aac o arquivo sai `.m4a` e a linha mostra o formato com aviso. `archive.txt` na pasta evita baixar de novo. mobile e safari ficam desabilitados (o agente roda na máquina do visitante).

api: `GET /health`, `GET /status`, `POST /download`, `POST /cancel`, `POST /folder/pick`; token em `X-Token`, cors restrito à origem do pages e a loopback. client em `assets/js/extractor-download.js`.

### track sorter (`pages/sorter.html`)

- carrega uma pasta local, lê tags (jsmediatags), importa `database.xml` do virtualdj e categoriza só quando você clica em **analyze selected tracks**;
- `categorize mode`:
  - `genre (jina lookup)` — padrão; busca cada faixa selecionada no beatport e, se não achar, no bandcamp através de `r.jina.ai` (sem token de api; ~20 req/min; cache por artista/faixa). preenche genre/bpm/key/label e cria categorias pelo gênero/tag, até 3 por faixa;
  - `presets (local rules)` — regras locais de keyword + bpm;
  - `hybrid (genre + ai fallback)` — faz o lookup e manda para o deepseek só as faixas que ficaram sem gênero;
  - `ai taxonomy (deepseek)` — a ia define as categorias e distribui as faixas (1–3 por faixa, mesmo artista na mesma categoria salvo divergência forte);
- **admin mode:** a chave deepseek fica só em memória (nunca em `localStorage`/`sessionStorage`), é limpa no reload/restore e ao sair do admin; o botão `fetch metadata (jina)` roda só o lookup; categorias criadas por ia/gênero aparecem no editor com badge e podem ser salvas no config;
- **export:** o `.m3u8` por categoria inclui a faixa em **todas** as playlists das categorias dela; o `.csv` ganha a coluna `categories`; o `.json` inclui `categories` e o objeto `lookup`; o relatório mostra a categoria primária + `also:`; no virtualdj, o `base path` é a pasta raiz das tracks (o nome da pasta enviada é removido do path) e a opção `category name only` remove o prefixo `zarbig-sorted-<data>` dos nomes;
- limites: beatport/bandcamp via `r.jina.ai` é scrape de terceiro (pode falhar/limitar), e a api do deepseek **não navega na internet** — só usa o conhecimento do modelo e os metadados do lookup.



- upload de áudio para o bucket — nome final: `<timestamp>--<nome_normalizado>.<ext>`;
- lista os sets, reproduz no player fixo e copia o link público;
- excluir um set ou limpar o bucket exige **admin mode** (senha digitada → md5 comparado com `ADMIN_HASH`).

### file share (`pages/files.html`)

- ferramenta inteira **admin only**: sem senha, a página mostra apenas o aviso `admin mode required`;
- upload de qualquer tipo de arquivo (limite de 50 mb do plano free) para a pasta `files/` do bucket `dj-sets`;
- lista com download, cópia do link público, exclusão individual e `delete all`, tudo dentro do admin mode;
- o bucket precisa aceitar os tipos enviados: `allowed mime types` vazio nas configurações do bucket.

## configuração

| o quê | onde |
|---|---|
| youtube api key (default) | `assets/js/extractor.js:1` (`YOUTUBE_API_KEY`); o admin pode sobrescrever em runtime (`localStorage.zb_yt_key`) |
| parâmetros de busca | `localStorage.zb_admin_cfg` (salvos pelo card `admin tools`: `maxResults`, `delayMs`, `suffixes[]`, `useApi`, `autoPick`) |
| supabase url / anon key | `assets/js/sets.js:6-7` |
| bucket | `assets/js/sets.js:8` (`dj-sets`) |
| pasta do file share | `assets/js/files.js` (`PREFIX` = `files`) |
| hash da senha admin | `assets/js/sets.js:9` e `assets/js/extractor.js:2` (`ADMIN_HASH`, md5) |
| gradiente global de fundo | `localStorage.zb_bg_gradient` (`{ c1, c2, c3 }`); default em `assets/css/base.css` (`--bg-grad-1..3`), editável pelo widget flutuante que aparece no **admin mode** de qualquer página |

## notas

- **as chaves vivem no front-end.** a anon key e a youtube api key são públicas por natureza: restrinja referrer/quota no google cloud e use rls/policies no bucket do supabase.
- `r.jina.ai` e `api.allorigins.win` são proxies de terceiros: podem falhar, limitar requisições ou mudar o formato. quando isso acontecer, use o modo manual.
- a busca pública de links usa `r.jina.ai` e está limitada a ~20 req/min no free tier; o delay mínimo nesse modo é 1s e a lista de sufixos também vale aqui (cada sufixo tentado é 1 requisição).
- `.env` está no `.gitignore` e não é lido pelo app (só chaves locais de ia).
- sem service worker: `sw.js` e `old.html` foram removidos na refatoração.
