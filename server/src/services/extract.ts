import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { supabase, insertMessage } from './supabase.js';
import {
  type ImageMagickCommands,
  popplerCommandCandidates,
  requireCommand,
  requireImageMagickCommands,
  resolveCommand,
} from './tool-paths.js';

const PAGE_RENDER_DPI = 300;
const TITLE_BLOCK_DPI = 400;
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_MAX_PDF_MB = 80;
const DEFAULT_MAX_PLAN_PDF_PAGES = 120;
const DEFAULT_MAX_DOCUMENT_PDF_PAGES = 80;
const DEFAULT_MAX_DOCUMENT_TEXT_TOTAL_PAGES = 160;
const PDF_MAGIC_HEADER_BYTES = 1024;

export interface PageTextEntry {
  page: number;
  text: string;
  text_length: number;
  has_extractable_text: boolean;
  source: 'pdf-native' | 'none';
}

export interface TitleBlockTextEntry {
  page: number;
  text: string;
  text_length: number;
  has_ocr_text: boolean;
  source: 'tesseract' | 'none';
}

export interface PreliminarySheetEntry {
  page: number;
  desenho: number | null;
  title: string;
  notes: string;
  discipline: string | null;
  title_confirmed: boolean;
  scale: string | null;
  extraction_confidence: 'high' | 'medium' | 'low';
  needs_visual_review: boolean;
  page_png_path: string;
  title_block_png_path: string;
}

export interface FileRecord {
  id?: string;
  filename: string;
  storage_path: string;
  file_type?: string | null;
  created_at?: string | null;
  size_bytes?: number | null;
}

interface UploadArtifact {
  localPath: string;
  name: string;
  contentType: string;
}

export const REQUIRED_EXTRACTION_ARTIFACTS = [
  'pages-png.tar.gz',
  'title-blocks.tar.gz',
  'page-text.json',
  'sheet-manifest.json',
  'preflight-summary.json',
  'document-text.json',
  'title-block-text.json',
] as const;

interface DocumentTextArtifact {
  generated_by: string;
  documents: Array<{
    filename: string;
    file_type: string | null;
    page_count: number;
    pages_with_native_text: number;
    pages: PageTextEntry[];
    skipped_reason?: string;
  }>;
}

export interface PdfExtractionLimits {
  maxBytes: number;
  maxPages: number;
}

interface DocumentTextLimits extends PdfExtractionLimits {
  maxTotalPages: number;
}

function resolvePythonCommand(): string | null {
  return resolveCommand('python3') || resolveCommand('python');
}

function optionalPositiveIntegerFromEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  return optionalPositiveIntegerFromEnv(name) ?? fallback;
}

function maxPdfBytesFromEnv(): number {
  const explicitBytes = optionalPositiveIntegerFromEnv('CROSSBEAM_MAX_PDF_BYTES');
  if (explicitBytes) {
    return explicitBytes;
  }
  return positiveIntegerFromEnv('CROSSBEAM_MAX_PDF_MB', DEFAULT_MAX_PDF_MB) * BYTES_PER_MB;
}

export function pdfExtractionLimitsFromEnv(kind: 'plan-binder' | 'document' = 'plan-binder'): PdfExtractionLimits {
  return {
    maxBytes: maxPdfBytesFromEnv(),
    maxPages: kind === 'plan-binder'
      ? positiveIntegerFromEnv('CROSSBEAM_MAX_PLAN_PDF_PAGES', DEFAULT_MAX_PLAN_PDF_PAGES)
      : positiveIntegerFromEnv('CROSSBEAM_MAX_DOCUMENT_PDF_PAGES', DEFAULT_MAX_DOCUMENT_PDF_PAGES),
  };
}

function documentTextLimitsFromEnv(): DocumentTextLimits {
  return {
    ...pdfExtractionLimitsFromEnv('document'),
    maxTotalPages: positiveIntegerFromEnv(
      'CROSSBEAM_MAX_DOCUMENT_TEXT_TOTAL_PAGES',
      DEFAULT_MAX_DOCUMENT_TEXT_TOTAL_PAGES,
    ),
  };
}

function formatBytes(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

export function hasPdfMagicBytes(buffer: Buffer): boolean {
  const header = buffer
    .subarray(0, Math.min(buffer.length, PDF_MAGIC_HEADER_BYTES))
    .toString('latin1');
  return /^\s*%PDF-/.test(header);
}

function assertPdfBufferIsSafe(filename: string, buffer: Buffer, limits: PdfExtractionLimits): void {
  if (buffer.length > limits.maxBytes) {
    throw new Error(
      `${filename} is ${formatBytes(buffer.length)}, above the ${formatBytes(limits.maxBytes)} PDF size limit`,
    );
  }

  if (!hasPdfMagicBytes(buffer)) {
    throw new Error(`${filename} is not a valid PDF: missing %PDF header`);
  }
}

function assertPdfMetadataIsSafe(file: FileRecord, limits: PdfExtractionLimits): void {
  if (typeof file.size_bytes === 'number' && file.size_bytes > limits.maxBytes) {
    throw new Error(
      `${file.filename} is ${formatBytes(file.size_bytes)}, above the ${formatBytes(limits.maxBytes)} PDF size limit`,
    );
  }
}

function assertPdfPageCountIsSafe(filename: string, pageCount: number, limits: PdfExtractionLimits): void {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    throw new Error(`${filename} has an invalid PDF page count: ${pageCount}`);
  }
  if (pageCount > limits.maxPages) {
    throw new Error(`${filename} has ${pageCount} pages, above the ${limits.maxPages} page limit`);
  }
}

function runInlinePython(scriptPath: string, source: string, args: string[], timeout = 180_000): string {
  const pythonPath = resolvePythonCommand();
  if (!pythonPath) {
    throw new Error('python3 or python is required for this extraction path but was not found in PATH');
  }

  fs.writeFileSync(scriptPath, source, 'utf8');
  return execFileSync(pythonPath, [scriptPath, ...args], {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function extractPagesWithPython(pdfPath: string, pagesDir: string): void {
  const script = `
import sys
from pathlib import Path

try:
    import fitz
except Exception as exc:
    raise SystemExit(f"PyMuPDF missing: {exc}")

pdf_path = Path(sys.argv[1])
pages_dir = Path(sys.argv[2])
pages_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
for idx, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=${PAGE_RENDER_DPI}, alpha=False)
    pix.save(pages_dir / f"page-{idx:02d}.png")
`;

  const scriptPath = path.join(path.dirname(pagesDir), 'extract-pages.py');
  runInlinePython(scriptPath, script, [pdfPath, pagesDir]);
}

function extractTitleBlocksWithPython(pdfPath: string, tbDir: string): void {
  const script = `
import sys
from pathlib import Path

try:
    import fitz
except Exception as exc:
    raise SystemExit(f"PyMuPDF missing: {exc}")

pdf_path = Path(sys.argv[1])
tb_dir = Path(sys.argv[2])
tb_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
for idx, page in enumerate(doc, start=1):
    rect = page.rect
    crop = fitz.Rect(rect.x0, rect.y1 * 0.76, rect.x1, rect.y1)
    pix = page.get_pixmap(dpi=${TITLE_BLOCK_DPI}, alpha=False, clip=crop)
    pix.save(tb_dir / f"title-block-{idx:02d}.png")
`;

  const scriptPath = path.join(path.dirname(tbDir), 'extract-title-blocks.py');
  runInlinePython(scriptPath, script, [pdfPath, tbDir]);
}

function extractPageTextWithPython(pdfPath: string, pageCount: number, tmpDir: string): PageTextEntry[] {
  const script = `
import json
import sys
from pathlib import Path

try:
    import fitz
except Exception as exc:
    raise SystemExit(f"PyMuPDF missing: {exc}")

pdf_path = Path(sys.argv[1])
page_count = int(sys.argv[2])

doc = fitz.open(pdf_path)
entries = []
for idx in range(page_count):
    text = doc[idx].get_text("text") if idx < len(doc) else ""
    text = (text or "").replace("\\f", "").strip()
    entries.append({
        "page": idx + 1,
        "text": text,
        "text_length": len(text),
        "has_extractable_text": bool(text),
        "source": "pdf-native" if text else "none",
    })

print(json.dumps(entries, ensure_ascii=False))
`;

  const scriptPath = path.join(tmpDir, 'extract-page-text.py');
  const raw = runInlinePython(scriptPath, script, [pdfPath, String(pageCount)]);
  return JSON.parse(raw) as PageTextEntry[];
}

function extractAllPageTextWithPython(pdfPath: string, tmpDir: string): PageTextEntry[] {
  const script = `
import json
import sys
from pathlib import Path

try:
    import fitz
except Exception as exc:
    raise SystemExit(f"PyMuPDF missing: {exc}")

pdf_path = Path(sys.argv[1])

doc = fitz.open(pdf_path)
entries = []
for idx, page in enumerate(doc):
    text = page.get_text("text") or ""
    text = text.replace("\\f", "").strip()
    entries.append({
        "page": idx + 1,
        "text": text,
        "text_length": len(text),
        "has_extractable_text": bool(text),
        "source": "pdf-native" if text else "none",
    })

print(json.dumps(entries, ensure_ascii=False))
`;

  const scriptPath = path.join(tmpDir, `extract-all-page-text-${Date.now()}.py`);
  const raw = runInlinePython(scriptPath, script, [pdfPath]);
  return JSON.parse(raw) as PageTextEntry[];
}

function normalizePageText(text: string): string {
  return text.replace(/\f/g, '').replace(/\r/g, '').trim();
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function asciiFold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isPdfFile(file: Pick<FileRecord, 'filename'>): boolean {
  return file.filename.toLowerCase().endsWith('.pdf');
}

function hasPlanBinderFilenameHint(file: Pick<FileRecord, 'filename'>): boolean {
  const normalized = asciiFold(file.filename).replace(/[^a-z0-9]+/g, ' ');
  return /\b(?:binder|plans?|plantas?|arquitetura|architecture|dwg|dwfx?|cad)\b/.test(normalized);
}

function pdfSelectionRank(file: FileRecord): number {
  if (file.file_type === 'plan-binder') {
    return 0;
  }
  if (hasPlanBinderFilenameHint(file)) {
    return 1;
  }
  return 2;
}

function sortableTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  const leftValue = asciiFold(left || '');
  const rightValue = asciiFold(right || '');
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function comparePdfFiles(left: FileRecord, right: FileRecord): number {
  const rankDelta = pdfSelectionRank(left) - pdfSelectionRank(right);
  if (rankDelta !== 0) return rankDelta;

  const timeDelta = sortableTimestamp(left.created_at) - sortableTimestamp(right.created_at);
  if (timeDelta !== 0) return timeDelta;

  return compareText(left.filename, right.filename)
    || compareText(left.storage_path, right.storage_path)
    || compareText(left.id, right.id);
}

function sortPdfFiles(files: FileRecord[]): FileRecord[] {
  return files.filter(isPdfFile).slice().sort(comparePdfFiles);
}

export function selectPlanBinderPdf(files: FileRecord[]): FileRecord | null {
  return sortPdfFiles(files)[0] || null;
}

function titleCaseFallback(page: number): string {
  return `Page ${page}`;
}

function inferDrawingNumber(text: string): number | null {
  const normalized = asciiFold(text);
  const patterns = [
    /\bdesenho\s*(?:n[.o]*\s*)?(\d{1,3})\b/,
    /\bdesenho\s*:?\s*\n?\s*(\d{1,3})\b/,
    /\bpeca\s+desenhada\s*(?:n[.o]*\s*)?(\d{1,3})\b/,
    /\b(?:folha|sheet)\s*(?:n[.o]*\s*)?(\d{1,3})\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function inferDiscipline(text: string): string | null {
  const normalized = asciiFold(text);
  if (/\b(?:planta|corte|alcado|implantacao|arquitetura|quadro sinoptico)\b/.test(normalized)) {
    return 'arquitetura-urbanismo';
  }
  if (/\b(?:estabilidade|estruturas?|fundacoes|betao|aco)\b/.test(normalized)) {
    return 'especialidades';
  }
  if (/\b(?:aguas?|saneamento|esgotos?|eletricidade|telecomunicacoes|avac|gas)\b/.test(normalized)) {
    return 'especialidades';
  }
  if (/\b(?:acessibilidades?|incendio|seguranca|scie)\b/.test(normalized)) {
    return 'acessibilidades-seguranca';
  }
  if (/\b(?:requerimento|termo de responsabilidade|memoria descritiva|licenciamento|comunicacao previa)\b/.test(normalized)) {
    return 'instrucao-administrativa';
  }
  return null;
}

function canonicalScale(raw: string): string | null {
  const allowedDenominators = new Set([
    1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500,
    1000, 2000, 5000, 10000, 25000,
  ]);
  const compact = raw
    .replace(/[|[\](){}]/g, '')
    .replace(/[il]/gi, '1')
    .replace(/[oO]/g, '0')
    .replace(/\s+/g, '')
    .trim();

  const compactOcrMatch = compact.match(/^11(20|50|100|200|500|1000)$/);
  if (compactOcrMatch) {
    const denominator = Number(compactOcrMatch[1]);
    return allowedDenominators.has(denominator) ? `1:${denominator}` : null;
  }

  const ratioMatch = compact.match(/^([14])[:/.-]?(\d{1,5})$/);
  if (!ratioMatch) {
    return null;
  }

  const denominator = Number(ratioMatch[2]);
  if (!Number.isFinite(denominator) || denominator <= 0 || !allowedDenominators.has(denominator)) {
    return null;
  }

  // OCR often reads the leading "1" in 1:100 as "4" in compressed title blocks.
  if (ratioMatch[1] === '4' && [20, 50, 100, 200, 500, 1000].includes(denominator)) {
    return `1:${denominator}`;
  }

  if (ratioMatch[1] === '1') {
    return `1:${denominator}`;
  }

  return null;
}

export function inferScale(text: string): string | null {
  const candidates: string[] = [];
  const normalized = asciiFold(text);

  for (const match of normalized.matchAll(/\b(?:escala|scala|scale|esc\.?)\s*:?\s*([^\n\r]{0,24})/gi)) {
    const window = match[1] || '';
    const scaleLike = window.match(/([il14]\s*[:/.\-]?\s*[o0-9]{1,5})/i);
    if (scaleLike) {
      candidates.push(scaleLike[1]);
    }
  }

  for (const match of normalized.matchAll(/\b([il1]\s*[:/]\s*\d{1,5})\b/gi)) {
    candidates.push(match[1]);
  }

  for (const match of normalized.matchAll(/\b(4\s*[:/]\s*(?:20|50|100|200|500|1000))\b/gi)) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const canonical = canonicalScale(candidate);
    if (canonical) {
      return canonical;
    }
  }

  return null;
}

function canonicalTitleFromText(text: string): string | null {
  const normalized = asciiFold(text);
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  const rules: Array<[RegExp, string]> = [
    [/\blevantamento\b.*\btopograf.*\bimplant/, 'Planta Levantamento Topográfico Implantação'],
    [/\bplanta\b.*\blocaliza/, 'Planta de Localização'],
    [/\blevantamento\b.*\btopograf/, 'Planta Levantamento Topográfico'],
    [/\bimplant/, 'Planta de Implantação'],
    [/\barranjos?\b.*\bexterior/, 'Arranjos Exteriores'],
    [/\bacessibil/, 'Planta de Acessibilidades'],
    [/\bplanta\b.*(?:r\/?\s*c|res do chao|r\/?\s*chao|terreo)/, 'Planta do R/Chão'],
    [/\bplanta\b.*(?:1[ºo.]?\s*andar|primeiro andar)/, 'Planta do 1º Andar'],
    [/\bal[cç]ados?\b|\balcados?\b/, 'Alçados'],
    [/\bpormenores?\b/, 'Pormenores'],
    [/\bcortes?\b/, 'Cortes'],
    [/\bquadro\b.*\bsin[oó]ptico|\bsinoptico\b/, 'Quadro Sinóptico'],
    [/\blista\b.*\blayer/, 'Lista de Layers'],
    [/\bcobertura\b/, 'Planta de Cobertura'],
  ];

  for (const [pattern, title] of rules) {
    if (pattern.test(normalized)) {
      return title;
    }
  }

  if (
    compact.includes('plantadelocalizacao')
    || compact.includes('plantadeocalizacao')
    || compact.includes('plantadeocalzacao')
    || (compact.includes('planta') && compact.includes('zacao'))
  ) return 'Planta de Localização';
  if (compact.includes('plantalevantamentotopografico') && compact.includes('implantacao')) {
    return 'Planta Levantamento Topográfico Implantação';
  }
  if (compact.includes('levantamentotopografico')) return 'Planta Levantamento Topográfico';
  if (compact.includes('implantacao')) return 'Planta de Implantação';
  if (compact.includes('arranjos') && (compact.includes('exteriores') || compact.includes('ores'))) {
    return 'Arranjos Exteriores';
  }
  if (
    compact.includes('acessibilidades')
    || compact.includes('acessibildades')
    || compact.includes('acessbidades')
    || (compact.includes('acess') && compact.includes('dades'))
  ) return 'Planta de Acessibilidades';
  if (compact.includes('plantadorchao') || compact.includes('plantadorohao')) return 'Planta do R/Chão';
  if (compact.includes('andar')) return 'Planta do 1º Andar';
  if (compact.includes('cobertura') || compact.includes('jobertura')) return 'Planta de Cobertura';
  if (compact.includes('murosdevedacao') || compact.includes('murosdevedaoao') || compact.includes('jrosdevedacao')) return 'Muros de Vedação';
  if (compact.includes('alcados') || compact.includes('algados')) return 'Alçados';
  if (
    compact.includes('pormenores')
    || compact.includes('pormnores')
    || compact.includes('porrmenores')
    || compact.includes('menores') && compact.includes('construtivos')
    || compact.includes('porm') && compact.includes('construtivos')
  ) return 'Pormenores Construtivos';
  if (compact.includes('quadrosinoptico') || compact.includes('quadrocinoptico')) return 'Quadro Sinóptico';
  if (compact.includes('listadelayers') || compact.includes('listadelayer')) return 'Lista de Layers';
  if (compact.includes('cortes')) return 'Cortes';

  return null;
}

function inferTitle(entry: PageTextEntry, titleBlockText = ''): { title: string; confirmed: boolean } {
  const combinedText = [entry.text, titleBlockText].filter(Boolean).join('\n');
  const canonical = canonicalTitleFromText(combinedText);
  if (canonical) {
    return { title: canonical, confirmed: true };
  }

  const lines = combinedText
    .split(/\n+/)
    .map(compactLine)
    .filter((line) => line.length >= 3 && line.length <= 120);

  const titlePatterns = [
    /\bplanta\b/i,
    /\bcorte\b/i,
    /\balcado\b/i,
    /\bimplantacao\b/i,
    /\blocalizacao\b/i,
    /\bquadro\s+sinoptico\b/i,
    /\bmemoria\s+descritiva\b/i,
    /\btermo\s+de\s+responsabilidade\b/i,
    /\bpecas?\s+desenhadas?\b/i,
  ];

  const title = lines.find((line) => {
    const normalizedLine = asciiFold(line);
    return titlePatterns.some((pattern) => pattern.test(normalizedLine));
  });
  if (title) {
    return { title, confirmed: true };
  }

  const fallback = lines.find((line) => {
    const normalizedLine = asciiFold(line);
    return /[a-z]/.test(normalizedLine)
      && !/\b(projetos|arquitetura-especialidades|engenharia|consultoria|gmail|requerente|local|obra|desenho|data)\b/.test(normalizedLine);
  }) || titleCaseFallback(entry.page);
  return { title: fallback, confirmed: false };
}

function inferManifestConfidence(
  titleConfirmed: boolean,
  drawingNumber: number | null,
  scale: string | null,
): 'high' | 'medium' | 'low' {
  if (titleConfirmed && drawingNumber != null) {
    return 'high';
  }
  if (titleConfirmed || drawingNumber != null || scale) {
    return 'medium';
  }
  return 'low';
}

export function buildPreliminarySheetManifest(
  pageTextEntries: PageTextEntry[],
  sourcePdf: string,
  titleBlockTextEntries: TitleBlockTextEntry[] = [],
): { source_pdf: string; generated_by: string; confidence: string; sheets: PreliminarySheetEntry[] } {
  const titleBlockTextByPage = new Map(
    titleBlockTextEntries.map((entry) => [entry.page, entry.text]),
  );

  return {
    source_pdf: sourcePdf,
    generated_by: 'crossbeam-preextract',
    confidence: 'preliminary',
    sheets: pageTextEntries.map((entry) => {
      const titleBlockText = titleBlockTextByPage.get(entry.page) || '';
      const combinedText = [entry.text, titleBlockText].filter(Boolean).join('\n');
      const { title, confirmed } = inferTitle(entry, titleBlockText);
      const desenho = inferDrawingNumber(combinedText)
        ?? (/\bdesenho\b|projetos:\s*arquitetura/i.test(asciiFold(combinedText)) ? entry.page : null);
      const scale = inferScale(combinedText);
      const extractionConfidence = inferManifestConfidence(confirmed, desenho, scale);
      return {
        page: entry.page,
        desenho,
        title,
        notes: entry.has_extractable_text
          ? `Native PDF text available (${entry.text_length} chars)`
          : 'No native PDF text; verify with page image/title block',
        discipline: inferDiscipline(entry.text),
        title_confirmed: confirmed,
        scale,
        extraction_confidence: extractionConfidence,
        needs_visual_review: extractionConfidence !== 'high',
        page_png_path: `pages-png/page-${String(entry.page).padStart(2, '0')}.png`,
        title_block_png_path: `title-blocks/title-block-${String(entry.page).padStart(2, '0')}.png`,
      };
    }),
  };
}

function buildPreflightSummary(
  pageTextEntries: PageTextEntry[],
  manifest: ReturnType<typeof buildPreliminarySheetManifest>,
): Record<string, unknown> {
  const pagesWithNativeText = pageTextEntries.filter((entry) => entry.has_extractable_text).length;
  const disciplineCounts = manifest.sheets.reduce<Record<string, number>>((acc, sheet) => {
    const key = sheet.discipline || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    generated_by: 'crossbeam-preextract',
    page_count: pageTextEntries.length,
    pages_with_native_text: pagesWithNativeText,
    pages_without_native_text: pageTextEntries.length - pagesWithNativeText,
    preliminary_manifest_confidence: manifest.confidence,
    discipline_counts: disciplineCounts,
    cost_optimization_note: 'Use this metadata to avoid re-discovering page count, native text availability, and initial sheet grouping.',
  };
}

function extractPageText(pdfPath: string, pageCount: number, tmpDir: string): PageTextEntry[] {
  const pdftotextPath = resolveCommand('pdftotext', popplerCommandCandidates('pdftotext'));
  if (pdftotextPath) {
    try {
      return Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        const text = normalizePageText(
          execFileSync(
            pdftotextPath,
            ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
          ),
        );
        return {
          page,
          text,
          text_length: text.length,
          has_extractable_text: text.length > 0,
          source: text.length > 0 ? 'pdf-native' : 'none',
        } satisfies PageTextEntry;
      });
    } catch (error) {
      console.warn('pdftotext failed, falling back to Python/PyMuPDF text extraction:', error);
    }
  }

  try {
    return extractPageTextWithPython(pdfPath, pageCount, tmpDir);
  } catch (error) {
    console.warn('Python/PyMuPDF page text extraction failed, returning empty text artifact:', error);
    return Array.from({ length: pageCount }, (_, index) => ({
      page: index + 1,
      text: '',
      text_length: 0,
      has_extractable_text: false,
      source: 'none',
    }));
  }
}

function getPdfPageCount(pdfPath: string): number {
  const pdfinfoPath = resolveCommand('pdfinfo', popplerCommandCandidates('pdfinfo'));
  if (pdfinfoPath) {
    const output = execFileSync(pdfinfoPath, [pdfPath], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const match = output.match(/^Pages:\s+(\d+)/m);
    if (match) {
      return Number(match[1]);
    }
  }

  const pythonPath = resolvePythonCommand();
  if (!pythonPath) {
    throw new Error('pdfinfo or python3/PyMuPDF is required to determine PDF page count');
  }

  const script = `
import sys
try:
    import fitz
except Exception as exc:
    raise SystemExit(f"PyMuPDF missing: {exc}")
doc = fitz.open(sys.argv[1])
print(len(doc))
`;
  const scriptPath = path.join(path.dirname(pdfPath), `pdf-page-count-${Date.now()}.py`);
  const raw = runInlinePython(scriptPath, script, [pdfPath], 30_000);
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not determine page count for ${pdfPath}`);
  }
  return parsed;
}

function validatePdfFileForExtraction(
  file: FileRecord,
  pdfPath: string,
  limits: PdfExtractionLimits,
): number {
  const sizeBytes = fs.statSync(pdfPath).size;
  if (sizeBytes > limits.maxBytes) {
    throw new Error(
      `${file.filename} is ${formatBytes(sizeBytes)}, above the ${formatBytes(limits.maxBytes)} PDF size limit`,
    );
  }

  const fd = fs.openSync(pdfPath, 'r');
  try {
    const header = Buffer.alloc(PDF_MAGIC_HEADER_BYTES);
    const bytesRead = fs.readSync(fd, header, 0, PDF_MAGIC_HEADER_BYTES, 0);
    if (!hasPdfMagicBytes(header.subarray(0, bytesRead))) {
      throw new Error(`${file.filename} is not a valid PDF: missing %PDF header`);
    }
  } finally {
    fs.closeSync(fd);
  }

  const pageCount = getPdfPageCount(pdfPath);
  assertPdfPageCountIsSafe(file.filename, pageCount, limits);
  return pageCount;
}

function storagePartsForFile(file: FileRecord): { bucket: string; storagePath: string } {
  let bucket: string;
  let storagePath: string;
  if (file.storage_path.startsWith('crossbeam-demo-assets/')) {
    bucket = 'crossbeam-demo-assets';
    storagePath = file.storage_path.replace('crossbeam-demo-assets/', '');
  } else if (file.storage_path.startsWith('crossbeam-uploads/')) {
    bucket = 'crossbeam-uploads';
    storagePath = file.storage_path.replace('crossbeam-uploads/', '');
  } else {
    bucket = 'crossbeam-uploads';
    storagePath = file.storage_path;
  }
  return { bucket, storagePath };
}

async function downloadPdfToPath(
  file: FileRecord,
  destinationPath: string,
  limits: PdfExtractionLimits,
): Promise<void> {
  assertPdfMetadataIsSafe(file, limits);

  const { bucket, storagePath } = storagePartsForFile(file);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(storagePath);

    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      assertPdfBufferIsSafe(file.filename, buffer, limits);
      fs.writeFileSync(destinationPath, buffer);
      return;
    }

    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`PDF download failed for ${file.filename}: ${message}`);
}

async function buildDocumentTextArtifact(
  files: FileRecord[],
  tmpDir: string,
): Promise<DocumentTextArtifact> {
  const pdfFiles = sortPdfFiles(files);
  const documents: DocumentTextArtifact['documents'] = [];
  const limits = documentTextLimitsFromEnv();
  let totalPages = 0;

  for (const file of pdfFiles) {
    const pdfPath = path.join(tmpDir, `doc-text-${documents.length + 1}.pdf`);
    try {
      await downloadPdfToPath(file, pdfPath, limits);
      const pageCount = validatePdfFileForExtraction(file, pdfPath, limits);
      if (totalPages + pageCount > limits.maxTotalPages) {
        throw new Error(
          `${file.filename} would exceed the ${limits.maxTotalPages} total supporting-document page limit`,
        );
      }
      totalPages += pageCount;

      let pages: PageTextEntry[];
      try {
        pages = extractPageText(pdfPath, pageCount, tmpDir);
      } catch (popplerError) {
        console.warn(`Poppler text extraction failed for ${file.filename}, falling back to PyMuPDF:`, popplerError);
        pages = extractAllPageTextWithPython(pdfPath, tmpDir);
      }
      documents.push({
        filename: file.filename,
        file_type: file.file_type || null,
        page_count: pages.length,
        pages_with_native_text: pages.filter((page) => page.has_extractable_text).length,
        pages,
      });
    } catch (error) {
      console.warn(`Failed to extract document text for ${file.filename}:`, error);
      const skippedReason = error instanceof Error ? error.message : 'Unknown PDF extraction error';
      documents.push({
        filename: file.filename,
        file_type: file.file_type || null,
        page_count: 0,
        pages_with_native_text: 0,
        pages: [],
        skipped_reason: skippedReason,
      });
    }
  }

  return {
    generated_by: 'crossbeam-preextract',
    documents,
  };
}

function renamePagePngs(pagesDir: string): void {
  for (const file of fs.readdirSync(pagesDir).filter(name => name.startsWith('page-'))) {
    const match = file.match(/page-0*(\d+)\.png/);
    if (!match) {
      continue;
    }

    const padded = match[1].padStart(2, '0');
    const newName = `page-${padded}.png`;
    if (file !== newName) {
      fs.renameSync(path.join(pagesDir, file), path.join(pagesDir, newName));
    }
  }
}

function cropTitleBlocksWithImageMagick(
  imageMagick: ImageMagickCommands,
  pagesDir: string,
  tbDir: string,
): void {
  for (const pageFile of fs.readdirSync(pagesDir).filter(name => name.endsWith('.png')).sort()) {
    const pagePath = path.join(pagesDir, pageFile);
    const num = pageFile.replace('page-', '').replace('.png', '');
    const tbPath = path.join(tbDir, `title-block-${num}.png`);
    const dims = execFileSync(imageMagick.identify[0], [...imageMagick.identify.slice(1), '-format', '%w %h', pagePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const [w, h] = dims.split(' ').map(Number);

    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      throw new Error(`Could not read dimensions for ${pageFile}`);
    }

    const cropW = w;
    const cropH = Math.floor(h * 24 / 100);
    const cropX = 0;
    const cropY = h - cropH;

    execFileSync(
      imageMagick.convert[0],
      [...imageMagick.convert.slice(1), pagePath, '-crop', `${cropW}x${cropH}+${cropX}+${cropY}`, '+repage', tbPath],
      { timeout: 30_000, stdio: 'pipe' },
    );
  }
}

function extractTitleBlockTexts(
  imageMagick: ImageMagickCommands,
  tbDir: string,
  tmpDir: string,
): TitleBlockTextEntry[] {
  const tesseractPath = resolveCommand('tesseract');
  const titleBlockFiles = fs.readdirSync(tbDir)
    .filter(name => name.endsWith('.png'))
    .sort();

  if (!tesseractPath) {
    console.warn('tesseract not found; title block OCR artifact will be empty');
    return titleBlockFiles.map((file) => {
      const page = Number(file.match(/title-block-0*(\d+)\.png/)?.[1] || 0);
      return {
        page,
        text: '',
        text_length: 0,
        has_ocr_text: false,
        source: 'none',
      };
    });
  }
  const tesseractCommand = tesseractPath;

  function mergeOcrText(...texts: string[]): string {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const text of texts) {
      for (const line of text.split(/\n+/).map(compactLine).filter(Boolean)) {
        const key = asciiFold(line).replace(/\s+/g, ' ');
        if (!seen.has(key)) {
          seen.add(key);
          lines.push(line);
        }
      }
    }
    return lines.join('\n');
  }

  function runTesseract(inputPath: string, psm: string): string {
    return normalizePageText(execFileSync(
      tesseractCommand,
      [inputPath, 'stdout', '-l', 'por+eng', '--psm', psm],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    ));
  }

  return titleBlockFiles.map((file) => {
    const page = Number(file.match(/title-block-0*(\d+)\.png/)?.[1] || 0);
    const inputPath = path.join(tbDir, file);
    const processedPath = path.join(tmpDir, `ocr-${file}`);

    try {
      execFileSync(
        imageMagick.convert[0],
        [
          ...imageMagick.convert.slice(1),
          inputPath,
          '-colorspace', 'Gray',
          '-resize', '220%',
          '-contrast-stretch', '0.5%x0.5%',
          '-sharpen', '0x1',
          processedPath,
        ],
        { timeout: 30_000, stdio: 'pipe' },
      );

      const text = mergeOcrText(
        runTesseract(processedPath, '6'),
        runTesseract(processedPath, '11'),
      );

      return {
        page,
        text,
        text_length: text.length,
        has_ocr_text: text.length > 0,
        source: text.length > 0 ? 'tesseract' : 'none',
      } satisfies TitleBlockTextEntry;
    } catch (error) {
      console.warn(`Title block OCR failed for ${file}:`, error);
      return {
        page,
        text: '',
        text_length: 0,
        has_ocr_text: false,
        source: 'none',
      } satisfies TitleBlockTextEntry;
    }
  });
}

async function upsertArtifactRecord(
  projectId: string,
  files: FileRecord[],
  record: {
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  },
): Promise<void> {
  const payload = {
    project_id: projectId,
    file_type: 'other',
    ...record,
  };
  const existingRecord = files.find((file) => file.filename === record.filename);

  if (existingRecord?.id) {
    const { error } = await supabase
      .schema('crossbeam')
      .from('files')
      .update(payload)
      .eq('id', existingRecord.id);
    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabase
    .schema('crossbeam')
    .from('files')
    .insert(payload);
  if (error) {
    throw error;
  }
}

export async function getMissingExtractionArtifacts(projectId: string): Promise<string[]> {
  const { data: files, error } = await supabase
    .schema('crossbeam')
    .from('files')
    .select('filename')
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to check extraction artifacts: ${error.message}`);
  }

  const filenames = new Set((files || []).map((file: { filename: string }) => file.filename));
  return REQUIRED_EXTRACTION_ARTIFACTS.filter((name) => !filenames.has(name));
}

export async function assertExtractionArtifactsReady(projectId: string): Promise<void> {
  const missing = await getMissingExtractionArtifacts(projectId);
  if (missing.length > 0) {
    throw new Error(`Required extraction artifacts missing: ${missing.join(', ')}`);
  }
}

/**
 * Extract a PDF binder into page PNGs + title block crops on Cloud Run,
 * then upload the archives back to Supabase Storage and insert file records.
 *
 * This runs on the Cloud Run server (which has poppler + imagemagick baked
 * into the Docker image), so the Vercel Sandbox never needs system packages.
 */
export async function extractPdfForProject(
  projectId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const { data: files, error: filesErr } = await supabase
    .schema('crossbeam')
    .from('files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .order('filename', { ascending: true });

  if (filesErr) {
    throw new Error(`Failed to get files: ${filesErr.message}`);
  }

  const existingFiles = (files || []) as FileRecord[];
  const hasAllArtifacts = REQUIRED_EXTRACTION_ARTIFACTS.every((name) => existingFiles.some((file) => file.filename === name));
  if (hasAllArtifacts && !options.force) {
    console.log(`Project ${projectId}: extraction artifacts already exist, skipping extraction`);
    return;
  }

  const pdfFile = selectPlanBinderPdf(existingFiles);
  if (!pdfFile) {
    console.log(`Project ${projectId}: no PDF found, skipping extraction`);
    return;
  }
  console.log(`Project ${projectId}: selected ${pdfFile.filename} (${pdfFile.file_type || 'unknown'}) for extraction`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-extract-'));
  console.log(`Extracting PDF for project ${projectId} in ${tmpDir}`);
  insertMessage(projectId, 'system', 'Extracting plan pages from PDF...').catch(() => {});

  try {
    const limits = pdfExtractionLimitsFromEnv('plan-binder');
    const pdfPath = path.join(tmpDir, 'binder.pdf');
    await downloadPdfToPath(pdfFile, pdfPath, limits);
    const expectedPageCount = validatePdfFileForExtraction(pdfFile, pdfPath, limits);
    console.log(`Downloaded PDF: ${(fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1)} MB, ${expectedPageCount} pages`);

    const pagesDir = path.join(tmpDir, 'pages-png');
    fs.mkdirSync(pagesDir);

    const pdftoppmPath = requireCommand(
      'pdftoppm',
      popplerCommandCandidates('pdftoppm'),
      'local extraction',
    );
    try {
      execFileSync(pdftoppmPath, ['-png', '-r', String(PAGE_RENDER_DPI), pdfPath, path.join(pagesDir, 'page')], {
        timeout: 180_000,
        stdio: 'pipe',
      });
      renamePagePngs(pagesDir);
    } catch (error) {
      console.warn('pdftoppm failed, falling back to Python/PyMuPDF extraction:', error);
      extractPagesWithPython(pdfPath, pagesDir);
    }

    const pageCount = fs.readdirSync(pagesDir).filter(name => name.endsWith('.png')).length;
    console.log(`Extracted ${pageCount} pages at ${PAGE_RENDER_DPI} DPI`);
    if (pageCount !== expectedPageCount) {
      console.warn(`Rendered page count (${pageCount}) differs from PDF metadata (${expectedPageCount}) for ${pdfFile.filename}`);
    }

    const tbDir = path.join(tmpDir, 'title-blocks');
    fs.mkdirSync(tbDir);

    const imageMagick = requireImageMagickCommands('local extraction');
    if (resolvePythonCommand()) {
      try {
        extractTitleBlocksWithPython(pdfPath, tbDir);
      } catch (pythonError) {
        console.warn('Python/PyMuPDF title block extraction failed, falling back to ImageMagick cropping:', pythonError);
        fs.rmSync(tbDir, { recursive: true, force: true });
        fs.mkdirSync(tbDir);
        cropTitleBlocksWithImageMagick(imageMagick, pagesDir, tbDir);
      }
    } else {
      cropTitleBlocksWithImageMagick(imageMagick, pagesDir, tbDir);
    }

    const tbCount = fs.readdirSync(tbDir).filter(name => name.endsWith('.png')).length;
    console.log(`Cropped ${tbCount} title blocks at up to ${TITLE_BLOCK_DPI} DPI`);

    const titleBlockTextEntries = extractTitleBlockTexts(imageMagick, tbDir, tmpDir);
    const titleBlockTextPath = path.join(tmpDir, 'title-block-text.json');
    fs.writeFileSync(titleBlockTextPath, JSON.stringify(titleBlockTextEntries, null, 2), 'utf8');
    const titleBlocksWithOcrText = titleBlockTextEntries.filter((entry) => entry.has_ocr_text).length;
    console.log(`OCR extracted title-block text from ${titleBlocksWithOcrText}/${tbCount} title blocks`);

    const pageTextEntries = extractPageText(pdfPath, pageCount, tmpDir);
    const pageTextPath = path.join(tmpDir, 'page-text.json');
    fs.writeFileSync(pageTextPath, JSON.stringify(pageTextEntries, null, 2), 'utf8');
    const pagesWithNativeText = pageTextEntries.filter((entry) => entry.has_extractable_text).length;
    console.log(`Extracted native PDF text from ${pagesWithNativeText}/${pageCount} pages`);

    const preliminaryManifest = buildPreliminarySheetManifest(pageTextEntries, pdfFile.filename, titleBlockTextEntries);
    const sheetManifestPath = path.join(tmpDir, 'sheet-manifest.json');
    fs.writeFileSync(sheetManifestPath, JSON.stringify(preliminaryManifest, null, 2), 'utf8');

    const preflightSummaryPath = path.join(tmpDir, 'preflight-summary.json');
    fs.writeFileSync(
      preflightSummaryPath,
      JSON.stringify(buildPreflightSummary(pageTextEntries, preliminaryManifest), null, 2),
      'utf8',
    );

    const documentTextPath = path.join(tmpDir, 'document-text.json');
    const documentText = await buildDocumentTextArtifact(existingFiles, tmpDir);
    fs.writeFileSync(documentTextPath, JSON.stringify(documentText, null, 2), 'utf8');

    const pagesArchive = path.join(tmpDir, 'pages-png.tar.gz');
    const tbArchive = path.join(tmpDir, 'title-blocks.tar.gz');

    execSync(`tar czf "${pagesArchive}" -C "${tmpDir}" pages-png`, { timeout: 60_000 });
    execSync(`tar czf "${tbArchive}" -C "${tmpDir}" title-blocks`, { timeout: 60_000 });

    const pagesMB = (fs.statSync(pagesArchive).size / 1024 / 1024).toFixed(1);
    const tbMB = (fs.statSync(tbArchive).size / 1024 / 1024).toFixed(1);
    console.log(`Archives: pages=${pagesMB}MB, title-blocks=${tbMB}MB`);

    const archiveBucket = 'crossbeam-uploads';
    const { storagePath } = storagePartsForFile(pdfFile);
    const prefix = storagePath.replace(/\/[^/]+$/, '');

    const artifacts: UploadArtifact[] = [
      { localPath: pagesArchive, name: 'pages-png.tar.gz', contentType: 'application/gzip' },
      { localPath: tbArchive, name: 'title-blocks.tar.gz', contentType: 'application/gzip' },
      { localPath: pageTextPath, name: 'page-text.json', contentType: 'application/json' },
      { localPath: titleBlockTextPath, name: 'title-block-text.json', contentType: 'application/json' },
      { localPath: sheetManifestPath, name: 'sheet-manifest.json', contentType: 'application/json' },
      { localPath: preflightSummaryPath, name: 'preflight-summary.json', contentType: 'application/json' },
      { localPath: documentTextPath, name: 'document-text.json', contentType: 'application/json' },
    ];

    for (const artifact of artifacts) {
      const artifactStoragePath = `${prefix}/${artifact.name}`;
      const artifactBuffer = fs.readFileSync(artifact.localPath);
      const { error: upErr } = await supabase.storage
        .from(archiveBucket)
        .upload(artifactStoragePath, artifactBuffer, {
          contentType: artifact.contentType,
          upsert: true,
        });
      if (upErr) {
        console.error(`Upload failed for ${artifact.name}: ${upErr.message}`);
        throw upErr;
      }
      console.log(`Uploaded: ${archiveBucket}/${artifactStoragePath}`);

      await upsertArtifactRecord(projectId, existingFiles, {
        filename: artifact.name,
        storage_path: `${archiveBucket}/${artifactStoragePath}`,
        mime_type: artifact.contentType,
        size_bytes: fs.statSync(artifact.localPath).size,
      });
    }

    insertMessage(
      projectId,
      'system',
      `Extraction complete: ${pageCount} pages, ${tbCount} title blocks, ${pagesWithNativeText} pages with native text`,
    ).catch(() => {});
    console.log(`Extraction complete for project ${projectId}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
