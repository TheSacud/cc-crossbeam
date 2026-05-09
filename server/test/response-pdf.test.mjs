import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderResponseLetterPdfFromMarkdown } from '../dist/services/response-pdf.js';

test('renderResponseLetterPdfFromMarkdown creates a non-empty PDF', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossbeam-response-pdf-test-'));
  const outputPath = path.join(tmpDir, 'response_letter.pdf');

  try {
    renderResponseLetterPdfFromMarkdown([
      '# Resposta ao Pedido de Correcao',
      '',
      'Exmos. Senhores,',
      '',
      'Na sequencia da notificacao recebida, submetemos a presente resposta com o enquadramento tecnico e documental atualizado.',
      '',
      '## Medidas',
      '',
      '- Atualizacao das pecas desenhadas relevantes.',
      '- Inclusao dos elementos instrutorios em falta.',
      '- Coordenacao com as especialidades aplicaveis.',
    ].join('\n'), outputPath);

    const stats = fs.statSync(outputPath);
    assert.ok(stats.size > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
