import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('en', () => import('./en.json'));
register('ro', () => import('./ro.json'));

export function setupI18n() {
  const savedLocale = typeof localStorage !== 'undefined'
    ? localStorage.getItem('copycat-locale')
    : null;

  const navigatorLocale = getLocaleFromNavigator()?.split('-')[0];
  const initialLocale = savedLocale ?? (navigatorLocale === 'ro' ? 'ro' : 'en');

  init({
    fallbackLocale: 'en',
    initialLocale,
  });
}
