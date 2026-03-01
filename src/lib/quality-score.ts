import type { OCRResult, OCRRegion } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function suspiciousSymbolRatio(text: string): number {
  if (!text) return 1;
  const chars = Array.from(text);
  let suspicious = 0;

  for (const char of chars) {
    if (/\s/.test(char)) {
      continue;
    }
    if (!/[\p{L}\p{N}.,:;!?()\-/$%#@&+•·–—""''…™®©°×¹²³½¼¾→←↑↓✓✗★☆▪▸►■□▶●○◆◇\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u2026]/u.test(char)) {
      suspicious += 1;
    }
  }

  const nonSpace = chars.filter((char) => !/\s/.test(char)).length;
  if (nonSpace === 0) return 1;
  return suspicious / nonSpace;
}

// Common English words for dictionary-based plausibility check (~500 words)
const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been',
  'has', 'had', 'did', 'does', 'being', 'having', 'may', 'might', 'shall', 'should',
  'must', 'need', 'very', 'still', 'between', 'each', 'much', 'before', 'too',
  'same', 'right', 'here', 'where', 'own', 'through', 'under', 'long', 'while',
  'both', 'those', 'more', 'such', 'part', 'made', 'find', 'many', 'down', 'side',
  'been', 'call', 'did', 'more', 'long', 'who', 'oil', 'its', 'let', 'said',
  'number', 'name', 'date', 'page', 'total', 'amount', 'section', 'item', 'per',
  'company', 'address', 'phone', 'email', 'agreement', 'contract', 'party', 'tenant',
  'landlord', 'lease', 'rent', 'property', 'payment', 'monthly', 'annual', 'term',
  'shall', 'must', 'herein', 'thereof', 'pursuant', 'subject', 'including', 'without',
  'upon', 'during', 'prior', 'within', 'after', 'before', 'between', 'under',
  'above', 'below', 'title', 'description', 'note', 'table', 'figure', 'slide',
  'presentation', 'document', 'report', 'summary', 'introduction', 'conclusion',
  'text', 'data', 'information', 'service', 'services', 'product', 'products',
  'cost', 'price', 'value', 'rate', 'percent', 'year', 'month', 'day', 'week',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'mr', 'mrs', 'ms', 'dr', 'inc', 'ltd', 'llc',
  'street', 'avenue', 'road', 'city', 'state', 'zip', 'code', 'country',
  'signed', 'date', 'signature', 'print', 'witness', 'notary', 'seal',
  'effective', 'applicable', 'provided', 'required', 'authorized', 'approved',

  // Business, compliance, and industry terms
  'invoice', 'invoices', 'compliance', 'automation', 'automate', 'automated',
  'healthcare', 'construction', 'logistics', 'firms', 'firm', 'enterprise',
  'reduce', 'risk', 'audit', 'readiness', 'regulatory', 'checks', 'review',
  'click', 'built', 'ready', 'manage', 'management', 'process', 'processing',
  'system', 'solution', 'solutions', 'software', 'platform', 'tool', 'tools',
  'customer', 'customers', 'client', 'clients', 'account', 'accounts',
  'order', 'orders', 'delivery', 'shipping', 'tracking', 'status',
  'inventory', 'supply', 'chain', 'vendor', 'vendors', 'supplier', 'suppliers',
  'budget', 'revenue', 'profit', 'margin', 'growth', 'sales', 'market',
  'finance', 'financial', 'tax', 'taxes', 'billing', 'receipt', 'receipts',
  'policy', 'policies', 'regulation', 'regulations', 'standard', 'standards',
  'quality', 'control', 'assurance', 'verify', 'verification', 'validate',
  'approval', 'workflow', 'dashboard', 'report', 'reports', 'analytics',
  'integration', 'integrate', 'connect', 'connected', 'secure', 'security',
  'access', 'user', 'users', 'admin', 'role', 'roles', 'permission',
  'feature', 'features', 'option', 'options', 'setting', 'settings',
  'support', 'help', 'contact', 'learn', 'more', 'start', 'free', 'plan',
  'pricing', 'demo', 'trial', 'sign', 'login', 'register', 'download',
  'upload', 'save', 'delete', 'edit', 'create', 'update', 'search', 'filter',
  'view', 'list', 'detail', 'details', 'open', 'close', 'submit', 'cancel',
  'next', 'previous', 'home', 'menu', 'navigation', 'header', 'footer',
  'image', 'file', 'folder', 'files', 'type', 'format', 'size', 'version',
]);

/**
 * Compute the ratio of words that appear in a common English dictionary.
 * Returns a value between 0 and 1.
 */
function dictionaryMatchRatio(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return 1;

  let matches = 0;
  for (const word of words) {
    // Strip common punctuation from word edges
    const cleaned = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (cleaned && COMMON_WORDS.has(cleaned)) {
      matches++;
    }
  }
  return matches / words.length;
}

/**
 * Check if bounding box heights within regions vary wildly,
 * indicating OCR layout confusion.
 */
function hasHeightAnomaly(regions: OCRRegion[]): boolean {
  if (regions.length < 3) return false;

  const heights = regions
    .map((r) => r.bbox[3])
    .filter((h) => h > 0)
    .sort((a, b) => a - b);

  if (heights.length < 3) return false;

  const median = heights[Math.floor(heights.length / 2)];
  if (median <= 0) return false;

  // Check if any height deviates more than 3x from the median.
  // A generous threshold avoids false positives on documents with
  // intentional size variation (e.g. headings vs body text).
  return heights[heights.length - 1] > median * 3 || heights[0] < median * 0.3;
}

export function inferQuality(
  text: string,
  source: 'ocr' | 'pdf-text',
  baseConfidence?: number,
  regions?: OCRRegion[],
): Pick<OCRResult, 'qualityScore' | 'qualityFlags'> {
  const flags: string[] = [];

  if (source === 'pdf-text') {
    return {
      qualityScore: 0.98,
      qualityFlags: [],
    };
  }

  const trimmed = text.trim();
  const symbolRatio = suspiciousSymbolRatio(trimmed);
  const lineCount = trimmed.split('\n').filter(Boolean).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  let score = typeof baseConfidence === 'number' ? clamp01(baseConfidence) : 0.85;

  if (trimmed.length < 20) {
    score -= 0.25;
    flags.push('very-short-text');
  }

  if (wordCount > 0) {
    const avgWordLength = trimmed.replace(/\s+/g, '').length / wordCount;
    if (avgWordLength > 11 || avgWordLength < 2.2) {
      score -= 0.1;
      flags.push('word-shape-anomaly');
    }
  }

  if (symbolRatio > 0.15) {
    score -= 0.2;
    flags.push('symbol-noise');
  }

  if (lineCount <= 1 && wordCount >= 20) {
    score -= 0.08;
    flags.push('layout-collapse');
  }

  // Dictionary-based plausibility check
  if (wordCount >= 20) {
    const dictRatio = dictionaryMatchRatio(trimmed);
    if (dictRatio < 0.5) {
      score -= 0.15;
      flags.push('dictionary-miss');
    }
  }

  // Height anomaly check across regions
  if (regions && hasHeightAnomaly(regions)) {
    score -= 0.08;
    flags.push('height-anomaly');
  }

  return {
    qualityScore: clamp01(score),
    qualityFlags: Array.from(new Set(flags)),
  };
}
