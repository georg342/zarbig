# Uso do rtk (Rust Token Killer)

`rtk` está instalado globalmente (`rtk 1.2.0`). ele filtra/compacta a saída de comandos antes de chegar ao meu contexto.

## usar

- `rtk git status|diff|log|show` — leitura de git;
- `rtk git add|commit|push` — sempre com eco de exit code e `rtk git status` depois;
- `rtk run <cmd> [args]` — executor genérico (propaga exit code: testado com `node`);
- `rtk bypass <cmd>` — executa sem filtro quando o filtro esconder o que preciso;
- `rtk err <cmd>` / `rtk summary <cmd>` — quando só importam erros/resumo.

## não usar

- `rtk ls`, `rtk tree`, `rtk grep`, `rtk rg` — falham neste windows (sem `ls`/`grep`/`rg` no PATH). usar `Get-ChildItem`, `Select-String` ou as tools de busca;
- `rtk read` em arquivo que eu vou editar — a saída é filtrada/truncada. usar `read_files`;
- `rm`, `mv`, instalação de pacote ou redirecionamento de arquivo embrulhado em filtro.

## execução (evitar "command completion could not be observed")

- **um comando por chamada** de terminal; nunca vários comandos soltos na mesma chamada;
- encadear dentro de uma string só: `cmd /c "rtk git status"; Write-Output "EXIT=$LASTEXITCODE"`;
- sempre ecoar o exit code no fim;
- se aparecer `command completion could not be observed`: reexecutar o comando sozinho antes de assumir sucesso ou falha.

## conferência

- `rtk gain` quando o usuário pedir as estatísticas de economia.
