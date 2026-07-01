<script lang="ts">
  /**
   * PageLoader — transient top progress bar for SvelteKit navigations.
   *
   * It watches $app/state's page URL. Whenever the route changes, it shows a
   * thin violet bar for at least 500ms so taps on bottom-nav links have
   * immediate visual feedback even when the next page is lightweight.
   */
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';

  let visible = $state(false);
  let currentUrl = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  function pulse(): void {
    visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible = false;
      timer = null;
    }, 500);
  }

  $effect(() => {
    const nextUrl = `${page.url.pathname}${page.url.search}`;

    if (!currentUrl) {
      currentUrl = nextUrl;
      return;
    }

    if (currentUrl !== nextUrl) {
      currentUrl = nextUrl;
      pulse();
    }
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if visible}
  <div class="page-loader" role="status" aria-live="polite" aria-label="A carregar página"></div>
{/if}

<style>
  .page-loader {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    z-index: 10001;
    pointer-events: none;
    overflow: hidden;
    background: rgba(139, 92, 246, 0.18);
  }

  .page-loader::before {
    content: '';
    display: block;
    width: 45%;
    height: 100%;
    border-radius: 999px;
    background: #8b5cf6;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.65);
    animation: page-loader-slide 500ms ease-in-out both;
  }

  @keyframes page-loader-slide {
    from {
      transform: translateX(-110%);
      opacity: 0.4;
    }
    30% {
      opacity: 1;
    }
    to {
      transform: translateX(235%);
      opacity: 0.85;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-loader::before {
      width: 100%;
      animation: none;
    }
  }
</style>
