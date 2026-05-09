# Viseu Corrections Flow Artifact Schema

Apply this structure to the JSON outputs of the analysis phase.

## Mandatory project understanding artifact

The analysis phase must also write `project_understanding.json`.

This file is the structured interpretation layer between `sheet-manifest.json` and downstream findings. It must include:
- `document_profile`
- `project_summary`
- `building_program`
- `site_and_mass`
- `key_tables_and_legends`
- `discipline_coverage`
- `evidence_index`
- `open_questions`
- `understanding_status`

Rules:
- every high-impact statement must cite supporting evidence via `evidence_index`
- each statement must carry `confidence` using `high`, `medium`, or `low`
- when a claim relies on a crop, include `crop_path`
- when a claim depends on a specific visual region, include `crop_box`
  on the relevant `evidence_index` entry; use either page PNG pixel
  coordinates or percentage coordinates so the server can generate `crop_path`
  and `crop_storage_path`
- every numeric, area, distance, slope, or count value must carry `value_type`
  using `declared`, `cotated`, `measured_estimate`, `inferred`, or `unknown`
- set `usable_for_compliance=true` only for `declared` or `cotated` values;
  `measured_estimate`, `inferred`, and `unknown` values are advisory only
- use `sheet-manifest.json` as the source of truth for sheet/page/title/image paths
- use `page-text.json` only as a secondary aid for native PDF text, never as page-mapping truth

## Core item metadata

Every item in:
- `corrections_parsed.json`
- `national_compliance.json`
- `municipal_compliance.json`
- `corrections_categorized.json`

must carry:
- `process_type`
- `review_area`
- `finding_category`
- `source_scope`
- `source_reference`
- `evidence_status`

Mandatory when the item depends on anything observed or missing in the project submission:
- `evidence_refs[]`

Each `evidence_refs` value must be an `id` from `project_understanding.json.evidence_index`.
Use it for findings about typology, program, implantation, parking, areas, scales, tables,
visible drawing content, missing sheets, missing documents, or declared/cotated values.
Do not use `source_reference` as a substitute for project evidence.
The server will demote project-dependent findings without valid `evidence_refs`
to `inconclusive`, even if `evidence_status` says `confirmed`.

Optional for findings that may support blocking issues:
- `sheet_refs[]` with `page`, `desenho`, `title`, `page_png_path`, `title_block_png_path`, `visual_note`

## Interpretation rules

- `source_scope = national` for `RJUE` or other national regimes.
- `source_scope = municipal-viseu` for `RMUE`, municipal regulations, fee logic, and confirmed local operating rules.
- `source_scope = procedure-instruction` for dossier completeness, NIPs, and submission-packaging issues.
- `evidence_status = depends-on-pdmv` when the issue cannot be closed without the official `PDMV` extract.
- `finding_category = SOURCE_NEEDED` when the authoritative source itself is missing from the repo.
- `sheet-manifest.json` is the ground truth for any sheet/page/title or title-block path used in `sheet_refs`.
- `project_understanding.json` is the required grounding layer for any finding that depends on program, typology, site arrangement, parking, or area tables.
- Never present inferred measurements as facts. If a distance, area, slope, or count is not declared/cotated in the submitted documents, mark the item `inconclusive` or ask a clarification question.
