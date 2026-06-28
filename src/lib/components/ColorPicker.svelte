<!--
  ColorPicker — single sub-component used by /financas/categorias.

  Two parallel inputs (native <input type="color"> + hex text fallback)
  both bound to the same `value` prop.  We can't use `bind:value` here
  because two controls pointing at the same variable break Svelte's
  one-way binding contract; instead we forward `oninput` through the
  parent callback.

  Encapsulating this pattern in a sub-component avoids the svelte-check
  "Left side of comma operator is unused" false-positive that hits when
  the `oninput={...}` arrow lives directly inline in the parent form.
-->
<script lang="ts">
  type Props = {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
  };

  let { value = $bindable('#607d8b'), onChange, ariaLabel = 'Cor' }: Props = $props();

  function handleColor(e: Event) {
    const next = (e.currentTarget as HTMLInputElement).value;
    value = next;
    onChange(next);
  }
  function handleHex(e: Event) {
    const next = (e.currentTarget as HTMLInputElement).value;
    // Only commit if it parses as a hex color; otherwise leave the picker showing the old color.
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
      value = next;
      onChange(next);
    }
  }
</script>

<div class="color-picker">
  <input
    type="color"
    value={value}
    oninput={handleColor}
    aria-label={ariaLabel}
  />
  <input
    type="text"
    class="hex"
    value={value}
    oninput={handleHex}
    maxlength="7"
    autocomplete="off"
    aria-label="{ariaLabel} (hex)"
  />
</div>

<style>
  .color-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .color-picker input[type='color'] {
    width: 44px;
    height: 44px;
    border: 1px solid var(--brd, #94a3b8);
    border-radius: 6px;
    cursor: pointer;
    padding: 0;
  }
  .color-picker input.hex {
    flex: 1;
    min-width: 0;
    padding: 0.5rem;
    font-family: monospace;
    border: 1px solid var(--brd, #94a3b8);
    border-radius: 6px;
    background: transparent;
    color: inherit;
  }
</style>
