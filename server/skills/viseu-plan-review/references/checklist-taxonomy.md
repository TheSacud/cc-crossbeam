# Viseu Review Taxonomy

Use this taxonomy for municipal screening and first-line review in Viseu.

## Review groups

- `arquitetura-urbanismo`
- `especialidades`
- `acessibilidades-seguranca`
- `instrucao-administrativa`
- `legalizacao` when the dossier or notice concerns built-reality mismatch or legalization

## Required metadata for each JSON finding

- `process_type`
- `review_area`
- `finding_category`
- `source_scope`
- `source_reference`
- `evidence_status`

## Optional visual provenance for findings likely to support blocking issues

- `sheet_refs`

Each `sheet_refs` item may include:
- `page`
- `desenho`
- `title`
- `page_png_path`
- `title_block_png_path`
- `visual_note`

Rules:
- use `sheet-manifest.json` as the only source of truth for sheet/page/title
- keep this optional at finding level in v1
- preserve it when a finding is likely to be promoted into `blocking_issues`

## Allowed finding categories

- `MISSING_DOCUMENT`
- `MISSING_DRAWING_OR_ELEMENT`
- `REGULATORY_NON_COMPLIANCE`
- `MUNICIPAL_PROCEDURE_MISMATCH`
- `NEEDS_SPECIALTY_INPUT`
- `NEEDS_APPLICANT_INPUT`
- `LEGALIZATION_GAP`
- `SOURCE_NEEDED`

## Allowed source scopes

- `national`
- `municipal-viseu`
- `procedure-instruction`

## Allowed evidence status values

- `confirmed`
- `missing-from-submission`
- `depends-on-pdmv`
- `needs-human-validation`
- `source-needed`
