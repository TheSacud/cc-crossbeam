import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  validateMunicipalCorpusManifest,
  validateMunicipalCorpusRequirements,
} from '../dist/services/municipal-corpus.js';

test('validates the checked-in Viseu corpus manifest', () => {
  const manifestPath = path.resolve(
    'skills/viseu-municipal-regulations/references/official-corpus.manifest.json',
  );
  const manifest = validateMunicipalCorpusManifest(manifestPath);

  assert.equal(manifest.municipality, 'Viseu');
  assert.ok(manifest.sources.length >= 5);
  assert.doesNotThrow(() => validateMunicipalCorpusRequirements(manifest, 'city-review'));
  assert.doesNotThrow(() => validateMunicipalCorpusRequirements(manifest, 'corrections-analysis'));
});

test('fails fast when a required source is not officially verified', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'municipal-corpus-test-'));
  const refPath = path.join(tempDir, 'required.md');
  const manifestPath = path.join(tempDir, 'manifest.json');

  fs.writeFileSync(refPath, '# required');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema_version: 1,
    version: 'test',
    municipality: 'Viseu',
    skill: 'viseu-municipal-regulations',
    generated_at: '2026-03-11',
    required_topics_by_flow: {
      'city-review': ['nip-packaging'],
      'corrections-analysis': ['nip-packaging'],
      'corrections-response': [],
    },
    sources: [
      {
        key: 'broken',
        source_url: 'https://example.com/source.pdf',
        source_doc: 'required.md',
        official_doc_id: 'test-doc',
        checked_at: '2026-03-11',
        article_or_section: 'sec. 1',
        verification_status: 'missing_required_source',
        applies_to: ['licenciamento'],
        topics: ['nip-packaging'],
        required_for: ['city-review'],
        file: 'required.md',
      },
    ],
  }, null, 2));

  const manifest = validateMunicipalCorpusManifest(manifestPath);
  assert.throws(
    () => validateMunicipalCorpusRequirements(manifest, 'city-review'),
    /Municipal corpus incomplete/,
  );
});
