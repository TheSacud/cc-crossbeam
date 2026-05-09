import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());

test('portugal municipal research skill ships the documented references', () => {
  const skillDir = path.join(repoRoot, 'skills', 'portugal-municipal-research');
  const skillBody = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

  assert.match(skillBody, /Discovery/i);
  assert.match(skillBody, /Targeted Extraction/i);
  assert.match(skillBody, /Browser Fallback/i);
  assert.match(skillBody, /municipality_discovery\.json/);
  assert.match(skillBody, /municipal_research_findings\.json/);

  for (const reference of [
    'source-priority.md',
    'municipal-site-patterns.md',
    'source-separation.md',
    'output-schemas.md',
    'browser-fallback.md',
  ]) {
    assert.equal(fs.existsSync(path.join(skillDir, 'references', reference)), true);
  }
});

test('viseu corrections pdf skill ships the documented contract assets', () => {
  const skillDir = path.join(repoRoot, 'skills', 'viseu-corrections-pdf');
  const skillBody = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

  assert.match(skillBody, /response_letter\.md/);
  assert.match(skillBody, /response_letter\.pdf/);
  assert.match(skillBody, /response_letter\.pdf/);

  for (const asset of [
    path.join('references', 'layout-spec.md'),
    path.join('references', 'markdown-contract.md'),
    path.join('references', 'renderer-notes.md'),
    path.join('assets', 'response-print.css'),
  ]) {
    assert.equal(fs.existsSync(path.join(skillDir, asset)), true);
  }
});
