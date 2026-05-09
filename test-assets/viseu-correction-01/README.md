# Viseu Correction 01

Anonymized acceptance package for the first operational Viseu flow.

## Goal

Validate `corrections-analysis` and `corrections-response` end-to-end against a single municipal notice that forces the agent to handle:
- missing instruction elements
- a concrete Viseu municipal rule
- a national-rule remittance
- a `PDMV`-dependent point
- at least one `[SOURCE NEEDED]` output

## Package structure

- `inputs/project-context.json` - minimal case context
- `inputs/municipal-notice.md` - anonymized notice / pedido de aperfeicoamento
- `inputs/pieces-desenhadas-escritas.md` - dossier contents as delivered
- `inputs/plan-set-summary.json` - simplified plan binder map
- `expected/analysis/*` - expected artifacts from phase 1
- `expected/response/*` - expected artifacts from phase 2

## Acceptance use

- The flow is considered acceptable when the generated artifacts materially match the expected files in shape, taxonomy, and source traceability.
- Exact wording can differ, but the agent must preserve the same correction logic and the same open `[SOURCE NEEDED]` gap.
