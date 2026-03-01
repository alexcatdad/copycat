import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  evaluateOCRQuality,
  type OCRQualityMetrics,
} from '../../src/lib/ocr-quality';
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const LIVE_OCR_ENABLED = process.env.LIVE_OCR === '1';

interface BenchmarkEngine {
  label: string;
  tier: string;
  model?: string;
}

// Only open (non-gated) models — no HF_TOKEN required
const ENGINES: BenchmarkEngine[] = [
  { label: 'tesseract (basic)', tier: 'basic' },
  { label: 'tesseract-combined', tier: 'basic', model: 'tesseract-combined' },
  { label: 'trocr-hybrid (standard)', tier: 'standard', model: 'trocr-hybrid' },
  { label: 'trocr-base (standard)', tier: 'standard', model: 'trocr-base' },
  { label: 'trocr-small-handwritten (standard)', tier: 'standard', model: 'trocr-small-handwritten' },
  { label: 'trocr-base-handwritten (standard)', tier: 'standard', model: 'trocr-base-handwritten' },
  { label: 'donut (standard)', tier: 'standard', model: 'donut' },
  { label: 'nougat (standard)', tier: 'standard', model: 'nougat' },
  { label: 'mgp-str (standard)', tier: 'standard', model: 'mgp-str' },
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

function safeLabel(label: string): string {
  return label.replace(/[^a-z0-9-]/gi, '_');
}

const RESULTS_DIR = path.join(__dirname, '..', 'results');

/* ------------------------------------------------------------------ */
/*  Environment-variable filtering                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Sharding: split engines across CI machines                         */
/* ------------------------------------------------------------------ */

const SHARD_INDEX = process.env.BENCHMARK_SHARD
  ? parseInt(process.env.BENCHMARK_SHARD, 10)
  : undefined;
const TOTAL_SHARDS = process.env.BENCHMARK_TOTAL_SHARDS
  ? parseInt(process.env.BENCHMARK_TOTAL_SHARDS, 10)
  : undefined;

const SHARDED_ENGINES =
  SHARD_INDEX !== undefined && TOTAL_SHARDS !== undefined
    ? BENCHMARK_ENGINES.filter((_, i) => i % TOTAL_SHARDS === SHARD_INDEX)
    : BENCHMARK_ENGINES;

/* ------------------------------------------------------------------ */
/*  Per-engine parallel tests                                          */
/* ------------------------------------------------------------------ */

test.describe('OCR Engine Benchmark', () => {
  test.skip(!LIVE_OCR_ENABLED, 'Set LIVE_OCR=1 to run OCR benchmark.');

  for (const engine of SHARDED_ENGINES) {
    test(`benchmark: ${engine.label}`, async ({ page }) => {
      // 10 min per engine (30 combos: 5 fixtures × 6 preprocess)
      test.setTimeout(10 * 60 * 1000);

      // Generate fixture PDFs
      const fixturePdfs = new Map<string, Buffer>();
      for (const fixture of BENCHMARK_FIXTURES) {
        fixturePdfs.set(fixture.name, await fixture.generatePdf());
      }

      const results: BenchmarkResult[] = [];
      let completed = 0;
      const total = BENCHMARK_FIXTURES.length * BENCHMARK_PREPROCESS.length;

      for (const fixture of BENCHMARK_FIXTURES) {
        for (const preprocess of BENCHMARK_PREPROCESS) {
          completed++;
          console.log(
            `[${completed}/${total}] ${engine.label} | ${fixture.name} | preprocess=${preprocess.name}`,
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

          results.push(result);
        }
      }

      // Write per-engine partial results
      await mkdir(RESULTS_DIR, { recursive: true });
      await writeFile(
        path.join(RESULTS_DIR, `benchmark-${safeLabel(engine.label)}.json`),
        JSON.stringify(results, null, 2),
      );

      // At least one combo should succeed per engine
      const successes = results.filter(
        (r) => !r.extractedText.startsWith('ERROR') && r.extractedText.length > 0,
      );
      expect(successes.length).toBeGreaterThan(0);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Aggregation: merge per-engine results into final report            */
/* ------------------------------------------------------------------ */

test.describe('OCR Benchmark Report', () => {
  test.skip(!LIVE_OCR_ENABLED, 'Set LIVE_OCR=1 to run OCR benchmark.');

  test('aggregate benchmark results', async () => {
    test.setTimeout(30_000);

    await mkdir(RESULTS_DIR, { recursive: true });

    const files = await readdir(RESULTS_DIR);
    const partials = files.filter(
      (f) => f.startsWith('benchmark-') && f.endsWith('.json') && f !== 'benchmark-results.json',
    );

    if (partials.length === 0) {
      console.log('No partial benchmark results found — skipping aggregation.');
      return;
    }

    const allResults: BenchmarkResult[] = [];
    for (const file of partials) {
      const data = JSON.parse(await readFile(path.join(RESULTS_DIR, file), 'utf8'));
      allResults.push(...data);
    }

    // Combined JSON
    const output = {
      timestamp: new Date().toISOString(),
      engineCount: new Set(allResults.map((r) => r.engine)).size,
      fixtureCount: new Set(allResults.map((r) => r.fixture)).size,
      preprocessCount: new Set(allResults.map((r) => r.preprocess)).size,
      totalCombinations: allResults.length,
      results: allResults.map(({ extractedText, ...rest }) => rest),
      bestPerFixture: Object.fromEntries(
        [...new Set(allResults.map((r) => r.fixture))].map((fixtureName) => {
          const fixtureResults = allResults
            .filter((r) => r.fixture === fixtureName && !r.extractedText.startsWith('ERROR'))
            .sort((a, b) => a.metrics.charErrorRate - b.metrics.charErrorRate);
          return [
            fixtureName,
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
    await writeFile(path.join(RESULTS_DIR, 'benchmark-results.json'), JSON.stringify(output, null, 2));

    // Markdown report
    const mdLines: string[] = [
      '## OCR Benchmark Results',
      '',
      `**${output.engineCount}** engines x **${output.fixtureCount}** fixtures x **${output.preprocessCount}** preprocessing configs = **${output.totalCombinations}** combinations`,
      '',
      '### Results',
      '',
      '| Engine | Fixture | Preprocess | CER | WER | Char Acc | Word Acc | Time |',
      '|--------|---------|------------|-----|-----|----------|----------|------|',
    ];
    for (const r of allResults) {
      const err = r.extractedText.startsWith('ERROR');
      mdLines.push(
        `| ${r.engine} | ${r.fixture} | ${r.preprocess} | ${err ? 'ERR' : r.metrics.charErrorRate.toFixed(4)} | ${err ? 'ERR' : r.metrics.wordErrorRate.toFixed(4)} | ${err ? 'ERR' : (r.metrics.charAccuracy * 100).toFixed(1) + '%'} | ${err ? 'ERR' : (r.metrics.wordAccuracy * 100).toFixed(1) + '%'} | ${err ? '-' : (r.elapsedMs / 1000).toFixed(1) + 's'} |`,
      );
    }

    const fixtureNames = [...new Set(allResults.map((r) => r.fixture))];
    mdLines.push('', '### Best Engine Per Fixture', '');
    for (const fixtureName of fixtureNames) {
      const fixtureResults = allResults
        .filter((r) => r.fixture === fixtureName && !r.extractedText.startsWith('ERROR'))
        .sort((a, b) => a.metrics.charErrorRate - b.metrics.charErrorRate);
      if (fixtureResults.length > 0) {
        const best = fixtureResults[0];
        mdLines.push(
          `- **${fixtureName}**: ${best.engine} + ${best.preprocess} (CER=${best.metrics.charErrorRate.toFixed(4)}, Word Acc=${(best.metrics.wordAccuracy * 100).toFixed(1)}%)`,
        );
      }
    }
    mdLines.push('');
    await writeFile(path.join(RESULTS_DIR, 'benchmark-results.md'), mdLines.join('\n'));

    console.log(`Aggregated ${allResults.length} results from ${partials.length} engine files.`);
    console.log('\n===== BEST ENGINE PER FIXTURE =====\n');
    for (const [fixture, best] of Object.entries(output.bestPerFixture)) {
      if (best) {
        console.log(`${fixture}: ${(best as any).engine} + ${(best as any).preprocess} (CER=${(best as any).charErrorRate.toFixed(4)})`);
      }
    }

    expect(allResults.length).toBeGreaterThan(0);
  });
});
