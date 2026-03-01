import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { OCRResult, OCRRegion, PageImage } from '../types';

const FONT = 'Noto Sans';
const POINTS_PER_PIXEL = 0.75;

// ── Bullet / list prefix patterns ─────────────────────────────────────────────
const BULLET_PREFIX = /^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF\u25CB•◦‣⁃∙▪▫●○\-–—]\s*/;
const NUMBERED_PREFIX = /^(\d{1,3})[.)]\s+/;

// ── Layout classification types ───────────────────────────────────────────────

type LineKind = 'heading' | 'bullet' | 'numbered' | 'table-row' | 'body';

interface ClassifiedLine {
  kind: LineKind;
  regions: OCRRegion[];
  /** Median bbox height of regions on this line (pixels). */
  medianHeight: number;
  /** Left edge of the first region (pixels). */
  leftEdge: number;
  /** Combined text of the line. */
  text: string;
  /** For numbered items, the parsed number. */
  listNumber?: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateDocx(
  results: OCRResult[],
  pages: PageImage[],
): Promise<Blob> {
  const sections = results.map((result, index) =>
    buildSection(result, pages[index]),
  );

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'ocr-numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: sections.length > 0 ? sections : [{ children: [] }],
  });

  const buffer = await Packer.toBlob(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

// ── Section builder ───────────────────────────────────────────────────────────

function buildSection(
  result: OCRResult,
  page: PageImage | undefined,
): { properties: any; children: any[] } {
  const lines = groupIntoLines(result.regions);
  const globalMedianHeight = computeGlobalMedianHeight(lines);
  const classified = classifyLines(lines, page, globalMedianHeight);
  const validated = validateTableAlignment(classified);
  const merged = mergeConsecutiveBody(validated);
  const children = renderBlocks(merged, page, globalMedianHeight);

  return {
    properties: { type: SectionType.NEXT_PAGE },
    children: children.length > 0 ? children : [new Paragraph({ children: [] })],
  };
}

// ── Line grouping (spatial) ───────────────────────────────────────────────────

function groupIntoLines(regions: OCRRegion[]): OCRRegion[][] {
  const valid = regions.filter((r) => r.text.trim().length > 0);
  if (valid.length === 0) return [];

  // Compute median height for adaptive grouping threshold
  const heights = valid.map((r) => r.bbox[3]).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 20;
  const groupingThreshold = medianHeight * 0.4;

  const sorted = [...valid].sort((a, b) => {
    const yDiff = a.bbox[1] - b.bbox[1];
    if (Math.abs(yDiff) > groupingThreshold) return yDiff;
    return a.bbox[0] - b.bbox[0];
  });

  const lines: OCRRegion[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = lines[lines.length - 1];
    // Use running median y of the current line to avoid baseline drift
    const currentYValues = current.map((r) => r.bbox[1]).sort((a, b) => a - b);
    const medianY = currentYValues[Math.floor(currentYValues.length / 2)];
    const region = sorted[i];

    if (Math.abs(region.bbox[1] - medianY) <= groupingThreshold) {
      current.push(region);
      current.sort((a, b) => a.bbox[0] - b.bbox[0]);
    } else {
      lines.push([region]);
    }
  }

  return lines;
}

// ── Median height ─────────────────────────────────────────────────────────────

function computeGlobalMedianHeight(lines: OCRRegion[][]): number {
  const allHeights = lines.flatMap((l) => l.map((r) => r.bbox[3])).sort((a, b) => a - b);
  return allHeights.length > 0 ? allHeights[Math.floor(allHeights.length / 2)] : 20;
}

// ── Line classification ───────────────────────────────────────────────────────

function classifyLines(
  lines: OCRRegion[][],
  page: PageImage | undefined,
  globalMedianHeight: number,
): ClassifiedLine[] {
  const pageWidth = page?.width ?? 1000;

  return lines.map((regions) => {
    const heights = regions.map((r) => r.bbox[3]).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] ?? 0;
    const leftEdge = Math.min(...regions.map((r) => r.bbox[0]));
    const text = regions.map((r) => r.text).join(' ').trim();

    // Detect table rows: 3+ regions with significant horizontal gaps between them,
    // spread across at least 60% of the page width
    const lineWidth = Math.max(...regions.map((r) => r.bbox[0] + r.bbox[2])) - leftEdge;
    if (regions.length >= 3 && lineWidth > pageWidth * 0.6) {
      const gaps = [];
      for (let i = 1; i < regions.length; i++) {
        gaps.push(regions[i].bbox[0] - (regions[i - 1].bbox[0] + regions[i - 1].bbox[2]));
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      if (avgGap > globalMedianHeight * 0.8) {
        return { kind: 'table-row' as const, regions, medianHeight, leftEdge, text };
      }
    }

    // Detect headings: significantly taller than the median body text
    if (medianHeight > globalMedianHeight * 1.35 && text.length < 120) {
      return { kind: 'heading' as const, regions, medianHeight, leftEdge, text };
    }

    // Detect bullet items
    if (BULLET_PREFIX.test(text)) {
      return { kind: 'bullet' as const, regions, medianHeight, leftEdge, text };
    }

    // Detect numbered items
    const numMatch = NUMBERED_PREFIX.exec(text);
    if (numMatch) {
      return {
        kind: 'numbered' as const,
        regions,
        medianHeight,
        leftEdge,
        text,
        listNumber: parseInt(numMatch[1], 10),
      };
    }

    return { kind: 'body' as const, regions, medianHeight, leftEdge, text };
  });
}

// ── Table alignment validation ────────────────────────────────────────────────

/**
 * Verify that consecutive table rows have aligned columns.
 * If region X-positions don't align across rows (within 15px tolerance),
 * reclassify as body text.
 */
function validateTableAlignment(classified: ClassifiedLine[]): ClassifiedLine[] {
  const result: ClassifiedLine[] = [];
  let i = 0;

  while (i < classified.length) {
    if (classified[i].kind !== 'table-row') {
      result.push(classified[i]);
      i++;
      continue;
    }

    // Collect consecutive table rows
    const tableGroup: ClassifiedLine[] = [];
    while (i < classified.length && classified[i].kind === 'table-row') {
      tableGroup.push(classified[i]);
      i++;
    }

    if (tableGroup.length < 2) {
      // Single table row — reclassify as body
      for (const row of tableGroup) {
        result.push({ ...row, kind: 'body' });
      }
      continue;
    }

    // Check column alignment across rows
    const alignmentTolerance = 15;
    let alignedCount = 0;
    let totalChecks = 0;

    for (let r = 1; r < tableGroup.length; r++) {
      const prevRow = tableGroup[r - 1];
      const currRow = tableGroup[r];
      const checkCount = Math.min(prevRow.regions.length, currRow.regions.length);

      for (let c = 0; c < checkCount; c++) {
        totalChecks++;
        if (Math.abs(prevRow.regions[c].bbox[0] - currRow.regions[c].bbox[0]) <= alignmentTolerance) {
          alignedCount++;
        }
      }
    }

    const alignmentScore = totalChecks > 0 ? alignedCount / totalChecks : 0;

    if (alignmentScore >= 0.5) {
      // Good alignment — keep as table
      result.push(...tableGroup);
    } else {
      // Poor alignment — reclassify as body
      for (const row of tableGroup) {
        result.push({ ...row, kind: 'body' });
      }
    }
  }

  return result;
}

// ── Paragraph merging ─────────────────────────────────────────────────────────

/**
 * Merge consecutive body lines with similar left-edge indentation and font size
 * into single paragraph blocks for more natural document flow.
 */
function mergeConsecutiveBody(classified: ClassifiedLine[]): ClassifiedLine[] {
  const merged: ClassifiedLine[] = [];
  let i = 0;

  while (i < classified.length) {
    if (classified[i].kind !== 'body') {
      merged.push(classified[i]);
      i++;
      continue;
    }

    // Start a paragraph group
    const group: ClassifiedLine[] = [classified[i]];
    i++;

    while (i < classified.length && classified[i].kind === 'body') {
      const prev = group[group.length - 1];
      const curr = classified[i];

      // Check if this line should merge into the current paragraph:
      // 1. Similar left-edge indentation (within 10px)
      // 2. Similar median height (within 20%)
      const leftDiff = Math.abs(curr.leftEdge - prev.leftEdge);
      const heightRatio = prev.medianHeight > 0
        ? curr.medianHeight / prev.medianHeight
        : 1;

      // 3. Vertical gap not too large (visually separate paragraphs shouldn't merge)
      const prevBottom = Math.max(...prev.regions.map(r => r.bbox[1] + r.bbox[3]));
      const currTop = Math.min(...curr.regions.map(r => r.bbox[1]));
      const verticalGap = currTop - prevBottom;
      const maxGap = Math.max(20, 1.5 * prev.medianHeight);

      if (leftDiff <= 10 && heightRatio >= 0.8 && heightRatio <= 1.2 && verticalGap <= maxGap) {
        group.push(curr);
        i++;
      } else {
        break;
      }
    }

    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      // Merge the group into a single classified line
      const allRegions = group.flatMap((g) => g.regions);
      const allText = group.map((g) => g.text).join(' ');
      const heights = group.map((g) => g.medianHeight).sort((a, b) => a - b);
      merged.push({
        kind: 'body',
        regions: allRegions,
        medianHeight: heights[Math.floor(heights.length / 2)],
        leftEdge: group[0].leftEdge,
        text: allText,
      });
    }
  }

  return merged;
}

// ── Rendering classified lines to docx elements ──────────────────────────────

function renderBlocks(
  classified: ClassifiedLine[],
  page: PageImage | undefined,
  globalMedianHeight: number,
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < classified.length) {
    const line = classified[i];

    switch (line.kind) {
      case 'heading':
        elements.push(renderHeading(line, globalMedianHeight));
        i++;
        break;

      case 'bullet': {
        // Collect consecutive bullet lines
        const bulletGroup: ClassifiedLine[] = [];
        while (i < classified.length && classified[i].kind === 'bullet') {
          bulletGroup.push(classified[i]);
          i++;
        }
        elements.push(...bulletGroup.map(renderBullet));
        break;
      }

      case 'numbered': {
        // Collect consecutive numbered lines
        const numGroup: ClassifiedLine[] = [];
        while (i < classified.length && classified[i].kind === 'numbered') {
          numGroup.push(classified[i]);
          i++;
        }
        elements.push(...numGroup.map(renderNumberedItem));
        break;
      }

      case 'table-row': {
        // Collect consecutive table rows
        const tableRows: ClassifiedLine[] = [];
        while (i < classified.length && classified[i].kind === 'table-row') {
          tableRows.push(classified[i]);
          i++;
        }
        elements.push(renderTable(tableRows, page));
        break;
      }

      default:
        elements.push(renderBodyParagraph(line));
        i++;
        break;
    }
  }

  return elements;
}

function renderHeading(line: ClassifiedLine, globalMedianHeight: number): Paragraph {
  // Map relative size to heading level: > 2x body → H1, otherwise → H2
  const level = line.medianHeight > globalMedianHeight * 2
    ? HeadingLevel.HEADING_1
    : HeadingLevel.HEADING_2;

  return new Paragraph({
    heading: level,
    children: line.regions.map(
      (r) => new TextRun({
        text: r.text + ' ',
        font: FONT,
        bold: true,
        size: estimateFontSize(r),
      }),
    ),
    spacing: { after: 160 },
  });
}

function renderBullet(line: ClassifiedLine): Paragraph {
  const cleanText = line.text.replace(BULLET_PREFIX, '');
  return new Paragraph({
    bullet: { level: 0 },
    children: [
      new TextRun({
        text: cleanText,
        font: FONT,
        size: estimateFontSizeFromHeight(line.medianHeight),
      }),
    ],
    spacing: { after: 80 },
  });
}

function renderNumberedItem(line: ClassifiedLine): Paragraph {
  const cleanText = line.text.replace(NUMBERED_PREFIX, '');
  return new Paragraph({
    numbering: { reference: 'ocr-numbered-list', level: 0 },
    children: [
      new TextRun({
        text: cleanText,
        font: FONT,
        size: estimateFontSizeFromHeight(line.medianHeight),
      }),
    ],
    spacing: { after: 80 },
  });
}

function renderTable(rows: ClassifiedLine[], page: PageImage | undefined): Table {
  const pageWidth = page?.width ?? 1000;
  // Determine column count from the row with the most regions
  const maxCols = Math.max(...rows.map((r) => r.regions.length));

  const tableRows = rows.map((row) => {
    const cells: TableCell[] = [];
    for (let c = 0; c < maxCols; c++) {
      const region = row.regions[c];
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: region?.text ?? '',
                  font: FONT,
                  size: estimateFontSizeFromHeight(row.medianHeight),
                }),
              ],
            }),
          ],
          width: {
            size: Math.round((pageWidth / maxCols) * POINTS_PER_PIXEL * 20), // twips
            type: WidthType.DXA,
          },
        }),
      );
    }
    return new TableRow({ children: cells });
  });

  return new Table({
    rows: tableRows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
  });
}

function renderBodyParagraph(line: ClassifiedLine): Paragraph {
  return new Paragraph({
    children: line.regions.map(
      (r) => new TextRun({
        text: r.text + ' ',
        font: FONT,
        size: estimateFontSize(r),
      }),
    ),
    spacing: { after: 120 },
  });
}

// ── Font size helpers ─────────────────────────────────────────────────────────

function estimateFontSize(region: OCRRegion): number {
  return estimateFontSizeFromHeight(region.bbox[3]);
}

function estimateFontSizeFromHeight(heightPx: number): number {
  // bbox height in pixels → half-points (docx uses half-points)
  const heightPt = heightPx * POINTS_PER_PIXEL;
  return Math.max(16, Math.round(heightPt * 2));
}

// ── Exported for testing ──────────────────────────────────────────────────────

export const _testOnly = {
  groupIntoLines,
  classifyLines,
  computeGlobalMedianHeight,
  renderBlocks,
  validateTableAlignment,
  mergeConsecutiveBody,
};
