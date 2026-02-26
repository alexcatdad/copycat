<script lang="ts">
  import { _ } from 'svelte-i18n';
  import LanguageSwitcher from './LanguageSwitcher.svelte';
  import type { EngineTier } from '../types';

  interface Props {
    tier: EngineTier;
  }

  let { tier }: Props = $props();
</script>

<header>
  <div class="brand">
    <h1>CopyCat</h1>
    <span class="subtitle">{$_('app.subtitle')}</span>
  </div>
  <div class="controls">
    <span class="tier-badge tier-{tier}">
      {$_(`tier.${tier}`)}
    </span>
    <LanguageSwitcher />
  </div>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--text-muted, #6b7280);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .tier-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
  }

  .tier-premium {
    background: #dcfce7;
    color: #166534;
  }

  .tier-standard {
    background: #dbeafe;
    color: #1e40af;
  }

  .tier-basic {
    background: #f3f4f6;
    color: #374151;
  }
</style>
