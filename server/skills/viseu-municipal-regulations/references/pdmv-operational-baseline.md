# PDMV Operational Baseline For First-Line Review

This file is now a routing summary over the validated Viseu corpus.

Validated official sources:
- `pdmv-estacionamento-operativo.md`
- `pdmv-classificacao-qualificacao-solo.md`
- `pdmv-parametros-urbanisticos-operativos.md`
- `pdmv-condicionantes-operativas.md`

## Use this file for

- deciding which PDMV extract to load first
- keeping the review aligned with the validated corpus topics
- distinguishing dossier insufficiency from corpus insufficiency

## Operational rules

- For `parking`, use the official parking extract and do not reopen the topic as `SOURCE_NEEDED`.
- For `soil class/category`, require the official framing extract in the dossier and cite the validated corpus source.
- For `urban parameters`, require the applicable class/category extract before accepting synoptic-table figures or other claimed indices.
- For `constraints`, require the relevant ordering/constraints extracts from the dossier and cite the validated corpus source for that obligation.

## Agent handling

- `SOURCE_NEEDED` and `depends-on-pdmv` are no longer allowed for the mandatory Viseu topics covered by the validated corpus.
- Keep those statuses only for municipal subjects that remain outside the validated corpus.
