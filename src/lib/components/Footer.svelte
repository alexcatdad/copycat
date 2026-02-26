<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<footer>
  <p>{$_('app.privacy')}</p>
</footer>

<style>
  footer {
    padding: 1rem 2rem;
    text-align: center;
    border-top: 1px solid var(--border-color, #e5e7eb);
    color: var(--text-muted, #9ca3af);
    font-size: 0.8rem;
  }
</style>
