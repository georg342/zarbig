# Uso do rtk (Rust Token Killer)

`rtk` está instalado globalmente (`rtk 1.2.0`). ele filtra/compacta a saída de comandos antes de chegar ao meu contexto.

usar: `rtk git status|diff|log|show|add|commit|push` e `rtk run <cmd>`.
não usar `rtk ls|tree|grep|rg` (quebrados no windows); use `Get-ChildItem`, `Select-String`.
não usar `rtk read` em arquivo que vou editar — use read_files.

regras:
- um comando por chamada; ecoar exit code: `cmd /c "..."; Write-Output "EXIT=$LASTEXITCODE"`
- `command completion could not be observed`: reexecutar antes de assumir.
- `rtk` ausente/falhando: usar `git` direto e avisar.

`rtk gain` só quando o usuário pedir estatísticas.

commit com `shrink rtk rules`.
