---
name: portugal-municipal-research
version: "0.1"
description: "Pesquisa live de requisitos municipais portugueses. Usa fontes oficiais e quasi-oficiais para descobrir, extrair e validar regras operativas, regulamentos, taxas, NIPs/checklists e páginas de submissão municipal. É uma capability auxiliar reutilizável e não faz parte do runtime ativo Viseu-only."
---

# Portugal Municipal Research

Use esta skill quando for preciso pesquisar regras de um município português que ainda não tenha corpus curado suficiente ou quando for necessário confirmar páginas operativas atuais.

## Princípio base

Separar sempre:
- fonte oficial normativa
- fonte oficial operacional / administrativa
- fonte municipal útil mas não normativa
- lacunas que continuam por fechar com `[SOURCE NEEDED]`

Nunca afirmar um requisito municipal como vinculativo sem base numa fonte oficial ou explicitamente municipal e verificável.

## Modos

Esta skill segue três modos, equivalentes ao padrão já usado noutros fluxos:

| Modo | Ferramenta principal | Objetivo | Artefacto |
|------|----------------------|----------|-----------|
| Discovery | WebSearch | localizar URLs e documentos-chave | `municipality_discovery.json` |
| Targeted Extraction | WebFetch | extrair conteúdo útil das URLs descobertas | `municipal_research_findings.json` |
| Browser Fallback | browser / navegação assistida | fechar gaps deixados por WebFetch | atualização de `municipal_research_findings.json` |

Quando usada standalone, correr `Discovery -> Targeted Extraction -> Browser Fallback` apenas se houver gaps relevantes.
Quando usada por um orquestrador, correr apenas o modo pedido.

## Modo 1: Discovery

**Ferramenta:** `WebSearch`

**Objetivo:** encontrar o conjunto mínimo de fontes certas sem ainda as ler a fundo.

### O que procurar

1. página principal do urbanismo / obras particulares / gestão urbanística
2. regulamento municipal urbanístico ou equivalente
3. publicações em Diário da República relevantes para o regulamento
4. NIPs, normas de instrução, checklists ou instruções eletrónicas
5. taxas, tabela de taxas, licenças e outras receitas
6. portal de submissão / balcão online / requerimentos
7. páginas de PDM, plantas, condicionantes, regulamentos e avisos

### Queries sugeridas

- `"Município de [Nome]" urbanismo`
- `"Município de [Nome]" regulamento municipal urbanização edificação`
- `"Município de [Nome]" normas instrução urbanismo`
- `"Município de [Nome]" tabela de taxas urbanismo`
- `"Município de [Nome]" PDM regulamento`
- `"Município de [Nome]" obras particulares balcão online`
- `"site:dre.pt [Nome do município] regulamento urbanização edificação"`

### Output

Escrever `municipality_discovery.json` com esta estrutura:

```json
{
  "municipality": "Nome do município",
  "discovery_timestamp": "ISO date",
  "urls": {
    "urbanism_entrypoints": [],
    "municipal_regulations": [],
    "diario_republica_publications": [],
    "instruction_notes": [],
    "fee_sources": [],
    "planning_portal": [],
    "pdm_sources": []
  },
  "not_found": [],
  "notes": ""
}
```

## Modo 2: Targeted Extraction

**Ferramenta:** `WebFetch`

**Objetivo:** extrair só o conteúdo útil para o tema em análise.

### Prioridade de extração

1. regulamento municipal aplicável
2. publicações em Diário da República que suportam o regulamento ou o PDM
3. NIPs / normas de instrução / páginas de checklist
4. tabela de taxas e páginas operativas
5. páginas de submissão e balcão online
6. páginas PDM e condicionantes operativas

### O que extrair

- nome do documento / página
- autoridade emissora
- base normativa ou procedimental
- artigos, secções, títulos ou capítulos relevantes
- âmbito de aplicação
- requisitos concretos ligados ao tema pesquisado
- se a fonte é normativa, operativa ou apenas contextual
- sinais de desatualização, conflito ou insuficiência

### Output

Escrever `municipal_research_findings.json` com esta estrutura:

```json
{
  "municipality": "Nome do município",
  "extraction_timestamp": "ISO date",
  "sources": [
    {
      "source_type": "regulation | diario_republica | instruction_note | fee_page | planning_portal | pdm | municipal_page",
      "title": "Título",
      "url": "https://...",
      "authority": "Entidade emissora",
      "normative_weight": "official_normative | official_operational | municipal_context",
      "relevant_sections": [
        {
          "article_or_section": "Artigo / secção",
          "summary": "Resumo curto",
          "applies_to_topics": ["tema"]
        }
      ]
    }
  ],
  "specific_findings": [
    {
      "topic": "Tema pesquisado",
      "finding": "Conclusão factual",
      "source_reference": "URL + artigo/secção",
      "authority_level": "official_normative | official_operational | municipal_context",
      "confidence": "high | medium | low"
    }
  ],
  "extraction_gaps": [
    {
      "category": "Tema / fonte em falta",
      "url_attempted": "https://...",
      "reason": "por que razão ficou em aberto",
      "fallback_suggestion": "o que tentar no Browser Fallback"
    }
  ]
}
```

## Modo 3: Browser Fallback

**Ferramenta:** navegação assistida / browser

Usar apenas quando:
- a página depende fortemente de JavaScript
- há navegação por menus difícil de capturar com `WebFetch`
- o link descoberto aponta para documento ou portal que exige interação
- é preciso confirmar que uma página operativa atual ainda existe ou foi substituída

O Browser Fallback não redefine o schema. Apenas acrescenta descobertas e fecha `extraction_gaps`.

## Regras obrigatórias

1. Priorizar fontes descritas em `references/source-priority.md`.
2. Distinguir o que é requisito legal do que é instrução administrativa.
3. Não converter páginas de “como submeter” em base legal se não houver regulamento ou ato formal por trás.
4. Marcar explicitamente `[SOURCE NEEDED]` quando a base não for suficiente.
5. Escrever sempre em português europeu.
6. Se houver conflito entre página municipal resumida e ato normativo/publicação oficial, prevalece a fonte normativa.

## Referências

Carregar conforme necessário:
- `references/source-priority.md`
- `references/municipal-site-patterns.md`
- `references/source-separation.md`
- `references/output-schemas.md`
- `references/browser-fallback.md`
