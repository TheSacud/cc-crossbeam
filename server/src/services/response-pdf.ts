import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RESPONSE_PDF_FILENAME = 'response_letter.pdf';

function runInlinePython(scriptPath: string, source: string, args: string[], timeout = 180_000): string {
  fs.writeFileSync(scriptPath, source, 'utf8');
  return execFileSync('python', [scriptPath, ...args], {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readResponseLetterMarkdown(output: Record<string, unknown>): string | null {
  if (typeof output.response_letter_md === 'string' && output.response_letter_md.trim()) {
    return output.response_letter_md;
  }

  const rawArtifacts = output.raw_artifacts;
  if (
    rawArtifacts &&
    typeof rawArtifacts === 'object' &&
    !Array.isArray(rawArtifacts) &&
    typeof (rawArtifacts as Record<string, unknown>)['response_letter.md'] === 'string'
  ) {
    const markdown = (rawArtifacts as Record<string, string>)['response_letter.md'];
    return markdown.trim() ? markdown : null;
  }

  return null;
}

export function renderResponseLetterPdfFromMarkdown(markdown: string, outputPdfPath: string): void {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalizedMarkdown) {
    throw new Error('response_letter.md is empty');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossbeam-response-pdf-'));
  const markdownPath = path.join(tmpDir, 'response_letter.md');
  const scriptPath = path.join(tmpDir, 'render-response-letter.py');

  const script = `
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
except Exception as exc:
    raise SystemExit(f"reportlab missing: {exc}")

markdown_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
text = markdown_path.read_text(encoding="utf-8").replace("\\r\\n", "\\n").strip()
if not text:
    raise SystemExit("response_letter.md is empty")

styles = getSampleStyleSheet()
body = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=14,
    alignment=TA_JUSTIFY,
    textColor=colors.HexColor("#1f2933"),
    spaceAfter=0,
)
h1 = ParagraphStyle(
    "H1",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=15,
    leading=19,
    textColor=colors.HexColor("#102a43"),
    spaceAfter=0,
)
h2 = ParagraphStyle(
    "H2",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12.5,
    leading=16,
    textColor=colors.HexColor("#102a43"),
    spaceAfter=0,
)
bullet = ParagraphStyle(
    "Bullet",
    parent=body,
    leftIndent=10 * mm,
    firstLineIndent=-4 * mm,
    alignment=TA_LEFT,
)

story = []
paragraph_lines = []
list_items = []

def flush_paragraph():
    global paragraph_lines
    if not paragraph_lines:
        return
    content = " ".join(line.strip() for line in paragraph_lines if line.strip())
    if content:
        story.append(Paragraph(escape(content), body))
        story.append(Spacer(1, 3.5 * mm))
    paragraph_lines = []

def flush_list():
    global list_items
    if not list_items:
        return
    for item in list_items:
        story.append(Paragraph("• " + escape(item), bullet))
        story.append(Spacer(1, 1.4 * mm))
    story.append(Spacer(1, 2.2 * mm))
    list_items = []

for raw_line in text.split("\\n"):
    stripped = raw_line.strip()

    if not stripped:
        flush_paragraph()
        flush_list()
        continue

    heading_match = re.match(r"^(#{1,3})\\s+(.*)$", stripped)
    if heading_match:
        flush_paragraph()
        flush_list()
        level = len(heading_match.group(1))
        content = escape(heading_match.group(2).strip())
        style = h1 if level == 1 else h2
        story.append(Paragraph(content, style))
        story.append(Spacer(1, 4 * mm if level == 1 else 3 * mm))
        continue

    bullet_match = re.match(r"^(?:[-*]|\\d+\\.)\\s+(.*)$", stripped)
    if bullet_match:
        flush_paragraph()
        list_items.append(bullet_match.group(1).strip())
        continue

    flush_list()
    paragraph_lines.append(stripped)

flush_paragraph()
flush_list()

if not story:
    raise SystemExit("No printable content found in response_letter.md")

def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(colors.HexColor("#486581"))
    canvas.drawRightString(A4[0] - doc.rightMargin, 10 * mm, f"Pagina {canvas.getPageNumber()}")
    canvas.restoreState()

doc = SimpleDocTemplate(
    str(output_path),
    pagesize=A4,
    leftMargin=22 * mm,
    rightMargin=22 * mm,
    topMargin=24 * mm,
    bottomMargin=18 * mm,
    title="CrossBeam Response Letter",
    author="CrossBeam",
)
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
`;

  try {
    fs.writeFileSync(markdownPath, normalizedMarkdown, 'utf8');
    runInlinePython(scriptPath, script, [markdownPath, outputPdfPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const stats = fs.statSync(outputPdfPath);
  if (stats.size === 0) {
    throw new Error('Rendered response_letter.pdf is empty');
  }
}

export async function generateResponseLetterPdfForProject(
  projectId: string,
  userId: string,
): Promise<{ generated: boolean; storagePath?: string; reason?: string }> {
  const {
    getLatestOutputForPhase,
    insertMessage,
    updateOutputRecord,
    uploadOutputArtifact,
  } = await import('./supabase.js');
  const latestOutput = await getLatestOutputForPhase(projectId, 'response');
  if (!latestOutput) {
    return { generated: false, reason: 'No response output record found' };
  }

  if (typeof latestOutput.response_letter_pdf_path === 'string' && latestOutput.response_letter_pdf_path.trim()) {
    return { generated: false, reason: 'response_letter.pdf already exists for the latest response output' };
  }

  const markdown = readResponseLetterMarkdown(latestOutput as Record<string, unknown>);
  if (!markdown) {
    return { generated: false, reason: 'response_letter.md is missing from the latest response output' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossbeam-response-pdf-output-'));
  const outputPdfPath = path.join(tmpDir, RESPONSE_PDF_FILENAME);

  try {
    renderResponseLetterPdfFromMarkdown(markdown, outputPdfPath);
    const pdfBuffer = fs.readFileSync(outputPdfPath);
    const storagePath = await uploadOutputArtifact(
      userId,
      projectId,
      RESPONSE_PDF_FILENAME,
      pdfBuffer,
      'application/pdf',
    );

    await updateOutputRecord(latestOutput.id as string, {
      response_letter_pdf_path: storagePath,
    });

    await insertMessage(projectId, 'system', 'Rendered and uploaded response_letter.pdf for the latest Viseu response output.');
    return { generated: true, storagePath };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
