import { describe, it, expect, beforeAll } from 'vitest';
import { get } from 'svelte/store';
import { _, locale, init, addMessages, waitLocale } from 'svelte-i18n';
import en from './en.json';
import ro from './ro.json';

describe('i18n', () => {
  beforeAll(async () => {
    addMessages('en', en);
    addMessages('ro', ro);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  it('provides English translations', () => {
    const translate = get(_);
    expect(translate('app.title')).toBe('CopyCat');
    expect(translate('upload.dropzone')).toContain('Drop');
  });

  it('switches to Romanian', async () => {
    locale.set('ro');
    await waitLocale();
    const translate = get(_);
    expect(translate('app.title')).toBe('CopyCat');
    expect(translate('upload.dropzone')).toContain('Trage');
  });

  it('has all required keys in both languages', () => {
    const enKeys = Object.keys(flattenKeys(en));
    const roKeys = Object.keys(flattenKeys(ro));
    for (const key of enKeys) {
      expect(roKeys).toContain(key);
    }
  });
});

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}
