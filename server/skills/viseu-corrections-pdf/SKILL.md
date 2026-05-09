---
name: viseu-corrections-pdf
version: "0.1"
description: "Contrato de formatação para transformar `response_letter.md` em `response_letter.pdf` no contexto Viseu/PT-PT. A renderização concreta é executada pelo servidor como post-process."
---

# Viseu Corrections PDF

Esta skill não reescreve conteúdo. Define como o `response_letter.md` deve ficar pronto para ser renderizado como `response_letter.pdf`.

## Papel

- entrada principal: `response_letter.md`
- saída esperada: `response_letter.pdf`
- execução concreta: post-process do servidor

## Regras

1. `response_letter.md` continua a ser o artefacto autoral principal.
2. O PDF é um derivado renderizado e não um documento reescrito.
3. O tom deve manter-se formal, administrativo e dirigido ao município.
4. Preservar citações, seções, listas e referências de fonte.
5. Não introduzir elementos gráficos que confundam o documento com emissão oficial do município.

## Estrutura visual esperada

- cabeçalho com identificação do processo / local quando disponível
- título claro da resposta
- secções com hierarquia consistente
- tipografia legível em PT-PT
- paginação discreta
- rodapé neutro com referência CrossBeam

## Artefactos

- `response_letter.pdf`
- opcionalmente `response_letter_page1.png` para QA visual, se o pipeline o vier a precisar

## Referências

Carregar conforme necessário:
- `references/layout-spec.md`
- `references/markdown-contract.md`
- `references/renderer-notes.md`
- `assets/response-print.css`
