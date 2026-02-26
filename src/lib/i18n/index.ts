import { addMessages, init, getLocaleFromNavigator } from 'svelte-i18n';
import en from './en.json';
import ro from './ro.json';

addMessages('en', en);
addMessages('ro', ro);

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
