import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { supabase, insertMessage } from './supabase.js';

const PAGE_RENDER_DPI = 300;
const TITLE_BLOCK_DPI = 400;

const WINDOWS_PDFTOPPM_CANDIDATES = [
  'C:\\Users\\Duarte\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe',
];

const WINDOWS_PDFTOTEXT_CANDIDATES = [
  'C:\\Users\\Duarte\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftotext.exe',
];

const WINDOWS_MAGICK_CANDIDATES = [
  'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
];

const WINDOWS_IDENTIFY_CANDIDATES: string[] = [];
const WINDOWS_CONVERT_CANDIDATES: string[] = [];

interface ImageMagickCommands {
  identify: string[];
  convert: string[];
}

export interface PageTextEntry {
  page: number;
  text: string;
  text_length: number;
  has_extractable_text: boolean;
  source: 'pdf-native' | 'none';
}

export interface PreliminarySheetEntry {
  page: number;
  desenho: number | null;
  title: string;
  notes: string;
  discipline: string | null;
  title_confirmed: boolean;
  scale: string | null;
  page_png_path: string;
  title_block_png_path: string;
}

interface FileRecord {
  id?: string;
  filename: string;
  storage_path: string;
  file_type?: string;
}

interface UploadArtifact {
  localPath: string;
  name: string;
  contentType: string;
}

function resolveCommand(command: string, windowsCandidates: string[] = []): string | null {
  for (const candidate of windowsCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(locator, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).find(Boolean)?.trim() || null;
  } catch {
    return null;
  }
}

function requireCommand(command: string, windowsCandidates: string[] = []): string {
  const resolved = resolveCommand(command, windowsCandidates);
  if (!resolved) {
    throw new Error(`${command} is required for local extraction but was not found in PATH`);
  }
  return resolved;
}

function resolvePythonCommand(): string | null {
  return resolveCommand('python3') || resolveCommand('python');
}

function resolveImageMagickCommands(): ImageMagickCommands {
  const magickPath = resolveCommand('magick', WINDOWS_MAGICK_CANDIDATES);
  if (magickPath) {
    return {
      identify: [magickPath, 'identify'],
      convert: [magickPath],
    };
  }

  return {
    identify: [requireCommand('identify', WINDOWS_IDENTIFY_CANDIDATES)],
    convert: [requireCommand('convert', WINDOWS_CONVERT_CANDIDATES)],
  };
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
    crop = fitz.Rect(rect.x1 * 0.75, rect.y1 * 0.65, rect.x1, rect.y1)
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

function normalizePageText(text: string): string {
  return text.replace(/\f/g, '').replace(/\r/g, '').trim();
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function asciiFold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function titleCaseFallback(page: number): string {
  return `Page ${page}`;
}

function inferDrawingNumber(text: string): number | null {
  const normalized = asciiFold(text);
  const patterns = [
    /\bdesenho\s*(?:n[.o]*\s*)?(\d{1,3})\b/,
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

function inferScale(text: string): string | null {
  const match = text.match(/\b(?:escala|scale)\s*:?\s*(1\s*[:/]\s*\d{1,4})\b/i)
    || text.match(/\b(1\s*[:/]\s*\d{1,4})\b/);
  return match ? compactLine(match[1]).replace(/\s+/g, '') : null;
}

function inferTitle(entry: PageTextEntry): { title: string; confirmed: boolean } {
  const lines = entry.text
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

  const fallback = lines.find((line) => /[A-Za-z]/.test(asciiFold(line))) || titleCaseFallback(entry.page);
  return { title: fallback, confirmed: false };
}

export function buildPreliminarySheetManifest(
  pageTextEntries: PageTextEntry[],
  sourcePdf: string,
): { source_pdf: string; generated_by: string; confidence: string; sheets: PreliminarySheetEntry[] } {
  return {
    source_pdf: sourcePdf,
    generated_by: 'crossbeam-preextract',
    confidence: 'preliminary',
    sheets: pageTextEntries.map((entry) => {
      const { title, confirmed } = inferTitle(entry);
      return {
        page: entry.page,
        desenho: inferDrawingNumber(entry.text),
        title,
        notes: entry.has_extractable_text
          ? `Native PDF text available (${entry.text_length} chars)`
          : 'No native PDF text; verify with page image/title block',
        discipline: inferDiscipline(entry.text),
        title_confirmed: confirmed,
        scale: inferScale(entry.text),
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
  const pdftotextPath = resolveCommand('pdftotext', WINDOWS_PDFTOTEXT_CANDIDATES);
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

    const cropW = Math.floor(w * 25 / 100);
    const cropH = Math.floor(h * 35 / 100);
    const cropX = w - cropW;
    const cropY = h - cropH;

    execFileSync(
      imageMagick.convert[0],
      [...imageMagick.convert.slice(1), pagePath, '-crop', `${cropW}x${cropH}+${cropX}+${cropY}`, '+repage', tbPath],
      { timeout: 30_000, stdio: 'pipe' },
    );
  }
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
    .eq('project_id', projectId);

  if (filesErr) {
    throw new Error(`Failed to get files: ${filesErr.message}`);
  }

  const existingFiles = (files || []) as FileRecord[];
  const requiredArtifacts = [
    'pages-png.tar.gz',
    'title-blocks.tar.gz',
    'page-text.json',
    'sheet-manifest.json',
    'preflight-summary.json',
  ];
  const hasAllArtifacts = requiredArtifacts.every((name) => existingFiles.some((file) => file.filename === name));
  if (hasAllArtifacts && !options.force) {
    console.log(`Project ${projectId}: extraction artifacts already exist, skipping extraction`);
    return;
  }

  const pdfFile = existingFiles.find(
    (file) => file.file_type === 'plan-binder' && file.filename.toLowerCase().endsWith('.pdf'),
  ) || existingFiles.find(
    (file) => file.filename.toLowerCase().endsWith('.pdf'),
  );
  if (!pdfFile) {
    console.log(`Project ${projectId}: no PDF found, skipping extraction`);
    return;
  }

  let bucket: string;
  let storagePath: string;
  if (pdfFile.storage_path.startsWith('crossbeam-demo-assets/')) {
    bucket = 'crossbeam-demo-assets';
    storagePath = pdfFile.storage_path.replace('crossbeam-demo-assets/', '');
  } else if (pdfFile.storage_path.startsWith('crossbeam-uploads/')) {
    bucket = 'crossbeam-uploads';
    storagePath = pdfFile.storage_path.replace('crossbeam-uploads/', '');
  } else {
    bucket = 'crossbeam-uploads';
    storagePath = pdfFile.storage_path;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-extract-'));
  console.log(`Extracting PDF for project ${projectId} in ${tmpDir}`);
  insertMessage(projectId, 'system', 'Extracting plan pages from PDF...').catch(() => {});

  try {
    const { data: pdfData, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(storagePath);

    if (dlErr || !pdfData) {
      throw new Error(`PDF download failed: ${dlErr?.message}`);
    }

    const pdfPath = path.join(tmpDir, 'binder.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(await pdfData.arrayBuffer()));
    console.log(`Downloaded PDF: ${(fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1)} MB`);

    const pagesDir = path.join(tmpDir, 'pages-png');
    fs.mkdirSync(pagesDir);

    const pdftoppmPath = requireCommand('pdftoppm', WINDOWS_PDFTOPPM_CANDIDATES);
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

    const tbDir = path.join(tmpDir, 'title-blocks');
    fs.mkdirSync(tbDir);

    const imageMagick = resolveImageMagickCommands();
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

    const pageTextEntries = extractPageText(pdfPath, pageCount, tmpDir);
    const pageTextPath = path.join(tmpDir, 'page-text.json');
    fs.writeFileSync(pageTextPath, JSON.stringify(pageTextEntries, null, 2), 'utf8');
    const pagesWithNativeText = pageTextEntries.filter((entry) => entry.has_extractable_text).length;
    console.log(`Extracted native PDF text from ${pagesWithNativeText}/${pageCount} pages`);

    const preliminaryManifest = buildPreliminarySheetManifest(pageTextEntries, pdfFile.filename);
    const sheetManifestPath = path.join(tmpDir, 'sheet-manifest.json');
    fs.writeFileSync(sheetManifestPath, JSON.stringify(preliminaryManifest, null, 2), 'utf8');

    const preflightSummaryPath = path.join(tmpDir, 'preflight-summary.json');
    fs.writeFileSync(
      preflightSummaryPath,
      JSON.stringify(buildPreflightSummary(pageTextEntries, preliminaryManifest), null, 2),
      'utf8',
    );

    const pagesArchive = path.join(tmpDir, 'pages-png.tar.gz');
    const tbArchive = path.join(tmpDir, 'title-blocks.tar.gz');

    execSync(`tar czf "${pagesArchive}" -C "${tmpDir}" pages-png`, { timeout: 60_000 });
    execSync(`tar czf "${tbArchive}" -C "${tmpDir}" title-blocks`, { timeout: 60_000 });

    const pagesMB = (fs.statSync(pagesArchive).size / 1024 / 1024).toFixed(1);
    const tbMB = (fs.statSync(tbArchive).size / 1024 / 1024).toFixed(1);
    console.log(`Archives: pages=${pagesMB}MB, title-blocks=${tbMB}MB`);

    const archiveBucket = 'crossbeam-uploads';
    const prefix = storagePath.replace(/\/[^/]+$/, '');

    const artifacts: UploadArtifact[] = [
      { localPath: pagesArchive, name: 'pages-png.tar.gz', contentType: 'application/gzip' },
      { localPath: tbArchive, name: 'title-blocks.tar.gz', contentType: 'application/gzip' },
      { localPath: pageTextPath, name: 'page-text.json', contentType: 'application/json' },
      { localPath: sheetManifestPath, name: 'sheet-manifest.json', contentType: 'application/json' },
      { localPath: preflightSummaryPath, name: 'preflight-summary.json', contentType: 'application/json' },
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
