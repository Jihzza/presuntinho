<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="app">
  {@render children?.()}
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
  }
</style>
