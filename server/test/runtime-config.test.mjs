import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_RUNTIME_CITY,
  FUTURE_PORTUGAL_MUNICIPAL_RESEARCH_PATH,
  buildPrompt,
  getFlowSkills,
  getSystemAppend,
  getUnsupportedCityMessage,
  isSupportedRuntimeCity,
} from '../dist/utils/config.js';

test('runtime skill selection is Viseu-only for all active flows', () => {
  assert.deepEqual(getFlowSkills('city-review', 'Viseu'), [
    'portugal-urban-planning',
    'viseu-plan-review',
    'adu-targeted-page-viewer',
    'viseu-municipal-regulations',
  ]);

  assert.deepEqual(getFlowSkills('corrections-analysis', 'Viseu'), [
    'portugal-urban-planning',
    'viseu-corrections-flow',
    'adu-targeted-page-viewer',
    'viseu-municipal-regulations',
  ]);

  assert.deepEqual(getFlowSkills('corrections-response', 'Viseu'), [
    'portugal-urban-planning',
    'viseu-corrections-complete',
    'viseu-corrections-pdf',
    'viseu-municipal-regulations',
  ]);
});

test('unsupported cities do not qualify for the active runtime', () => {
  assert.equal(isSupportedRuntimeCity('Viseu'), true);
  assert.equal(isSupportedRuntimeCity('Placentia'), false);
  assert.equal(isSupportedRuntimeCity(undefined), false);
  assert.match(
    getUnsupportedCityMessage('Placentia'),
    /Unsupported city: only Viseu is enabled in this runtime/,
  );
});

test('runtime prompts and system appends no longer branch into California flows', () => {
  const reviewPrompt = buildPrompt('city-review', 'Viseu', 'Rua do Serrado 14');
  const responseAppend = getSystemAppend('corrections-response', 'Viseu');

  assert.match(reviewPrompt, /municipal urban licensing review/i);
  assert.match(reviewPrompt, new RegExp(FUTURE_PORTUGAL_MUNICIPAL_RESEARCH_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(reviewPrompt, /California|ADU permit assistant|adu-plan-review|california-adu/);
  assert.match(responseAppend, /response_letter\.pdf is a rendered derivative/i);
  assert.match(responseAppend, new RegExp(ACTIVE_RUNTIME_CITY, 'i'));
});
