# zarbig-yt-agent

Agente local que baixa **só o áudio** das tracks do `exxxtractor`. Roda na sua
máquina, escuta em `127.0.0.1:8787` e usa o `yt-dlp` por baixo.

## Instalação

1. Baixe `zarbig-yt-agent.zip` na página do extractor (ou na Release do repositório).
2. Descompacte em qualquer pasta.
3. Rode `start.bat`.

Na primeira execução ele baixa `yt-dlp.exe`, `deno.exe` e `ffmpeg` (~300 MB) em
`%LOCALAPPDATA%\zarbig-yt-agent`. Depois disso, abrir de novo é instantâneo e não
baixa nada.

## Conectar na página

`start.bat` imprime o token e já copia para a área de transferência.

1. Abra `pages/extractor.html`.
2. No card `local agent`, clique em `paste token` (ou cole no campo e clique em `connect`).
3. O status vira `online`.

O token muda a cada start; se o status ficar `offline` com o agente aberto,
cole o token novo.

## Download

- Botão `download selected`: baixa as tracks **marcadas que já têm link**.
- `folder`: abre o seletor de pasta nativo. O caminho fica salvo no navegador.
- O padrão é `%USERPROFILE%\Downloads\zarbig`.
- Arquivo por track, com metadados/capa quando o YouTube fornece.
- Opus quando a fonte tem opus; se só existir aac, vem `.m4a` e a linha mostra o
  formato com aviso.
- `archive.txt` na pasta evita baixar a mesma faixa duas vezes.

## Problemas comuns

| sintoma | causa provável | correção |
|---|---|---|
| `python 3 not found` | Python fora do PATH | instale de python.org marcando "Add python to PATH" |
| `curl not found` / `tar not found` | Windows muito antigo | atualize o Windows (10 1803+) |
| status `offline` com o agente aberto | token antigo | `paste token` de novo |
| primeiro download falha e o console mostra 403 | vídeo com restrição de idade | ligue `browser cookies` no admin mode |
| navegador pede permissão de rede local | Chrome bloqueia https → 127.0.0.1 | permita; a página explica no texto de ajuda |
| `deno.exe missing` | download incompleto | rode `start.bat` de novo |

O agente não escreve nada fora de `%LOCALAPPDATA%\zarbig-yt-agent`, da pasta de
download escolhida e do `archive.txt` dentro dela. O token não é gravado em
disco.

## Aviso

Uso pessoal. Baixar conteúdo do YouTube pode contrariar os termos do serviço;
você é responsável pelo que baixa.
