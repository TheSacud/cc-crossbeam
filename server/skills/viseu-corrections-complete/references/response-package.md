# Viseu Response Package Rules

Use these rules when turning analyzed corrections into municipality-facing deliverables.

## Deliverables

- `response_letter.md`
- `professional_scope.md`
- `corrections_report.md`
- `sheet_annotations.json`
- `response_letter.pdf` is generated later from `response_letter.md`; do not author it separately.

## Mandatory traceability

- Preserve `process_type`, `review_area`, `finding_category`, `source_scope`, `source_reference`, and `evidence_status` from the analysis artifacts.
- Preserve `sheet_refs` when present and use them to support concise blocking-issue evidence in structured outputs.
- If a line of response depends on a missing official source, say so explicitly with `[SOURCE NEEDED]`.
- Distinguish between:
  - document to add
  - drawing / technical revision
  - specialty coordination
  - clarification still needed from the requerente
- Treat `response_letter.md` as the canonical authored letter for both markdown and PDF delivery.
