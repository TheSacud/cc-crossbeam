---
name: viseu-corrections-complete
version: "0.1"
description: "Second-half workflow for Viseu correction handling. Turns analyzed corrections and applicant answers into a municipality-facing response package."
---

# Viseu Corrections Complete

Use this after the clarification answers are available.

## Deliverables

Write:
- `response_letter.md`
- `professional_scope.md`
- `corrections_report.md`
- `sheet_annotations.json`

`response_letter.pdf` is a rendered derivative produced by the server after the run. Author only `response_letter.md`.

## Rules

1. Keep the tone formal and municipality-facing.
2. Tie every response line back to the correction item and the intended action.
3. Cite official sources when available.
4. Mark unresolved legal basis as `[SOURCE NEEDED]`.
5. Follow `references/response-package.md` to preserve analysis metadata and source traceability.
