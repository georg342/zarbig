# Implementation Plan

## [Overview]

Integrate a local agent (`zarbig-yt-agent`, Python stdlib on `127.0.0.1:8787`) that runs `yt-dlp` to save the audio of each track to disk, plus a UI block on `pages/extractor.html` to install/connect the agent and download the selected tracks, with global progress, per-row badge and a non-opus format warning.

Scope is additive: nothing in the existing link generation, `.stretch-results` layout, admin gate, CSS or other pages is rewritten. Reuses `#progWrapDl`/`#progBarDl` (already in the page, unused), `showCustomModal`, `mostrarToast`, `copyText`, `sanitizeFileName`, `fetchWithTimeout`, the batch pattern of `buscarLinksYoutube` and the per-row badge pattern (`#badge-yt-${num}`).

Out of scope by decision: mobile/Safari (detect, disable, warn), Windows-only `.bat`, no browser launch, audio only, no reencode when the source is already opus.

## [Decisions]

| ID | decision |
|---|---|
| D1 | `download selected` button in the results card, under `generate links` |
| D2 | scope = selected tracks that have `ytUrl` |
| D3 | page copy, agent console and `.bat` in english lowercase |
| D4 | `#progWrapDl` bar + `#status` counter + toast + per-row badge, error in the tooltip |
| D5 | `local agent` block as its own card in the controls column |
| D6 | `-x --audio-format best`: native opus when available, otherwise keep m4a/aac and flag it |
| D7 | agent writes to disk; page asks the folder on the first download (opt-out) and stores the path |
| D8 | port 8787, `ThreadingHTTPServer`, `start.bat` Windows-only |
| D9 | agent copies the token to the clipboard; page has `paste token` |
| D10 | polling `GET /status` every 1s |
| D11 | batch 50 tracks / 300s per track by default, configurable in admin |
| D12 | browser cookies off by default, toggle + browser in admin |
| D13 | responsible-use note as `help-text` in the agent card |
| D14 | `skipped` (archive) counts as success, tooltip `already in folder` |
| D15 | `m.dl` lives in memory only; persistent state is the agent `archive.txt` |
| D16 | download code in its own file `assets/js/extractor-download.js` (extractor.js is ~1800 lines) |
| D17 | `yt-dlp.exe` bundles `yt-dlp-ejs` (confirmed in the wiki table), so no `--remote-components` fallback |
| D18 | metadata embedded when available (`--embed-metadata --embed-thumbnail`), never fails the track |

## [Types]

### Track object (`musicasGlobal[]`, `assets/js/extractor.js`)

```js
m.dl = {
  state: 'queued' | 'downloading' | 'done' | 'skipped' | 'error',
  ext: string | null,
  file: string | null,
  error: string | null
}
```

Created as `null` in `criarObjetoMusica`. `resetarLinks` does not clear it.

### `zb_admin_cfg` additions

```js
{ dlBatchSize: 50, dlTimeoutS: 300, useCookies: false, cookieBrowser: 'chrome' }
```

### New localStorage keys

| key | content |
|---|---|
| `zb_agent_token` | agent token, cleared on 401 |
| `zb_dl_folder` | chosen output folder |
| `zb_dl_notice_seen` | `'1'` = folder notice already answered |

### Agent HTTP contract (JSON, header `X-Token`)

```
GET  /health      (public)  200 { ok, name, version, folder, deps:{ytdlp,deno,ffmpeg} }
GET  /status      200 { jobId, state: idle|running|done|cancelled, done, total,
                        items:[{num,state,ext,file,error,progress}] }
POST /download    202 { jobId, total } | 400 {error} | 409 {error:"job running"}
POST /cancel      200 { cancelled: true }
POST /folder/pick 200 { folder } | 503 { error: "dialog unavailable" }
```

CORS: exact origin (`https://georg342.github.io`, any `http://localhost:<port>`/`http://127.0.0.1:<port>` for dev), `Access-Control-Allow-Headers: content-type, x-token`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Private-Network: true`, `Vary: Origin`, `OPTIONS` -> 204.

## [Files]

### New

| path | purpose |
|---|---|
| `agent/agent.py` | server, job runner, preflight (stdlib only) |
| `agent/start.bat` | dependency install/validation, token, run agent |
| `agent/README.md` | install and troubleshooting, portuguese |
| `agent/.gitignore` | ignore `bin/`, `archive.txt`, `*.log` |
| `assets/js/extractor-download.js` | agent client, download orchestration, badges |

### Modified

| path | change |
|---|---|
| `pages/extractor.html` | `#agentCard` (zip link, token, paste, connect, status, legal note), download block after `button#btnYt` (`#btnDl`, `#btnDlFolder`, `#dlFolderInfo`), admin fields (batch, timeout, cookies + browser), script tag for the new JS |
| `assets/js/extractor.js` | `DEFAULT_ADMIN_CFG` + `getAdminCfg`/`salvarAdminCfg`/`preencherAdminCfg` fields, `dl: null` in `criarObjetoMusica`, `id="track-${num}"` on the row, `zbDlBadgeHtml()` in `render()`, `zbInitDownloadAgent()` on `DOMContentLoaded` |
| `assets/css/pages.css` | `.agent-card`, `.agent-status`, `.dl-badge` (`.ok`/`.warn`/`.err`), `.dl-notice-check` |
| `.gitignore` | `agent/bin/` |
| `README.md` | short "download agent" section |

### Published outside the repo

`zarbig-yt-agent.zip` as a GitHub Release asset (`v1`), zipped from `agent/` without `bin/`. Page link: `https://github.com/georg342/zarbig/releases/latest/download/zarbig-yt-agent.zip`.

## [Functions]

### `assets/js/extractor-download.js` (new)

```js
ZB_AGENT_BASE, ZB_AGENT_TIMEOUT_MS, ZB_DL_POLL_MS, ZB_KEYS
plataformaSuportada()                  // false on mobile and Safari desktop
tokenAgente() / salvarTokenAgente(v) / limparTokenAgente()
pastaDownload() / salvarPastaDownload(p)
chamarAgente(path, { method, body })   // fetchWithTimeout + X-Token + 401 handling
checarAgente()                         // GET /health -> state + UI
renderAgentStatus()                    // status pill, disabled buttons, help text
colarTokenAgente() / conectarAgente()
escolherPastaDownload()                // POST /folder/pick, fallback to manual prompt
garantirAvisoPasta()                   // first-run modal with "don't ask again"
tracksParaDownload()
iniciarDownload()                      // validates, POST /download, starts polling
acompanharDownload(jobId)              // 1s polling loop
aplicarStatusItens(items)              // writes m.dl + patches badges
atualizarBadgeDl(m)                    // patches #dl-badge-${num} only
atualizarBarraDownload(done, total)
finalizarDownload(estado, done, total)
cancelarDownload()                     // POST /cancel
extEhOpus(ext)
window.zbDlBadgeHtml(m)                // used by render()
window.zbInitDownloadAgent()           // called by extractor.js on DOMContentLoaded
```

### `assets/js/extractor.js` (modified)

- `DEFAULT_ADMIN_CFG` gains the four download fields; `getAdminCfg` clamps (`dlBatchSize` 1..200, `dlTimeoutS` 60..1800), `salvarAdminCfg` persists, `preencherAdminCfg` fills the new inputs.
- `criarObjetoMusica` returns `dl: null`.
- `render()`: `<li id="track-${m.num}" ...>` and `${window.zbDlBadgeHtml ? window.zbDlBadgeHtml(m) : ''}` inside `.badges-container`.
- `DOMContentLoaded`: `if (window.zbInitDownloadAgent) window.zbInitDownloadAgent();`.

### `agent/agent.py` (new)

```python
allowed_origins() / validate_url(url) / validate_folder(path)
make_token() / copy_to_clipboard(text) / preflight(bin_dir)
build_track_cmd(url, folder, cfg) / download_track(item, folder, cfg, job)
parse_progress(line) / parse_filepath(line) / is_archive_skip(line) / tail_error(lines)
pick_folder()
class Job / class Handler(BaseHTTPRequestHandler) / main()
```

### `agent/start.bat`

Idempotent install in `%LOCALAPPDATA%\zarbig-yt-agent`: check `py -3`/`python`, `curl`, `tar`; download `yt-dlp.exe`, `deno` zip, `ffmpeg` essentials zip; validate sizes; extract to `bin\`; copy `agent.py`; run it. English messages, `pause` only on error, no admin.

## [Classes]

- `agent/agent.py :: Job` - single job state: `items`, `state`, `done`, `cancel`, `proc`, `lock`; `start(items, folder, cfg)`, `cancel()`, `snapshot()`, `mark(index, result)`.
- `agent/agent.py :: Handler` - `BaseHTTPRequestHandler` with `_cors()`, `_auth()` (`secrets.compare_digest`), `_json(status, payload)`, `do_OPTIONS`, `do_GET`, `do_POST`.
- No new classes in the site JS (project is function-based).

## [Dependencies]

- Site: none. No bundler, no framework, no build step.
- Agent: Python 3 stdlib (`http.server`, `secrets`, `subprocess`, `threading`, `json`, `pathlib`, `shutil`) + `tkinter` for the folder dialog.
- Runtime downloaded by `.bat` (never committed): `yt-dlp.exe` (~23 MB), `deno.exe` (>= 2.3.0, required for EJS), `ffmpeg`/`ffprobe` (essentials).
- EJS scripts ship inside the PyInstaller `yt-dlp.exe` (wiki table), so no `--remote-components`.

## [Testing]

No test framework in the repo. Verification is manual plus a headless probe with a mocked agent.

1. Agent alone: `/health` JSON, 401 without token, 204 preflight, 400 for a foreign URL, 409 for a second job while running.
2. Real download with one opus-only and one aac-only video: `.opus` + `.m4a` with `state=done`, `ext` set; second run returns `skipped`; cancel mid-run removes the partial file.
3. `start.bat`: first run confirms downloads and validates sizes; second run downloads nothing; missing `curl`/`python` prints a clear message and exits non-zero.
4. Page with mocked `fetch`: offline/online, 401 clears the token, 409 toast, badges for `opus`/`m4a`/`error`/`skipped`, progress math, status text, final toast, mobile and Safari emulation disables the card.
5. Security: foreign origin gets no `Access-Control-Allow-Origin`; URL outside the allowlist is rejected.
6. Regression: `node --check` on both JS files, `py -3 -m py_compile agent/agent.py`, existing extractor flows unchanged.

## [Implementation Order]

1. `agent/agent.py`: HTTP skeleton (health/status/OPTIONS/token/CORS) + preflight.
2. `agent/start.bat`: checks, idempotent downloads, size validation, token, english messages.
3. `agent/agent.py`: per-track job (command, timeout, progress/filepath/skip parsing, cancel).
4. `agent/agent.py`: `POST /download`, `/cancel`, `/folder/pick` + validations.
5. `pages/extractor.html`: `#agentCard`.
6. `assets/js/extractor-download.js`: token/folder, `chamarAgente`, `checarAgente`, platform detection.
7. Download block in HTML + orchestration and polling in the new JS.
8. `m.dl`, badges, bar/counter/toast (`extractor-download.js`, `extractor.js`, `pages.css`).
9. Admin fields (batch, timeout, cookies, browser).
10. `.gitignore`, `README.md`, release `v1` with `zarbig-yt-agent.zip`, verify the download link.

## [Risks]

- Chrome Local Network Access may prompt on https -> 127.0.0.1; the agent help text explains it.
- Unsigned `.bat`/`.exe`: SmartScreen warning documented in `agent/README.md`.
- `python` missing from PATH (only `py`): `.bat` tries `py -3` then `python`.
- `tkinter` missing: `/folder/pick` returns 503 and the page falls back to a typed path.
- yt-dlp changes weekly: no hardcoded `--extractor-args`; failures surface per track with the yt-dlp message.
- `--embed-thumbnail`/`--embed-metadata` may warn: a track with a valid audio file stays `done` even when the embed fails.


