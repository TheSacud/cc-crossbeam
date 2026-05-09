---
name: viseu-municipal-regulations
version: "0.2"
description: "Municipality-specific regulation skill for Viseu. Use this on top of portugal-urban-planning to answer questions about Viseu urban licensing procedures, municipal regulation references, and local administrative requirements."
source: "Municipio de Viseu official website and Diario da Republica publications"
authority: "Municipio de Viseu"
law_as_of: "Seeded from official sources checked on 2026-03-11; exact article wording must still be verified against the official act when needed"
---

# Municipio de Viseu Regulatory Layer

This skill is the municipality-specific layer for Viseu. Load it together with `portugal-urban-planning`.

## Scope

Use this skill for:
- Viseu municipal regulation references
- local urbanism/licensing operating rules
- municipality-published fee and instruction sources
- drafting municipality-facing replies with Viseu terminology

Do not use this skill alone for national-law conclusions.

## Decision route

| Question type | Load |
|---------------|------|
| RMUE structure, chapter map, where to look first | `references/rmue-structure.md` |
| Municipal control procedures, instruction, deadlines, caution | `references/rmue-procedures-control.md` |
| Process instruction details, alteration drawings, accessibility, propriedade horizontal, destaque | `references/rmue-instruction-documents.md` |
| Escassa relevancia, certificates of exemption, impacte urbanistico | `references/rmue-special-cases.md` |
| Urbanistic and building conditions, annexes, parking | `references/rmue-urbanization-edification.md` |
| Public-space occupation during works | `references/rmue-public-space-works.md` |
| Legalization, execution projects, telas finais | `references/rmue-legalization.md` |
| Urgent documents, searches, certidoes, destaque fee logic, usos mistos, SIR | `references/rmue-other-procedures.md` |
| Public administration procedures, offences, conflict resolution, entry into force | `references/rmue-final-provisions.md` |
| Current Viseu submission checklists / NIP-derived instruction notes | `references/nips-licenciamento-comunicacao-previa.md`, `references/nips-legalizacao.md` |
| PDMV operational baseline for parking, soil class, parameters, and constraints triage | `references/pdmv-operational-baseline.md`, `references/pdmv-estacionamento-operativo.md`, `references/pdmv-classificacao-qualificacao-solo.md`, `references/pdmv-parametros-urbanisticos-operativos.md`, `references/pdmv-condicionantes-operativas.md` |
| Machine-readable operational registry and validated corpus manifest | `references/viseu-operational-index.json`, `references/official-corpus.manifest.json` |
| Municipal regulation text / wording or source verification | `references/rmue-sources.md` |
| Local process, contacts, submission channel | `references/urbanism-entrypoints.md` |
| Fees and charges | `references/fee-sources.md` |
| What is still missing for production use | `references/gaps-and-next-steps.md` |

## Mandatory guardrails

1. Do not state that a Viseu requirement exists unless it appears in an official source.
2. When the source set is incomplete, keep the item open and tag it `[SOURCE NEEDED]`.
3. Separate municipality requirements from national requirements in every artifact.
4. When citing the RMUE, mention the article number.
5. When a requirement comes from the operational index, preserve `source_doc`, `article_or_section`, and `verification_status`.
6. For mandatory Viseu topics already covered by the validated corpus, do not reopen them as `[SOURCE NEEDED]` or `depends-on-pdmv`.
