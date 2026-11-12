# Regras de Segurança para Refatoração

## Cuidado com etapas enormes
- Se uma etapa for grande, divida em sub-passos.
- Nunca reescreva arquivos inteiros, separe as alterações em grupos condizentes com o objetivo de cada sub-passo

## Preservação
- Não remova código de negócio com "TODO/FIXME" sem confirmar.
- Não "modernize" o visual — preserve o estilo neo-brutalism atual.
- Não introduza dependências, bundlers ou frameworks.

## duplicatas conhecidas
- admin gate (md5 + showCustomModal): `sets.js`, `extractor.js`, `sorter/admin.js`.
- `copyText`: main vs `sorter/utils.js`.
- `escapeHtml`: `sorter/utils.js`.
- `sanitizeFileName`: `sorter/utils.js`.

## Dúvida = pare
- Se houver dois arquivos similares, CSS duplicado ou código ambíguo, PARE e pergunte antes de agir.