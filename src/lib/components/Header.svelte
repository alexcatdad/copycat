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
    border-bottom: 1px solid color-mix(in oklab, var(--border-color), white 15%);
    background: color-mix(in oklab, var(--surface-2), white 18%);
    backdrop-filter: blur(6px);
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  h1 {
    font-size: 1.65rem;
    font-weight: 700;
    margin: 0;
    color: var(--ink-strong);
  }

  .subtitle {
    font-size: 0.86rem;
    color: var(--ink-muted);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .tier-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.22rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    letter-spacing: 0.02em;
  }

  .tier-premium {
    background: color-mix(in oklab, var(--accent-teal), white 72%);
    color: color-mix(in oklab, var(--accent-teal), black 12%);
  }

  .tier-standard {
    background: color-mix(in oklab, var(--accent-copper), white 78%);
    color: color-mix(in oklab, var(--accent-copper), black 10%);
  }

  .tier-basic {
    background: color-mix(in oklab, var(--ink-muted), white 84%);
    color: var(--ink-muted);
  }

  @media (max-width: 700px) {
    header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .brand {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
    }
  }
</style>
