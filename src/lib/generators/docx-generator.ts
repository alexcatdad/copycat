import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  SectionType,
} from 'docx';
import type { OCRResult, OCRRegion, PageImage } from '../types';

const FONT = 'Noto Sans';
const POINTS_PER_PIXEL = 0.75; // approximate conversion

export async function generateDocx(
  results: OCRResult[],
  pages: PageImage[],
): Promise<Blob> {
  const sections = results.map((result, index) =>
    buildSection(result, pages[index], index < results.length - 1),
  );

  const doc = new Document({
    sections: sections.length > 0 ? sections : [{ children: [] }],
  });

  const buffer = await Packer.toBlob(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildSection(
  result: OCRResult,
  page: PageImage | undefined,
  _hasNext: boolean,
): { properties: any; children: any[] } {
  const sortedRegions = sortRegionsByPosition(result.regions);
  const paragraphs = groupIntoParagraphs(sortedRegions);

  const children = paragraphs.map(
    (group) =>
      new Paragraph({
        children: group.map(
          (region) =>
            new TextRun({
              text: region.text + ' ',
              font: FONT,
              size: estimateFontSize(region),
            }),
        ),
        spacing: { after: 120 },
      }),
  );

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
    },
    children,
  };
}

function sortRegionsByPosition(regions: OCRRegion[]): OCRRegion[] {
  return [...regions].sort((a, b) => {
    const yDiff = a.bbox[1] - b.bbox[1];
    if (Math.abs(yDiff) > 10) return yDiff; // Different line
    return a.bbox[0] - b.bbox[0]; // Same line, sort left to right
  });
}

function groupIntoParagraphs(regions: OCRRegion[]): OCRRegion[][] {
  if (regions.length === 0) return [];

  const paragraphs: OCRRegion[][] = [[regions[0]]];

  for (let i = 1; i < regions.length; i++) {
    const prev = regions[i - 1];
    const curr = regions[i];
    const yGap = curr.bbox[1] - (prev.bbox[1] + prev.bbox[3]);

    // If vertical gap is larger than line height, start new paragraph
    if (yGap > prev.bbox[3] * 1.5) {
      paragraphs.push([curr]);
    } else {
      paragraphs[paragraphs.length - 1].push(curr);
    }
  }

  return paragraphs;
}

function estimateFontSize(region: OCRRegion): number {
  // bbox[3] is height in pixels, convert to half-points (docx uses half-points)
  const heightPt = region.bbox[3] * POINTS_PER_PIXEL;
  return Math.max(16, Math.round(heightPt * 2)); // *2 for half-points, min 8pt
}
