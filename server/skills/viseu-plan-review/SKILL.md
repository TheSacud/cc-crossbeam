---
name: viseu-plan-review
version: "0.1"
description: "Municipal review workflow for Viseu. Coordinates a document-first review of urban licensing submissions and organizes findings by discipline while enforcing source-backed reasoning."
---

# Viseu Plan Review

Use this skill when the municipality side is reviewing a submission.

## Review groups

Write findings into four groups:
- `arquitetura-urbanismo`
- `especialidades`
- `acessibilidades-seguranca`
- `instrucao-administrativa`
- `legalizacao` when the process or notice indicates built-reality / legalization issues

## Review rules

1. Every finding must cite the supporting official source or be tagged `[SOURCE NEEDED]`.
2. Separate visual/document completeness findings from legal/procedural findings.
3. If a sheet or document is missing, flag the absence explicitly instead of inferring content.
4. Keep the output terse and administrative.
5. Follow `references/checklist-taxonomy.md` for finding categories and metadata fields.
6. Build or reuse `project_understanding.json` before discipline findings when it is not already present.
7. When a finding is likely to support a future `blocking_issue`, preserve the relevant sheet/page reference from `sheet-manifest.json` when available.
8. Findings that depend on program, typology, implantation, parking, or area tables must cite the relevant evidence already captured in `project_understanding.json`.
