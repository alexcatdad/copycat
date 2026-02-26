<script lang="ts">
  import { _ } from 'svelte-i18n';

  const appVersion = __APP_VERSION__;
</script>

<footer>
  <p>{$_('app.privacy')} · v{appVersion}</p>
</footer>

<style>
  footer {
    padding: 1rem 2rem;
    text-align: center;
    border-top: 1px solid var(--border-color);
    color: var(--ink-muted);
    font-size: 0.8rem;
    background: color-mix(in oklab, var(--surface-2), white 15%);
  }
</style>
