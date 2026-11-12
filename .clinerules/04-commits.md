# Commit ao Final da Tarefa

## Regra

- Toda tarefa que alterar arquivos termina com um commit, feito **antes** de responder com o resumo.
- Mensagem curta e autoexplicativa: uma linha, imperativa, em inglês (mesma língua do código).
- Exemplos: `add commit rule`, `fix playlist id parse`, `split css into modules`.

## Como

- `rtk git add <caminhos explícitos>` — apenas os arquivos alterados nesta tarefa;
- `rtk git commit -m "<mensagem>"` — com eco de exit code;
- `rtk git status --short` depois, para confirmar que só saiu do pendente o que era desta tarefa.

## Nunca

- `git add -A` ou `git add .` — não capturar mudanças antigas, de terceiros ou fora do escopo;
- commitar arquivo não relacionado à tarefa, credenciais, `.env` ou artefatos (`repomix-output.xml`, caches);
- `--amend`, `reset --hard` ou `push --force` sem confirmação explícita.

## Sem mudanças

- Se a tarefa não alterou arquivos, ou nada dela sobrou no working tree, não commitar — só avisar no resumo.
