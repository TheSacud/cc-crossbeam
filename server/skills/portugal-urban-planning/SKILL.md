---
name: portugal-urban-planning
version: "0.1"
description: "Base skill for Portuguese urban licensing workflows. Use this as the national-law layer for municipality-specific reviews and correction analysis in Portugal. It should anchor the agent on RJUE, official municipal regulation references, and documentary rigor."
source: "Decreto-Lei n.º 555/99 (RJUE) and official municipal regulation sources"
authority: "Portugal national legal framework + municipality-published regulations"
law_as_of: "Needs verification per active source set"
---

# Portugal Urban Planning Baseline

This skill is the national-law baseline for Portuguese urban licensing flows. It is the equivalent of the California state-law layer in CrossBeam, but for Portugal.

Use this skill to anchor the agent on:
- `RJUE` and related national process language
- licensing vs. prior communication style workflows
- documentary rigor: do not infer requirements without an official source
- role separation between applicant, designer, specialty engineers, and municipality

## Operating rules

1. Treat official legal publications and municipality-published regulations as authoritative.
2. If a requirement is not supported by an official source, mark it as `[SOURCE NEEDED]`.
3. Separate national rules from municipality-specific rules in every output.
4. Prefer short, traceable citations over broad summaries.

## Source-loading order

1. Read `references/official-sources.md`.
2. Identify which national document governs the question.
3. Load the municipality skill for local rules.
4. Cross-check whether the answer is national, municipal, or still unresolved.
