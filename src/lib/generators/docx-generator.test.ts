import { describe, it, expect } from 'vitest';
import { generateDocx, _testOnly } from './docx-generator';
import type { OCRResult, OCRRegion, PageImage } from '../types';

const { groupIntoLines, classifyLines, computeGlobalMedianHeight } = _testOnly;

const mockPages: PageImage[] = [
  { id: 'p1', src: 'blob:p1', blob: new Blob(['p1'], { type: 'image/png' }), width: 800, height: 1200, pageNumber: 1, sourceKind: 'image' },
  { id: 'p2', src: 'blob:p2', blob: new Blob(['p2'], { type: 'image/png' }), width: 800, height: 1200, pageNumber: 2, sourceKind: 'image' },
];

const mockResults: OCRResult[] = [
  {
    text: 'Hello World',
    regions: [
      { text: 'Hello', bbox: [50, 100, 200, 30] },
      { text: 'World', bbox: [50, 150, 200, 30] },
    ],
    source: 'ocr',
    qualityScore: 0.91,
    qualityFlags: [],
  },
  {
    text: 'Page two content',
    regions: [
      { text: 'Page two', bbox: [50, 100, 250, 30] },
      { text: 'content', bbox: [50, 150, 200, 30] },
    ],
    source: 'ocr',
    qualityScore: 0.88,
    qualityFlags: [],
  },
];

describe('generateDocx', () => {
  it('returns a Blob of type docx', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('produces a non-empty blob', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty results', async () => {
    const blob = await generateDocx([], []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('groupIntoLines', () => {
  it('groups regions on the same y-level into one line', () => {
    const regions: OCRRegion[] = [
      { text: 'Hello', bbox: [50, 100, 100, 20] },
      { text: 'World', bbox: [160, 102, 100, 20] },
    ];
    const lines = groupIntoLines(regions);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(2);
  });

  it('splits into multiple lines for different y-levels', () => {
    const regions: OCRRegion[] = [
      { text: 'Line 1', bbox: [50, 50, 200, 20] },
      { text: 'Line 2', bbox: [50, 120, 200, 20] },
    ];
    const lines = groupIntoLines(regions);
    expect(lines).toHaveLength(2);
  });

  it('sorts regions left-to-right within a line', () => {
    const regions: OCRRegion[] = [
      { text: 'B', bbox: [200, 50, 50, 20] },
      { text: 'A', bbox: [50, 52, 50, 20] },
    ];
    const lines = groupIntoLines(regions);
    expect(lines[0][0].text).toBe('A');
    expect(lines[0][1].text).toBe('B');
  });

  it('filters empty regions', () => {
    const regions: OCRRegion[] = [
      { text: 'Valid', bbox: [50, 50, 200, 20] },
      { text: '  ', bbox: [50, 100, 200, 20] },
    ];
    const lines = groupIntoLines(regions);
    expect(lines).toHaveLength(1);
  });
});

describe('classifyLines', () => {
  const page: PageImage = {
    id: 'p', src: '', blob: new Blob(), width: 1000, height: 800,
    pageNumber: 1, sourceKind: 'image',
  };

  it('classifies large text as heading', () => {
    const lines: OCRRegion[][] = [
      [{ text: 'Big Title', bbox: [50, 20, 400, 50] }],
      [{ text: 'Normal body text that spans some width here.', bbox: [50, 100, 500, 20] }],
      [{ text: 'Another body line.', bbox: [50, 130, 400, 20] }],
    ];
    const classified = classifyLines(lines, page, computeGlobalMedianHeight(lines));
    expect(classified[0].kind).toBe('heading');
    expect(classified[1].kind).toBe('body');
  });

  it('classifies bullet-prefixed text as bullet', () => {
    const lines: OCRRegion[][] = [
      [{ text: '• First item', bbox: [80, 50, 300, 20] }],
      [{ text: '• Second item', bbox: [80, 80, 300, 20] }],
      [{ text: 'Normal text', bbox: [50, 120, 300, 20] }],
    ];
    const classified = classifyLines(lines, page, computeGlobalMedianHeight(lines));
    expect(classified[0].kind).toBe('bullet');
    expect(classified[1].kind).toBe('bullet');
    expect(classified[2].kind).toBe('body');
  });

  it('classifies dash-prefixed text as bullet', () => {
    const lines: OCRRegion[][] = [
      [{ text: '- Item A', bbox: [80, 50, 300, 20] }],
    ];
    const classified = classifyLines(lines, page, computeGlobalMedianHeight(lines));
    expect(classified[0].kind).toBe('bullet');
  });

  it('classifies numbered-prefixed text as numbered', () => {
    const lines: OCRRegion[][] = [
      [{ text: '1. First step', bbox: [80, 50, 300, 20] }],
      [{ text: '2) Second step', bbox: [80, 80, 300, 20] }],
    ];
    const classified = classifyLines(lines, page, computeGlobalMedianHeight(lines));
    expect(classified[0].kind).toBe('numbered');
    expect(classified[0].listNumber).toBe(1);
    expect(classified[1].kind).toBe('numbered');
    expect(classified[1].listNumber).toBe(2);
  });

  it('classifies wide multi-region lines as table-row', () => {
    const lines: OCRRegion[][] = [
      [
        { text: 'Name', bbox: [20, 50, 120, 20] },
        { text: 'Qty', bbox: [300, 50, 60, 20] },
        { text: 'Price', bbox: [550, 50, 80, 20] },
        { text: 'Total', bbox: [800, 50, 80, 20] },
      ],
    ];
    const classified = classifyLines(lines, page, computeGlobalMedianHeight(lines));
    expect(classified[0].kind).toBe('table-row');
  });
});

describe('generateDocx with structured content', () => {
  it('generates docx with headings and bullets', async () => {
    const structuredResult: OCRResult = {
      text: 'Title\n• Item 1\n• Item 2\nBody text',
      regions: [
        { text: 'Title', bbox: [50, 20, 400, 50] },
        { text: '• Item 1', bbox: [80, 100, 300, 20] },
        { text: '• Item 2', bbox: [80, 130, 300, 20] },
        { text: 'Body text paragraph here.', bbox: [50, 200, 500, 20] },
      ],
      source: 'ocr',
      qualityScore: 0.92,
      qualityFlags: [],
    };

    const blob = await generateDocx([structuredResult], [mockPages[0]]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('generates docx with table rows', async () => {
    const tableResult: OCRResult = {
      text: 'Name Qty Price Total',
      regions: [
        { text: 'Name', bbox: [20, 50, 120, 20] },
        { text: 'Qty', bbox: [300, 50, 60, 20] },
        { text: 'Price', bbox: [550, 50, 80, 20] },
        { text: 'Total', bbox: [800, 50, 80, 20] },
        { text: 'Widget', bbox: [20, 80, 120, 20] },
        { text: '5', bbox: [300, 80, 60, 20] },
        { text: '$10', bbox: [550, 80, 80, 20] },
        { text: '$50', bbox: [800, 80, 80, 20] },
      ],
      source: 'ocr',
      qualityScore: 0.90,
      qualityFlags: [],
    };

    const page: PageImage = {
      id: 'p1', src: 'blob:p1', blob: new Blob(), width: 1000, height: 400,
      pageNumber: 1, sourceKind: 'image',
    };

    const blob = await generateDocx([tableResult], [page]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles mixed content across multiple pages', async () => {
    const results: OCRResult[] = [
      {
        text: 'Heading\nBody text',
        regions: [
          { text: 'Heading', bbox: [50, 20, 400, 48] },
          { text: 'Body text', bbox: [50, 100, 300, 20] },
        ],
        source: 'ocr',
        qualityScore: 0.85,
        qualityFlags: [],
      },
      {
        text: '1. First\n2. Second',
        regions: [
          { text: '1. First', bbox: [80, 50, 300, 20] },
          { text: '2. Second', bbox: [80, 80, 300, 20] },
        ],
        source: 'ocr',
        qualityScore: 0.87,
        qualityFlags: [],
      },
    ];

    const blob = await generateDocx(results, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
