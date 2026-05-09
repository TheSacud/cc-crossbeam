# CrossBeam Viseu

This repository started as a California ADU permit assistant. The first step toward a Viseu deployment is now in place:

- backend routing no longer assumes every municipality uses the California ADU corpus
- `Viseu` is mapped as its own jurisdiction profile
- the sandbox only preloads a sheet manifest when a city has an explicit demo fixture
- seed skills were added for Portugal baseline law and Município de Viseu

## What exists now

Code scaffolding:
- jurisdiction-aware server config
- Viseu-specific prompt/system scaffolding
- seed skills:
  - `server/skills/portugal-urban-planning`
  - `server/skills/viseu-municipal-regulations`
  - `server/skills/viseu-plan-review`
  - `server/skills/viseu-corrections-flow`
  - `server/skills/viseu-corrections-complete`

Official source registry seeded from:
- Município de Viseu RMUE publication in Diário da República (`Aviso n.º 12538/2020`)
- public-consultation material for RMUE amendment (`Aviso n.º 15225/2024/2` and municipality-hosted project PDF)
- Município de Viseu fee table (`Tabela de Taxas, Licenças e Outras Receitas`, 2024 edition)
- RJUE (`Decreto-Lei n.º 555/99`)

## What is still missing for production

1. Extract the operative RMUE articles into structured topic files.
2. Map Viseu's submission checklist and specialties into concrete review heuristics.
3. Replace California/ADU demo copy in the frontend with Viseu-specific content.
4. Add real Viseu test assets: notice, plan set, and expected outputs.
5. Validate the workflow with current official operational pages before quoting procedures or fees in production.
