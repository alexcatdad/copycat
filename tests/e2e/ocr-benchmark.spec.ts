import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  evaluateOCRQuality,
  type OCRQualityMetrics,
} from '../../src/lib/ocr-quality';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const LIVE_OCR_ENABLED = process.env.LIVE_OCR === '1';
const HF_TOKEN = process.env.HF_TOKEN;

interface BenchmarkEngine {
  label: string;
  tier: string;
  model?: string;
}

const ENGINES: BenchmarkEngine[] = [
  { label: 'tesseract (basic)', tier: 'basic' },
  { label: 'tesseract-combined', tier: 'basic', model: 'tesseract-combined' },
  { label: 'trocr-hybrid (standard)', tier: 'standard', model: 'trocr-hybrid' },
  { label: 'trocr-base (standard)', tier: 'standard', model: 'trocr-base' },
  { label: 'florence2 (standard)', tier: 'standard', model: 'florence2' },
  { label: 'florence2-large (standard)', tier: 'standard', model: 'florence2-large' },
  { label: 'janus-pro-1b (standard)', tier: 'standard', model: 'janus-pro-1b' },
  { label: 'got-ocr2 (standard)', tier: 'standard', model: 'got-ocr2' },
  { label: 'donut (standard)', tier: 'standard', model: 'donut' },
  { label: 'paddleocr (standard)', tier: 'standard', model: 'paddleocr' },
];

interface NamedPreprocessConfig {
  name: string;
  /** false = no preprocessing, true = default, object = custom */
  config: boolean | Record<string, unknown>;
}

const PREPROCESS_CONFIGS: NamedPreprocessConfig[] = [
  { name: 'none', config: false },
  { name: 'default', config: true },
  { name: 'sauvola', config: { sauvola: true, sauvolaK: 0.3 } },
  { name: 'sharpen+default', config: { sharpen: true } },
  { name: 'otsu', config: { otsu: true } },
  {
    name: 'aggressive',
    config: {
      minWidth: 1400,
      minHeight: 1000,
      sauvola: true,
      sharpen: true,
      morphOpen: true,
      deskew: true,
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Test fixture definitions                                           */
/* ------------------------------------------------------------------ */

interface TestFixture {
  name: string;
  description: string;
  groundTruth: string;
  generatePdf: () => Promise<Buffer>;
}

const CLEAN_TEXT_GROUND_TRUTH =
  'The quick brown fox jumped over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.';

const INVOICE_GROUND_TRUTH =
  'Invoice #12345\n' +
  'Date: 2026-01-15\n' +
  'Item: Widget A  Qty: 10  Price: $25.00  Total: $250.00\n' +
  'Item: Widget B  Qty: 5  Price: $42.50  Total: $212.50\n' +
  'Subtotal: $462.50\n' +
  'Tax (8%): $37.00\n' +
  'Total Due: $499.50';

const SMALL_FONT_GROUND_TRUTH =
  'This text is rendered at 8 point size to test OCR accuracy on small fonts. ' +
  'Numbers and symbols: 0123456789 @#$%&*() are included for completeness.';

const LOW_CONTRAST_GROUND_TRUTH =
  'This text has intentionally low contrast to test OCR robustness. ' +
  'Light gray text on a slightly darker background is challenging for most engines.';

const MIXED_LAYOUT_GROUND_TRUTH =
  'Annual Report 2025\n' +
  'Executive Summary\n' +
  'Revenue grew 15% year over year reaching $2.4 million.\n' +
  'Key Metrics:\n' +
  '- Customer satisfaction: 94%\n' +
  '- Employee retention: 91%\n' +
  '- Net promoter score: 72';

async function generateCleanTextPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lines = CLEAN_TEXT_GROUND_TRUTH.match(/.{1,70}(\s|$)/g) ?? [CLEAN_TEXT_GROUND_TRUTH];
  lines.forEach((line, i) => {
    page.drawText(line.trim(), { x: 48, y: 700 - i * 24, size: 12, font });
  });

  return Buffer.from(await pdfDoc.save());
}

async function generateInvoicePdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const lines = INVOICE_GROUND_TRUTH.split('\n');
  // First line is header
  page.drawText(lines[0], { x: 48, y: 730, size: 18, font: boldFont });
  for (let i = 1; i < lines.length; i++) {
    page.drawText(lines[i], { x: 48, y: 700 - (i - 1) * 24, size: 12, font });
  }

  return Buffer.from(await pdfDoc.save());
}

async function generateSmallFontPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lines = SMALL_FONT_GROUND_TRUTH.match(/.{1,90}(\s|$)/g) ?? [SMALL_FONT_GROUND_TRUTH];
  lines.forEach((line, i) => {
    page.drawText(line.trim(), { x: 48, y: 700 - i * 14, size: 8, font });
  });

  return Buffer.from(await pdfDoc.save());
}

async function generateLowContrastPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Light background
  page.drawRectangle({
    x: 0, y: 0,
    width: 612, height: 792,
    color: rgb(0.85, 0.85, 0.85),
  });

  // Light gray text
  const lines = LOW_CONTRAST_GROUND_TRUTH.match(/.{1,70}(\s|$)/g) ?? [LOW_CONTRAST_GROUND_TRUTH];
  lines.forEach((line, i) => {
    page.drawText(line.trim(), {
      x: 48, y: 700 - i * 24, size: 12, font,
      color: rgb(0.55, 0.55, 0.55),
    });
  });

  return Buffer.from(await pdfDoc.save());
}

async function generateMixedLayoutPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const lines = MIXED_LAYOUT_GROUND_TRUTH.split('\n');
  let y = 730;
  for (const line of lines) {
    const isHeader = line === lines[0] || line === lines[1];
    const isBullet = line.startsWith('-');
    const fontSize = isHeader ? 16 : 11;
    const x = isBullet ? 72 : 48;
    page.drawText(line, { x, y, size: fontSize, font: isHeader ? boldFont : font });
    y -= isHeader ? 32 : 22;
  }

  return Buffer.from(await pdfDoc.save());
}

const FIXTURES: TestFixture[] = [
  {
    name: 'clean-text',
    description: 'Standard 12pt Helvetica, well-spaced',
    groundTruth: CLEAN_TEXT_GROUND_TRUTH,
    generatePdf: generateCleanTextPdf,
  },
  {
    name: 'invoice',
    description: 'Multi-column invoice with numbers, $, %',
    groundTruth: INVOICE_GROUND_TRUTH,
    generatePdf: generateInvoicePdf,
  },
  {
    name: 'small-font',
    description: '8pt text, dense layout',
    groundTruth: SMALL_FONT_GROUND_TRUTH,
    generatePdf: generateSmallFontPdf,
  },
  {
    name: 'low-contrast',
    description: 'Light gray text on slightly darker gray',
    groundTruth: LOW_CONTRAST_GROUND_TRUTH,
    generatePdf: generateLowContrastPdf,
  },
  {
    name: 'mixed-layout',
    description: 'Headers, body, bullet lists',
    groundTruth: MIXED_LAYOUT_GROUND_TRUTH,
    generatePdf: generateMixedLayoutPdf,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface BenchmarkResult {
  engine: string;
  fixture: string;
  preprocess: string;
  metrics: OCRQualityMetrics;
  extractedText: string;
  elapsedMs: number;
}

function buildQuery(engine: BenchmarkEngine, preprocess: NamedPreprocessConfig): string {
  const params = new URLSearchParams();
  params.set('engine', engine.tier);
  params.set('strictEngine', '1');
  params.set('forceOcr', '1');
  if (engine.model) {
    params.set('model', engine.model);
  }
  if (HF_TOKEN) {
    params.set('hfToken', HF_TOKEN);
  }
  if (preprocess.config !== false) {
    params.set(
      'preprocess',
      preprocess.config === true ? 'true' : JSON.stringify(preprocess.config),
    );
  }
  return `/? ${params.toString()}`;
}

async function uploadPdfAndCollect(
  page: Page,
  query: string,
  pdfBuffer: Buffer,
): Promise<{ text: string; elapsedMs: number }> {
  const start = Date.now();
  await page.goto(query);
  await expect(page.locator('.upload-zone')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'benchmark-source.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.locator('.results-view')).toBeVisible({ timeout: 10 * 60 * 1000 });
  const text = (await page.locator('.extracted-text').innerText()).trim();
  const elapsedMs = Date.now() - start;
  return { text, elapsedMs };
}

function formatTable(results: BenchmarkResult[]): string {
  const header = [
    'Engine'.padEnd(30),
    'Fixture'.padEnd(16),
    'Preprocess'.padEnd(18),
    'CER'.padEnd(8),
    'WER'.padEnd(8),
    'CharAcc'.padEnd(8),
    'WordAcc'.padEnd(8),
    'Time(s)',
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  const rows = results.map((r) =>
    [
      r.engine.padEnd(30),
      r.fixture.padEnd(16),
      r.preprocess.padEnd(18),
      r.metrics.charErrorRate.toFixed(4).padEnd(8),
      r.metrics.wordErrorRate.toFixed(4).padEnd(8),
      r.metrics.charAccuracy.toFixed(4).padEnd(8),
      r.metrics.wordAccuracy.toFixed(4).padEnd(8),
      (r.elapsedMs / 1000).toFixed(1),
    ].join(' | '),
  );

  return [separator, header, separator, ...rows, separator].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Test                                                                */
/* ------------------------------------------------------------------ */

// Allow subset selection via environment variables
const BENCHMARK_ENGINES = process.env.BENCHMARK_ENGINES
  ? ENGINES.filter((e) =>
      process.env.BENCHMARK_ENGINES!.split(',').some(
        (name) => e.label.includes(name.trim()) || e.model === name.trim() || e.tier === name.trim(),
      ),
    )
  : ENGINES;

const BENCHMARK_FIXTURES = process.env.BENCHMARK_FIXTURES
  ? FIXTURES.filter((f) =>
      process.env.BENCHMARK_FIXTURES!.split(',').includes(f.name),
    )
  : FIXTURES;

const BENCHMARK_PREPROCESS = process.env.BENCHMARK_PREPROCESS
  ? PREPROCESS_CONFIGS.filter((p) =>
      process.env.BENCHMARK_PREPROCESS!.split(',').includes(p.name),
    )
  : PREPROCESS_CONFIGS;

test.describe('OCR Engine Benchmark', () => {
  test.skip(!LIVE_OCR_ENABLED, 'Set LIVE_OCR=1 to run OCR benchmark.');

  test('benchmarks all engine × preprocess × fixture combinations', async ({ page }) => {
    // Very long timeout for comprehensive benchmark
    test.setTimeout(60 * 60 * 1000); // 1 hour

    // Generate all fixture PDFs
    const fixturePdfs = new Map<string, Buffer>();
    for (const fixture of BENCHMARK_FIXTURES) {
      fixturePdfs.set(fixture.name, await fixture.generatePdf());
    }

    const allResults: BenchmarkResult[] = [];
    let completed = 0;
    const total = BENCHMARK_ENGINES.length * BENCHMARK_FIXTURES.length * BENCHMARK_PREPROCESS.length;

    for (const engine of BENCHMARK_ENGINES) {
      for (const fixture of BENCHMARK_FIXTURES) {
        for (const preprocess of BENCHMARK_PREPROCESS) {
          completed++;
          const progress = `[${completed}/${total}]`;
          console.log(
            `${progress} Testing: ${engine.label} | ${fixture.name} | preprocess=${preprocess.name}`,
          );

          const query = buildQuery(engine, preprocess);
          const pdfBuffer = fixturePdfs.get(fixture.name)!;

          let result: BenchmarkResult;
          try {
            const { text, elapsedMs } = await uploadPdfAndCollect(page, query, pdfBuffer);
            const metrics = evaluateOCRQuality(fixture.groundTruth, text);

            result = {
              engine: engine.label,
              fixture: fixture.name,
              preprocess: preprocess.name,
              metrics,
              extractedText: text,
              elapsedMs,
            };

            console.log(
              `  -> CER=${metrics.charErrorRate.toFixed(4)} WER=${metrics.wordErrorRate.toFixed(4)} (${(elapsedMs / 1000).toFixed(1)}s)`,
            );
          } catch (error) {
            console.log(`  -> FAILED: ${(error as Error).message}`);
            result = {
              engine: engine.label,
              fixture: fixture.name,
              preprocess: preprocess.name,
              metrics: { charErrorRate: 1, wordErrorRate: 1, charAccuracy: 0, wordAccuracy: 0 },
              extractedText: `ERROR: ${(error as Error).message}`,
              elapsedMs: 0,
            };
          }

          allResults.push(result);
        }
      }
    }

    // Output comparison table
    console.log('\n\n===== OCR BENCHMARK RESULTS =====\n');
    console.log(formatTable(allResults));

    // Output summary: best engine per fixture
    console.log('\n===== BEST ENGINE PER FIXTURE =====\n');
    for (const fixture of BENCHMARK_FIXTURES) {
      const fixtureResults = allResults
        .filter((r) => r.fixture === fixture.name && !r.extractedText.startsWith('ERROR'))
        .sort((a, b) => a.metrics.charErrorRate - b.metrics.charErrorRate);

      if (fixtureResults.length > 0) {
        const best = fixtureResults[0];
        console.log(
          `${fixture.name}: ${best.engine} + ${best.preprocess} ` +
            `(CER=${best.metrics.charErrorRate.toFixed(4)}, WER=${best.metrics.wordErrorRate.toFixed(4)})`,
        );
      }
    }

    // Save results as JSON
    const resultsDir = path.join(__dirname, '..', 'results');
    await mkdir(resultsDir, { recursive: true });
    const resultsPath = path.join(resultsDir, 'benchmark-results.json');
    const output = {
      timestamp: new Date().toISOString(),
      engineCount: BENCHMARK_ENGINES.length,
      fixtureCount: BENCHMARK_FIXTURES.length,
      preprocessCount: BENCHMARK_PREPROCESS.length,
      totalCombinations: total,
      results: allResults.map(({ extractedText, ...rest }) => rest),
      bestPerFixture: Object.fromEntries(
        BENCHMARK_FIXTURES.map((fixture) => {
          const fixtureResults = allResults
            .filter((r) => r.fixture === fixture.name && !r.extractedText.startsWith('ERROR'))
            .sort((a, b) => a.metrics.charErrorRate - b.metrics.charErrorRate);
          return [
            fixture.name,
            fixtureResults.length > 0
              ? {
                  engine: fixtureResults[0].engine,
                  preprocess: fixtureResults[0].preprocess,
                  charErrorRate: fixtureResults[0].metrics.charErrorRate,
                  wordErrorRate: fixtureResults[0].metrics.wordErrorRate,
                }
              : null,
          ];
        }),
      ),
    };
    await writeFile(resultsPath, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

    // Basic sanity: at least one engine should produce something
    const successfulResults = allResults.filter(
      (r) => !r.extractedText.startsWith('ERROR') && r.extractedText.length > 0,
    );
    expect(successfulResults.length).toBeGreaterThan(0);
  });
});
