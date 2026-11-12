# Regras de Segurança para Refatoração

## Cuidado com etapas enormes
- Se uma etapa for grande, divida em sub-passos.
- Nunca reescreva arquivos inteiros, separe as alterações em grupos condizentes com o objetivo de cada sub-passo

## Preservação
- Não remova código de negócio com "TODO/FIXME" sem confirmar.
- Não "modernize" o visual — preserve o estilo neo-brutalism atual.
- Não introduza dependências, bundlers ou frameworks.

## Dúvida = pare
- Se houver dois arquivos similares, CSS duplicado ou código ambíguo, PARE e pergunte antes de agir.