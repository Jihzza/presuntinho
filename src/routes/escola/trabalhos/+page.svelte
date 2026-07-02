<script lang="ts">
  import { goto } from '$app/navigation';

  function openTrabalhos(): void {
    void goto('/trabalhos/');
  }
</script>

<svelte:head>
  <title>Trabalhos · Escola · Presuntinho</title>
</svelte:head>

<div class="school-work">
  <a class="back" href="/escola/">← Escola</a>
  <section class="hero">
    <span>📝 Área da Escola</span>
    <h1>Trabalhos</h1>
    <p>Assignments, entregas, drafts e próximos passos ficam dentro da Escola. A área completa ainda usa o motor robusto de trabalhos existente.</p>
    <button type="button" onclick={openTrabalhos}>Abrir trabalhos →</button>
  </section>

  <div class="cards" aria-label="Contexto dos trabalhos">
    <article>
      <strong>Curso</strong>
      <p>Os trabalhos devem ficar ligados ao curso e à cadeira certa.</p>
    </article>
    <article>
      <strong>Estado</strong>
      <p>Por começar, em curso, entregue ou avaliado.</p>
    </article>
    <article>
      <strong>Próximo passo</strong>
      <p>A Home deve mostrar o que precisa de atenção.</p>
    </article>
  </div>
</div>

<style>
  .school-work {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .back {
    display: inline-flex;
    margin-bottom: 0.85rem;
    color: #bfdbfe;
    text-decoration: none;
    font-weight: 800;
  }
  .hero {
    padding: 1.25rem;
    border-radius: 1.25rem;
    color: #fff;
    background: radial-gradient(circle at top left, rgba(245, 158, 11, 0.3), transparent 38%), rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.11);
  }
  .hero span {
    color: #fde68a;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .hero h1 { margin: 0.35rem 0; font-size: clamp(2rem, 7vw, 3rem); line-height: 1; }
  .hero p,
  .cards p { color: #cbd5e1; line-height: 1.5; margin: 0; }
  button {
    margin-top: 1rem;
    min-height: 44px;
    border: 0;
    border-radius: 999px;
    padding: 0.75rem 1rem;
    background: #f59e0b;
    color: #111827;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  .cards {
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
  }
  article {
    padding: 1rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.09);
    color: #fff;
  }
  article strong { display: block; margin-bottom: 0.3rem; }
  @media (min-width: 700px) {
    .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
