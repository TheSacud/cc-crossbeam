---
name: viseu-corrections-flow
version: "0.1"
description: "First-half workflow for Viseu correction analysis. Reads a municipal notice, cross-checks official sources, categorizes the work needed, and generates clarification questions."
---

# Viseu Corrections Flow

This is the Viseu analysis flow for the requerente / project team side.

## Inputs

- municipal correction notice / dispatch
- plan binder and supporting documents
- municipality name
- property location

## Outputs

- `corrections_parsed.json`
- `sheet-manifest.json`
- `project_understanding.json`
- `national_compliance.json`
- `municipal_compliance.json`
- `corrections_categorized.json`
- `applicant_questions.json`

## Mandatory behavior

1. Read the notice first.
2. Reuse or build the manifest.
3. Produce `project_understanding.json` before discipline-specific categorization. Use `sheet-manifest.json` as the page source of truth and `page-text.json` only as a secondary text aid.
4. Cross-check national and municipal sources separately.
5. Categorize each item as one of:
   - `MISSING_DOCUMENT`
   - `MISSING_DRAWING_OR_ELEMENT`
   - `REGULATORY_NON_COMPLIANCE`
   - `MUNICIPAL_PROCEDURE_MISMATCH`
   - `NEEDS_TECHNICAL_REWORK`
   - `NEEDS_SPECIALTY_INPUT`
   - `NEEDS_APPLICANT_INPUT`
   - `LEGALIZATION_GAP`
   - `SOURCE_NEEDED`
6. Ask only applicant / project-team questions that unblock the next revision step.
7. Follow `references/artifact-schema.md` for the mandatory metadata fields on every JSON item.
