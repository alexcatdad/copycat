import '@testing-library/jest-dom/vitest';
import { addMessages, init } from 'svelte-i18n';
import en from './lib/i18n/en.json';

// Initialize i18n for component tests
addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });
