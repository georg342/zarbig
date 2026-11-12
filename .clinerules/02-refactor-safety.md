# Regras de Segurança para Refatoração

## Nunca faça em lote
- Trabalhe em UM passo por vez. Após cada passo, mostre o diff e espere aprovação.
- Se uma etapa for grande, divida em sub-passos.

## Preservação
- Não remova código de negócio com "TODO/FIXME" sem confirmar.
- Não "modernize" o visual — preserve o estilo neo-brutalism atual.
- Não introduza dependências, bundlers ou frameworks.

## Dúvida = pare
- Se houver dois arquivos similares, CSS duplicado ou código ambíguo, PARE e pergunte antes de agir.