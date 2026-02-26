import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { OCRQualityMetrics } from './ocr-quality';

export interface OCRQualityComparisonRow {
  engine: string;
  extractedText: string;
  metrics: OCRQualityMetrics;
}

export interface OCRRealWorldItem {
  item: string;
  sampleFields: string;
  challenge: string;
}

export interface OCRQualityReportData {
  title?: string;
  subtitle?: string;
  groundTruth: string;
  comparisons: OCRQualityComparisonRow[];
  generatedAt?: string;
  overviewParagraphs?: string[];
  realWorldItems?: OCRRealWorldItem[];
}

type FontKey = 'body' | 'bold' | 'italic' | 'mono';

interface RichSegment {
  text: string;
  font?: FontKey;
}

const PAGE_SIZE: readonly [number, number] = [612, 792];
const PAGE_MARGIN = 42;
const BODY_FONT_SIZE = 10.5;
const BODY_LINE_HEIGHT = 14;
const SECTION_GAP = 12;
const CELL_PADDING = 5;

const COLORS = {
  heading: rgb(0.04, 0.18, 0.35),
  text: rgb(0.13, 0.13, 0.13),
  muted: rgb(0.4, 0.4, 0.4),
  tableBorder: rgb(0.7, 0.75, 0.82),
  tableHeaderFill: rgb(0.9, 0.94, 0.99),
  calloutFill: rgb(0.96, 0.97, 0.99),
  monoFill: rgb(0.95, 0.95, 0.95),
  barTrack: rgb(0.9, 0.9, 0.92),
  charBar: rgb(0.15, 0.42, 0.75),
  wordBar: rgb(0.11, 0.6, 0.44),
};

const DEFAULT_ITEMS: OCRRealWorldItem[] = [
  {
    item: 'Invoice',
    sampleFields: 'Vendor, invoice number, line items, total, due date',
    challenge: 'Currency symbols, decimal punctuation, mixed casing',
  },
  {
    item: 'Shipping label',
    sampleFields: 'Name, address, postal code, tracking ID',
    challenge: 'Dense uppercase text and narrow spacing',
  },
  {
    item: 'Purchase order',
    sampleFields: 'SKU, quantity, unit price, subtotal, notes',
    challenge: 'Grid-like text that resembles table cells',
  },
  {
    item: 'Medical intake form',
    sampleFields: 'Patient details, policy number, checkboxes, signatures',
    challenge: 'Handwritten noise and mixed printed text',
  },
];

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function wrapText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const paragraphs = text.split('\n');
  const wrapped: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      wrapped.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let line = words[0] ?? '';

    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        wrapped.push(line);
        line = words[i];
      }
    }
    wrapped.push(line);
  }

  return wrapped;
}

export async function generateOCRQualityReportPdf(
  report: OCRQualityReportData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const fonts: Record<FontKey, PDFFont> = {
    body: bodyFont,
    bold: boldFont,
    italic: italicFont,
    mono: monoFont,
  };

  const contentWidth = PAGE_SIZE[0] - PAGE_MARGIN * 2;
  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - PAGE_MARGIN;

  function addPage() {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = PAGE_SIZE[1] - PAGE_MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < PAGE_MARGIN) {
      addPage();
    }
  }

  function drawRichLine(
    segments: RichSegment[],
    size = BODY_FONT_SIZE,
    lineHeight = BODY_LINE_HEIGHT,
    color = COLORS.text,
  ) {
    ensureSpace(lineHeight);
    let x = PAGE_MARGIN;
    for (const segment of segments) {
      const font = fonts[segment.font ?? 'body'];
      page.drawText(segment.text, {
        x,
        y,
        size,
        font,
        color,
      });
      x += font.widthOfTextAtSize(segment.text, size);
    }
    y -= lineHeight;
  }

  function drawHeading(text: string, level: 1 | 2 | 3) {
    const size = level === 1 ? 22 : level === 2 ? 15 : 12;
    const lineHeight = level === 1 ? 28 : level === 2 ? 21 : 16;
    ensureSpace(lineHeight);
    page.drawText(text, {
      x: PAGE_MARGIN,
      y,
      size,
      font: boldFont,
      color: COLORS.heading,
    });
    y -= lineHeight;
  }

  function drawParagraph(
    text: string,
    options: { font?: FontKey; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) {
    const font = fonts[options.font ?? 'body'];
    const size = options.size ?? BODY_FONT_SIZE;
    const lineHeight = Math.max(BODY_LINE_HEIGHT, size + 3);
    const lines = wrapText(
      text,
      contentWidth,
      (value) => font.widthOfTextAtSize(value, size),
    );
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line || ' ', {
        x: PAGE_MARGIN,
        y,
        size,
        font,
        color: options.color ?? COLORS.text,
      });
      y -= lineHeight;
    }
    y -= 3;
  }

  function drawCodeBlock(title: string, text: string) {
    const lines = wrapText(
      text,
      contentWidth - 2 * CELL_PADDING - 4,
      (value) => monoFont.widthOfTextAtSize(value, BODY_FONT_SIZE),
    );
    const blockHeight = 22 + lines.length * BODY_LINE_HEIGHT + 8;
    ensureSpace(blockHeight);

    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - blockHeight + 8,
      width: contentWidth,
      height: blockHeight,
      color: COLORS.monoFill,
      borderColor: COLORS.tableBorder,
      borderWidth: 1,
    });

    page.drawText(title, {
      x: PAGE_MARGIN + CELL_PADDING,
      y: y - 14,
      size: 10,
      font: boldFont,
      color: COLORS.heading,
    });

    let localY = y - 30;
    for (const line of lines) {
      page.drawText(line || ' ', {
        x: PAGE_MARGIN + CELL_PADDING,
        y: localY,
        size: BODY_FONT_SIZE,
        font: monoFont,
        color: COLORS.text,
      });
      localY -= BODY_LINE_HEIGHT;
    }

    y -= blockHeight + 4;
  }

  function drawTable(
    title: string,
    columns: { header: string; width: number }[],
    rows: string[][],
  ) {
    drawHeading(title, 3);

    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const scaledColumns = columns.map((col) => ({
      ...col,
      width: (col.width / totalWidth) * contentWidth,
    }));

    const drawHeader = () => {
      ensureSpace(24);
      let x = PAGE_MARGIN;
      for (const column of scaledColumns) {
        page.drawRectangle({
          x,
          y: y - 18,
          width: column.width,
          height: 20,
          color: COLORS.tableHeaderFill,
          borderColor: COLORS.tableBorder,
          borderWidth: 1,
        });
        page.drawText(column.header, {
          x: x + CELL_PADDING,
          y: y - 12,
          size: 9.5,
          font: boldFont,
          color: COLORS.heading,
        });
        x += column.width;
      }
      y -= 20;
    };

    drawHeader();

    for (const row of rows) {
      const wrappedCells = row.map((cell, index) =>
        wrapText(
          cell,
          scaledColumns[index].width - CELL_PADDING * 2,
          (value) => bodyFont.widthOfTextAtSize(value, 9.5),
        ),
      );

      const rowLineCount = Math.max(...wrappedCells.map((cell) => cell.length), 1);
      const rowHeight = rowLineCount * 12 + 8;
      ensureSpace(rowHeight + 1);

      if (y - rowHeight < PAGE_MARGIN) {
        addPage();
        drawHeader();
      }

      let x = PAGE_MARGIN;
      for (let colIndex = 0; colIndex < scaledColumns.length; colIndex++) {
        const column = scaledColumns[colIndex];
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: column.width,
          height: rowHeight,
          borderColor: COLORS.tableBorder,
          borderWidth: 1,
        });
        const lines = wrappedCells[colIndex];
        let cellY = y - 11;
        for (const line of lines) {
          page.drawText(line, {
            x: x + CELL_PADDING,
            y: cellY,
            size: 9.5,
            font: bodyFont,
            color: COLORS.text,
          });
          cellY -= 12;
        }
        x += column.width;
      }

      y -= rowHeight;
    }

    y -= 8;
  }

  function drawAccuracyGraph() {
    drawHeading('Metric Graphs', 3);
    const chartHeight = report.comparisons.length * 34 + 36;
    ensureSpace(chartHeight);

    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y - chartHeight + 8,
      width: contentWidth,
      height: chartHeight,
      color: COLORS.calloutFill,
      borderColor: COLORS.tableBorder,
      borderWidth: 1,
    });

    page.drawText('Character Accuracy vs Word Accuracy (higher is better)', {
      x: PAGE_MARGIN + 8,
      y: y - 14,
      size: 9.5,
      font: boldFont,
      color: COLORS.heading,
    });

    const labelWidth = 80;
    const barTrackWidth = contentWidth - labelWidth - 110;
    let rowY = y - 34;

    for (const comparison of report.comparisons) {
      const charWidth = barTrackWidth * comparison.metrics.charAccuracy;
      const wordWidth = barTrackWidth * comparison.metrics.wordAccuracy;

      page.drawText(comparison.engine, {
        x: PAGE_MARGIN + 8,
        y: rowY + 6,
        size: 9.5,
        font: boldFont,
        color: COLORS.text,
      });

      const barX = PAGE_MARGIN + labelWidth;

      page.drawRectangle({
        x: barX,
        y: rowY + 8,
        width: barTrackWidth,
        height: 8,
        color: COLORS.barTrack,
      });
      page.drawRectangle({
        x: barX,
        y: rowY + 8,
        width: charWidth,
        height: 8,
        color: COLORS.charBar,
      });
      page.drawText(`C ${formatRate(comparison.metrics.charAccuracy)}`, {
        x: barX + barTrackWidth + 8,
        y: rowY + 8,
        size: 8.5,
        font: bodyFont,
        color: COLORS.text,
      });

      page.drawRectangle({
        x: barX,
        y: rowY - 4,
        width: barTrackWidth,
        height: 8,
        color: COLORS.barTrack,
      });
      page.drawRectangle({
        x: barX,
        y: rowY - 4,
        width: wordWidth,
        height: 8,
        color: COLORS.wordBar,
      });
      page.drawText(`W ${formatRate(comparison.metrics.wordAccuracy)}`, {
        x: barX + barTrackWidth + 8,
        y: rowY - 4,
        size: 8.5,
        font: bodyFont,
        color: COLORS.text,
      });

      rowY -= 34;
    }

    y -= chartHeight + 4;
  }

  const title = report.title ?? 'CopyCat OCR Comparative Quality Demo';
  const subtitle =
    report.subtitle
    ?? 'Comparative benchmark report with realistic document content';

  drawHeading(title, 1);
  drawParagraph(subtitle, { font: 'italic', color: COLORS.muted });

  drawRichLine([
    { text: 'Generated at: ', font: 'bold' },
    { text: report.generatedAt ?? new Date().toISOString() },
  ]);
  drawRichLine([
    { text: 'Compared engines: ', font: 'bold' },
    { text: report.comparisons.map((item) => item.engine).join(', ') },
  ]);
  y -= SECTION_GAP;

  drawHeading('Overview', 2);
  const overview = report.overviewParagraphs ?? [
    'This report compares OCR output quality using two formal metrics: CER (Character Error Rate) and WER (Word Error Rate).',
    'The sample includes real-world text patterns such as invoice numbers, currency values, dates, and notes. Lower CER/WER values indicate better recognition quality.',
  ];
  for (const paragraph of overview) {
    drawParagraph(paragraph);
  }

  drawRichLine([
    { text: 'Key terms: ', font: 'bold' },
    { text: 'CER and WER are ', font: 'body' },
    { text: 'error metrics', font: 'italic' },
    { text: ' where lower is better.', font: 'body' },
  ]);
  y -= SECTION_GAP;

  const realWorldItems = report.realWorldItems ?? DEFAULT_ITEMS;
  drawTable(
    'Real-world Document Items',
    [
      { header: 'Document Type', width: 110 },
      { header: 'Sample Fields', width: 210 },
      { header: 'OCR Challenge', width: 170 },
    ],
    realWorldItems.map((item) => [item.item, item.sampleFields, item.challenge]),
  );

  drawCodeBlock('Ground Truth Excerpt', report.groundTruth);

  drawAccuracyGraph();

  drawTable(
    'Engine Metrics Table',
    [
      { header: 'Engine', width: 85 },
      { header: 'CER', width: 70 },
      { header: 'WER', width: 70 },
      { header: 'Char Accuracy', width: 100 },
      { header: 'Word Accuracy', width: 100 },
      { header: 'Output Notes', width: 135 },
    ],
    report.comparisons.map((comparison) => [
      comparison.engine,
      formatRate(comparison.metrics.charErrorRate),
      formatRate(comparison.metrics.wordErrorRate),
      formatRate(comparison.metrics.charAccuracy),
      formatRate(comparison.metrics.wordAccuracy),
      comparison.extractedText.slice(0, 70).replace(/\n/g, ' ') + (comparison.extractedText.length > 70 ? '...' : ''),
    ]),
  );

  drawHeading('Extracted Text Samples', 2);
  for (const comparison of report.comparisons) {
    drawCodeBlock(`${comparison.engine} output`, comparison.extractedText);
  }

  return pdfDoc.save();
}
