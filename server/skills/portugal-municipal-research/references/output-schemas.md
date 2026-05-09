# Output Schemas

## municipality_discovery.json

Campos mínimos:
- `municipality`
- `discovery_timestamp`
- `urls.urbanism_entrypoints`
- `urls.municipal_regulations`
- `urls.diario_republica_publications`
- `urls.instruction_notes`
- `urls.fee_sources`
- `urls.planning_portal`
- `urls.pdm_sources`
- `not_found`
- `notes`

## municipal_research_findings.json

Campos mínimos:
- `municipality`
- `extraction_timestamp`
- `sources[]`
- `specific_findings[]`
- `extraction_gaps[]`

### sources[]

- `source_type`
- `title`
- `url`
- `authority`
- `normative_weight`
- `relevant_sections[]`

### specific_findings[]

- `topic`
- `finding`
- `source_reference`
- `authority_level`
- `confidence`

### extraction_gaps[]

- `category`
- `url_attempted`
- `reason`
- `fallback_suggestion`
