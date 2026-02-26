<script lang="ts">
  import { locale } from 'svelte-i18n';

  let currentLocale = $state('en');

  locale.subscribe((val) => {
    if (val) currentLocale = val;
  });

  function setLocale(lang: string) {
    locale.set(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('copycat-locale', lang);
    }
  }
</script>

<div class="lang-switcher">
  <button
    class:active={currentLocale === 'en'}
    onclick={() => setLocale('en')}
  >EN</button>
  <button
    class:active={currentLocale === 'ro'}
    onclick={() => setLocale('ro')}
  >RO</button>
</div>

<style>
  .lang-switcher {
    display: flex;
    gap: 2px;
    background: var(--bg-subtle, #e5e7eb);
    border-radius: 6px;
    padding: 2px;
  }

  button {
    padding: 0.25rem 0.6rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted, #6b7280);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  button.active {
    background: white;
    color: var(--text-primary, #111827);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
</style>
