<script lang="ts">
  interface Subject {
    slug: string;
    title: string;
    icon: string;
    summary: string;
    lessons: number;
    quizzes: number;
  }

  const SUBJECTS: Subject[] = [
    { slug: 'marketing-digital', title: 'Marketing Digital', icon: '📱', summary: 'SEO, SEM, redes sociais, paid media, funis e ROI.', lessons: 4, quizzes: 2 },
    { slug: 'gestao-financeira', title: 'Gestão Financeira', icon: '💰', summary: 'Demonstrações financeiras, rácios, orçamento e caixa.', lessons: 8, quizzes: 2 },
    { slug: 'contabilidade', title: 'Contabilidade', icon: '📊', summary: 'Partida dobrada, diário, amortizações, IVA e fecho.', lessons: 8, quizzes: 2 },
    { slug: 'microeconomia', title: 'Microeconomia', icon: '📉', summary: 'Oferta, procura, elasticidade e estruturas de mercado.', lessons: 8, quizzes: 2 },
    { slug: 'comportamento-organizacional', title: 'Comportamento Organizacional', icon: '🧠', summary: 'Motivação, equipas, cultura, liderança e conflitos.', lessons: 4, quizzes: 1 },
    { slug: 'marketing-internacional', title: 'Marketing Internacional', icon: '🌍', summary: 'STP global, 4Ps internacionais e modos de entrada.', lessons: 4, quizzes: 1 }
  ];
</script>

<svelte:head>
  <title>Business Administration · Presuntinho</title>
</svelte:head>

<div class="course-page">
  <a class="back" href="/escola/">← Escola</a>
  <header class="hero">
    <span>🎓 Curso universitário</span>
    <h1>Business Administration</h1>
    <p>Primeiro escolhes a cadeira. Dentro de cada cadeira abres as aulas, teoria, quizzes e testes.</p>
  </header>

  <section aria-label="Cadeiras de Business Administration">
    <div class="section-head">
      <h2>Cadeiras</h2>
      <p>{SUBJECTS.length} áreas organizadas</p>
    </div>
    <div class="grid">
      {#each SUBJECTS as subject (subject.slug)}
        <a class="card" href={`/escola/curso/${subject.slug}/`}>
          <span class="icon">{subject.icon}</span>
          <div>
            <h3>{subject.title}</h3>
            <p>{subject.summary}</p>
            <small>{subject.lessons} aulas · {subject.quizzes} quizzes · abrir cadeira →</small>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="extra" aria-label="Aulas personalizadas de Business Administration">
    <div class="section-head">
      <h2>Extras de Business</h2>
      <p>Conteúdo criado para trabalhos reais, não cursos principais.</p>
    </div>
    <a class="card equivalenza" href="/escola/curso/equivalenza/">
      <span class="icon">🌸</span>
      <div>
        <h3>Equivalenza — case personalizado</h3>
        <p>Aula/case ligado ao trabalho da Fatma: SWOT, persona, SCQA, TOWS e recomendação.</p>
        <small>Abrir extra →</small>
      </div>
    </a>
  </section>
</div>

<style>
  .course-page {
    max-width: 980px;
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
    margin-bottom: 1.3rem;
    border-radius: 1.25rem;
    color: #fff;
    background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.3), transparent 38%), rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.11);
  }
  .hero span {
    color: #bfdbfe;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .hero h1 { margin: 0.35rem 0; color: #fff; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .hero p,
  .section-head p,
  .card p { color: #cbd5e1; margin: 0; line-height: 1.5; }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.25rem 0 0.85rem;
  }
  .section-head h2 { margin: 0; color: #fff; font-size: 1.05rem; }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.85rem;
  }
  .card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.85rem;
    padding: 1rem;
    color: #fff;
    text-decoration: none;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  }
  .card:hover,
  .card:focus-visible {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.085);
    border-color: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .icon { font-size: 1.6rem; }
  .card h3 { margin: 0 0 0.25rem; color: #fff; font-size: 1rem; }
  .card small { display: inline-block; margin-top: 0.55rem; color: #94a3b8; }
  .equivalenza { border-left: 4px solid #ec4899; }
  @media (min-width: 760px) {
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
