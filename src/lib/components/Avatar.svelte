<script lang="ts">
  /** Avatar de conta: foto (avatar_url) quando exista, senão o emoji. */
  interface Props {
    emoji?: string | null;
    url?: string | null;
    size?: number;
    alt?: string;
  }
  let { emoji = '🙂', url = null, size = 40, alt = '' }: Props = $props();
</script>

{#if url}
  <img class="av-img" src={url} {alt} style={`width:${size}px;height:${size}px`} loading="lazy" />
{:else}
  <span class="av-emoji" style={`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px`} aria-hidden="true">{emoji ?? '🙂'}</span>
{/if}

<style>
  .av-img {
    border-radius: 999px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--bg-elev);
    border: 1px solid var(--border);
  }
  .av-emoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-elev));
    flex-shrink: 0;
    line-height: 1;
  }
</style>
