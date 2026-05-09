import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProjectFiles, supabase, uploadOutputArtifact } from './supabase.js';

const WINDOWS_MAGICK_CANDIDATES = [
  'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
];

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: 'pixel' | 'percent';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveCommand(command: string, windowsCandidates: string[] = []): string | null {
  for (const candidate of windowsCandidates) {
    if (fs.existsSync(candidate)) return candidate;
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

function storageParts(storagePath: string): { bucket: string; path: string } {
  if (storagePath.startsWith('crossbeam-demo-assets/')) {
    return { bucket: 'crossbeam-demo-assets', path: storagePath.replace('crossbeam-demo-assets/', '') };
  }
  if (storagePath.startsWith('crossbeam-uploads/')) {
    return { bucket: 'crossbeam-uploads', path: storagePath.replace('crossbeam-uploads/', '') };
  }
  if (storagePath.startsWith('crossbeam-outputs/')) {
    return { bucket: 'crossbeam-outputs', path: storagePath.replace('crossbeam-outputs/', '') };
  }
  return { bucket: 'crossbeam-uploads', path: storagePath };
}

function parseCropBox(entry: Record<string, unknown>): CropBox | null {
  const raw = asRecord(entry.crop_box) || asRecord(entry.crop_bbox) || asRecord(entry.bbox);
  if (raw) {
    const x = asNumber(raw.x);
    const y = asNumber(raw.y);
    const width = asNumber(raw.width ?? raw.w);
    const height = asNumber(raw.height ?? raw.h);
    if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) return null;
    const unitValue = asString(raw.unit);
    const unit = unitValue === 'percent' || unitValue === 'ratio' || [x, y, width, height].every((n) => n <= 1)
      ? 'percent'
      : 'pixel';
    return { x, y, width, height, unit };
  }

  const arrayBox = Array.isArray(entry.crop_box) ? entry.crop_box : Array.isArray(entry.bbox) ? entry.bbox : null;
  if (arrayBox && arrayBox.length >= 4) {
    const [x, y, width, height] = arrayBox.map((value) => asNumber(value));
    if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) return null;
    const unit = [x, y, width, height].every((n) => n <= 1) ? 'percent' : 'pixel';
    return { x, y, width, height, unit };
  }

  return null;
}

function imageSize(magickPath: string, imagePath: string): { width: number; height: number } {
  const dims = execFileSync(magickPath, ['identify', '-format', '%w %h', imagePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const [width, height] = dims.split(' ').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Could not read image dimensions for ${imagePath}`);
  }
  return { width, height };
}

function pixelCrop(box: CropBox, size: { width: number; height: number }): CropBox {
  if (box.unit === 'pixel') {
    return {
      ...box,
      x: Math.max(0, Math.round(box.x)),
      y: Math.max(0, Math.round(box.y)),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    };
  }

  return {
    unit: 'pixel',
    x: Math.max(0, Math.round(box.x * size.width)),
    y: Math.max(0, Math.round(box.y * size.height)),
    width: Math.max(1, Math.round(box.width * size.width)),
    height: Math.max(1, Math.round(box.height * size.height)),
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'evidence';
}

async function unpackPagesArchive(projectId: string, tmpDir: string): Promise<string | null> {
  const files = await getProjectFiles(projectId);
  const archive = files.find((file: { filename: string }) => file.filename === 'pages-png.tar.gz');
  if (!archive?.storage_path) return null;

  const { bucket, path: archivePath } = storageParts(archive.storage_path);
  const { data, error } = await supabase.storage.from(bucket).download(archivePath);
  if (error || !data) {
    throw new Error(`Failed to download pages archive: ${error?.message || 'no data'}`);
  }

  const localArchive = path.join(tmpDir, 'pages-png.tar.gz');
  fs.writeFileSync(localArchive, Buffer.from(await data.arrayBuffer()));
  execFileSync('tar', ['xzf', localArchive, '-C', tmpDir], { stdio: 'pipe', timeout: 60_000 });
  return path.join(tmpDir, 'pages-png');
}

export async function attachEvidenceCropsForProject(
  projectId: string,
  userId: string,
  rawArtifacts: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const projectUnderstanding = asRecord(rawArtifacts['project_understanding.json']);
  const evidenceIndex = Array.isArray(projectUnderstanding?.evidence_index)
    ? projectUnderstanding.evidence_index as Array<Record<string, unknown>>
    : [];
  if (evidenceIndex.length === 0) return rawArtifacts;

  const entriesNeedingCrops = evidenceIndex.filter((entry) => parseCropBox(entry));
  if (entriesNeedingCrops.length === 0) return rawArtifacts;

  const magickPath = resolveCommand('magick', WINDOWS_MAGICK_CANDIDATES);
  if (!magickPath) {
    console.warn('ImageMagick not found; skipping evidence crop generation');
    return rawArtifacts;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-evidence-crops-'));
  try {
    const pagesDir = await unpackPagesArchive(projectId, tmpDir);
    if (!pagesDir || !fs.existsSync(pagesDir)) return rawArtifacts;

    const updatedArtifacts = cloneValue(rawArtifacts);
    const updatedUnderstanding = asRecord(updatedArtifacts['project_understanding.json']);
    const updatedEvidenceIndex = Array.isArray(updatedUnderstanding?.evidence_index)
      ? updatedUnderstanding.evidence_index as Array<Record<string, unknown>>
      : [];

    for (const entry of updatedEvidenceIndex) {
      const cropBox = parseCropBox(entry);
      const id = asString(entry.id);
      const page = asNumber(entry.page);
      if (!cropBox || !id || page == null) continue;

      const pagePath = path.join(pagesDir, `page-${String(page).padStart(2, '0')}.png`);
      if (!fs.existsSync(pagePath)) continue;

      const crop = pixelCrop(cropBox, imageSize(magickPath, pagePath));
      const cropFileName = `${safeId(id)}.png`;
      const cropLocalPath = path.join(tmpDir, cropFileName);
      execFileSync(
        magickPath,
        [pagePath, '-crop', `${crop.width}x${crop.height}+${crop.x}+${crop.y}`, '+repage', cropLocalPath],
        { stdio: 'pipe', timeout: 30_000 },
      );

      const storagePath = await uploadOutputArtifact(
        userId,
        projectId,
        `evidence-crops/${cropFileName}`,
        fs.readFileSync(cropLocalPath),
        'image/png',
      );

      entry.crop_path = `evidence-crops/${cropFileName}`;
      entry.crop_storage_bucket = 'crossbeam-outputs';
      entry.crop_storage_path = storagePath;
    }

    return updatedArtifacts;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
