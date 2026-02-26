import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  OCR_COMPARISON_GROUND_TRUTH,
  OCR_COMPARISON_PROFILES,
  getMockProfileResult,
} from '../src/lib/engines/mock-engine';
import { evaluateOCRQuality } from '../src/lib/ocr-quality';
import { generateOCRQualityReportPdf } from '../src/lib/ocr-quality-report';

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs/demo');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'ocr-comparative-quality-results.json');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'ocr-comparative-quality-results.pdf');

async function main() {
  const generatedAt = new Date().toISOString();
  const comparisons = OCR_COMPARISON_PROFILES.map((profile) => {
    const result = getMockProfileResult(profile);
    return {
      engine: profile,
      extractedText: result.text,
      metrics: evaluateOCRQuality(OCR_COMPARISON_GROUND_TRUTH, result.text),
    };
  });

  const report = {
    title: 'CopyCat OCR Comparative Quality Demo',
    subtitle: 'Tables, graphs, styled typography, and real-world benchmark items',
    groundTruth: OCR_COMPARISON_GROUND_TRUTH,
    comparisons,
    generatedAt,
    overviewParagraphs: [
      'This demo evaluates OCR quality across premium, standard, and basic profiles using CER/WER metrics.',
      'The benchmark text is modeled after practical business documents with headings, line-item style content, totals, and free-form notes.',
    ],
    realWorldItems: [
      {
        item: 'Invoice',
        sampleFields: 'Invoice number, buyer name, line items, totals',
        challenge: 'Decimal precision and currency punctuation',
      },
      {
        item: 'Shipping label',
        sampleFields: 'Address blocks, tracking IDs, postal codes',
        challenge: 'Dense uppercase text and mixed alphanumerics',
      },
      {
        item: 'Purchase order',
        sampleFields: 'SKU table, quantities, unit price, notes',
        challenge: 'Table-like layouts and tight row spacing',
      },
    ],
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const pdfBytes = await generateOCRQualityReportPdf(report);
  await fs.writeFile(OUTPUT_PDF, pdfBytes);

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_PDF}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
