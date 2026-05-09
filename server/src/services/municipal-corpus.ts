import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { citySlug, type InternalFlowType } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const corpusSourceSchema = z.object({
  key: z.string().min(1),
  source_url: z.string().url(),
  source_doc: z.string().min(1),
  official_doc_id: z.string().min(1),
  checked_at: z.string().min(1),
  article_or_section: z.string().min(1),
  verification_status: z.enum([
    'official_verified',
    'paired_source_required',
    'missing_required_source',
  ]),
  applies_to: z.array(z.string().min(1)).min(1),
  topics: z.array(z.string().min(1)).min(1),
  required_for: z.array(z.enum(['city-review', 'corrections-analysis', 'corrections-response'])),
  file: z.string().min(1),
  notes: z.string().optional(),
});

const corpusManifestSchema = z.object({
  version: z.string().min(1),
  municipality: z.string().min(1),
  skill: z.string().min(1),
  schema_version: z.number().int().positive(),
  generated_at: z.string().min(1),
  required_topics_by_flow: z.record(
    z.enum(['city-review', 'corrections-analysis', 'corrections-response']),
    z.array(z.string().min(1)),
  ),
  sources: z.array(corpusSourceSchema).min(1),
});

export type MunicipalCorpusManifest = z.infer<typeof corpusManifestSchema>;

const MUNICIPAL_CORPUS_MANIFESTS: Record<string, string> = {
  viseu: path.join(
    __dirname,
    '../../skills/viseu-municipal-regulations/references/official-corpus.manifest.json',
  ),
};

function loadMunicipalCorpusManifest(manifestPath: string): MunicipalCorpusManifest {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return corpusManifestSchema.parse(parsed);
}

function validateReferencedFiles(manifestPath: string, manifest: MunicipalCorpusManifest): string[] {
  const baseDir = path.dirname(manifestPath);
  return manifest.sources
    .map((source) => path.resolve(baseDir, source.file))
    .filter((resolvedPath) => !fs.existsSync(resolvedPath))
    .map((resolvedPath) => `Missing referenced corpus file: ${resolvedPath}`);
}

export function validateMunicipalCorpusManifest(manifestPath: string): MunicipalCorpusManifest {
  const manifest = loadMunicipalCorpusManifest(manifestPath);
  const missingFiles = validateReferencedFiles(manifestPath, manifest);
  if (missingFiles.length > 0) {
    throw new Error(missingFiles.join('\n'));
  }
  return manifest;
}

export function validateMunicipalCorpusRequirements(
  manifest: MunicipalCorpusManifest,
  flowType: InternalFlowType,
): void {
  const requiredTopics = new Set(manifest.required_topics_by_flow[flowType] || []);
  if (requiredTopics.size === 0) {
    return;
  }

  const requiredSources = manifest.sources.filter((source) => source.required_for.includes(flowType));
  const errors: string[] = [];

  for (const topic of requiredTopics) {
    const matchingSources = requiredSources.filter((source) => source.topics.includes(topic));
    if (matchingSources.length === 0) {
      errors.push(
        `Missing required corpus source for topic "${topic}" in flow "${flowType}"`,
      );
      continue;
    }

    const invalidSources = matchingSources.filter(
      (source) => source.verification_status !== 'official_verified',
    );
    if (invalidSources.length > 0) {
      for (const source of invalidSources) {
        errors.push(
          `${source.key} is not ready for ${flowType} (${topic}): verification_status=${source.verification_status}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    const blockedFlows = Object.entries(manifest.required_topics_by_flow)
      .filter(([, topics]) => topics.some((topic) => requiredTopics.has(topic)))
      .map(([candidateFlow]) => candidateFlow)
      .join(', ');

    throw new Error(
      [
        `Municipal corpus incomplete for ${manifest.municipality}.`,
        `Blocked runs: ${blockedFlows || flowType}.`,
        ...errors,
      ].join('\n'),
    );
  }
}

export function validateMunicipalCorpusForFlow(city: string, flowType: InternalFlowType): void {
  const slug = citySlug(city);
  const manifestPath = MUNICIPAL_CORPUS_MANIFESTS[slug];
  if (!manifestPath || flowType === 'corrections-response') {
    return;
  }

  const manifest = validateMunicipalCorpusManifest(manifestPath);
  validateMunicipalCorpusRequirements(manifest, flowType);
}
