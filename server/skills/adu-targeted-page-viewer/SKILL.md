---
name: adu-targeted-page-viewer
description: Extracts construction plan PDFs into page PNGs, reads the sheet index to build a sheet-to-page manifest, and enables targeted viewing of specific sheets. This skill should be used when a corrections letter references specific plan sheets and those sheets need to be located and analyzed within the PDF binder.
---

# ADU Targeted Page Viewer

## Overview

Extract a construction plan PDF into page PNGs and build a JSON manifest mapping sheet IDs to page numbers. This enables fast, targeted viewing of specific sheets referenced in corrections letters without doing deep content extraction of every page.

**Speed**: Under 2 minutes for the manifest. Individual sheet lookups are instant after that.

**Key difference from full extraction**: This skill identifies which page is which sheet and prepares lightweight evidence artifacts. It does not do full code review or dimensional interpretation of every page.

## Prerequisites

- `pdftoppm` / `pdfinfo` (from poppler): `apt-get install poppler-utils` (Linux) or `brew install poppler` (macOS)
- `ImageMagick` for title block workflows when extraction is not precomputed
- `node` with `jimp` available for ad hoc evidence crops

## Workflow

### Step 1: Extract All Pages to PNG

**Check first:** PNGs may already be pre-extracted. Look for `pages-png/page-01.png` in the project files directory. If PNGs already exist, skip this step entirely and go straight to Step 2.

If PNGs do not exist, run `scripts/extract-pages.sh` to split the PDF into individual page PNGs:

```bash
scripts/extract-pages.sh <input.pdf> <output-dir>
```

This produces `output-dir/pages-png/page-01.png`, `page-02.png`, etc. at 300 DPI (full resolution, no resize). The script is idempotent and exits immediately when PNGs already exist.

### Step 2: Read the Cover Sheet and Find the Sheet Index

Read `pages-png/page-01.png` visually. The sheet index is typically in the top-right or right-side area of the cover sheet.

Extract the index as a list of entries:

```text
CS    -> Cover Sheet
A1    -> Site Plan
A2    -> Floor Plan
A3    -> Elevations and Roof Plan
S1.0  -> Structural Notes
S2.0  -> Foundation Plan
```

If the index is not on page 1, check page 2.

### Step 3: Match Sheet IDs to Page Numbers

The sheet index order generally matches the PDF page order, but there can be mismatches when the PDF includes extra forms or inserts.

To resolve a mismatch:

1. Check if title block crops already exist at `title-blocks/title-block-01.png`. If they do, skip the cropping step.
2. Otherwise run `scripts/crop-title-blocks.sh <output-dir>/pages-png <output-dir>/title-blocks`.
3. Read each title block image to extract the sheet ID. Title blocks should be prepared at higher resolution than the full pages (prefer 400 DPI from server-side extraction), so the sheet ID and revision metadata stay legible.
4. Match each page's sheet ID against the index entries.

If the page count matches the index count exactly, skip title block reading and assume the index order is the page order.

### Step 4: Build the Sheet Manifest

Write `output-dir/sheet-manifest.json` with the sheet/page mapping. The manifest is the source of truth for page, drawing number, title, and image paths.

### Step 4.5: Reuse Native Text and Create Evidence Crops

If `project-files/page-text.json` exists, treat it as a lightweight companion artifact:

- It contains per-page native PDF text when the source PDF exposes any.
- Use it to confirm titles, legends, or synoptic tables when visible text is ambiguous.
- Do not use it as the source of truth for page mapping.

After the manifest exists, create targeted crops only for pages that matter:

- title block
- legend
- synoptic table / area schedule
- dimension or notes region explicitly referenced by a correction item or a `project_understanding` claim

Use `scripts/crop-region.mjs` for ad hoc evidence crops:

```bash
node scripts/crop-region.mjs <input.png> <output.png> <x> <y> <width> <height>
```

Write crops under `output/page-crops/` and reference them downstream via `crop_path`.

### Step 5: Targeted Sheet Viewing

When a correction references a specific sheet:

1. Look up the sheet ID in the manifest to get the page number and PNG path.
2. Read that PNG visually.
3. Analyze the specific area referenced.
4. Report what is on the sheet and what needs to change.

See `references/plan-sheet-conventions.md` for title block locations, detail callouts, and sheet numbering.

## Important Notes

- Do not do deep content extraction in Phase 1. Build the sheet-to-page map first, then support downstream understanding with optional evidence crops.
- Title block is ground truth. The sheet index is only a guide.
- Contractors provide PDFs. The PNGs are intermediate artifacts for analysis.
- Cache the manifest. Once built, it is reusable for the entire process.
- Handle watermarks normally. They do not change sheet identification if the title block is readable.

## Scripts

| Script | Purpose | Runtime |
|--------|---------|---------|
| `scripts/extract-pages.sh` | PDF to page PNGs at 300 DPI. Idempotent. | ~5-10 sec for 20-30 pages |
| `scripts/crop-title-blocks.sh` | Crop bottom-right title block from each page. Idempotent. | ~2 sec for 20-30 pages |
| `scripts/crop-region.mjs` | Crop an arbitrary evidence region from an existing PNG. | on demand |

## References

| File | Contents |
|------|----------|
| `references/plan-sheet-conventions.md` | Sheet numbering system, title block locations, detail callout conventions, common ADU plan set sizes |
