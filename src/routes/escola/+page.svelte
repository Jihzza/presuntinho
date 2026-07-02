<script lang="ts">
  import { t } from 'svelte-i18n';

  interface Subject {
    slug: string;
    title: string;
    icon: string;
    summary: string;
    lessons: number;
    quizzes: number;
  }

  const BUSINESS_SUBJECTS: Subject[] = [
    { slug: 'marketing-digital', title: 'Marketing Digital', icon: '📱', summary: 'SEO, SEM, redes sociais, paid media, funis e ROI.', lessons: 4, quizzes: 2 },
    { slug: 'gestao-financeira', title: 'Gestão Financeira', icon: '💰', summary: 'Demonstrações financeiras, rácios, orçamento e caixa.', lessons: 8, quizzes: 2 },
    { slug: 'contabilidade', title: 'Contabilidade', icon: '📊', summary: 'Partida dobrada, diário, amortizações, IVA e fecho.', lessons: 8, quizzes: 2 },
    { slug: 'microeconomia', title: 'Microeconomia', icon: '📉', summary: 'Oferta, procura, elasticidade e estruturas de mercado.', lessons: 8, quizzes: 2 },
    { slug: 'comportamento-organizacional', title: 'Comportamento Organizacional', icon: '🧠', summary: 'Motivação, equipas, cultura, liderança e conflitos.', lessons: 4, quizzes: 1 },
    { slug: 'marketing-internacional', title: 'Marketing Internacional', icon: '🌍', summary: 'STP global, 4Ps internacionais e modos de entrada.', lessons: 4, quizzes: 1 }
  ];
</script>

<svelte:head>
  <title>{$t('routes.escola.title', { default: 'Escola · Cursos' })} · Presuntinho</title>
  <meta name="description" content="Cursos, cadeiras, aulas, trabalhos e materiais da Fatma" />
</svelte:head>

<div class="escola">
  <header class="hero">
    <span class="hero-tag">🎓 Escola</span>
    <h1>Escola da Fatma</h1>
    <p class="sub">Primeiro escolhes o curso. Dentro do curso vês as cadeiras. Dentro da cadeira vês aulas, teoria, quizzes e testes.</p>
  </header>

  <section class="main-courses" aria-label="Cursos principais">
    <h2 class="section-title">Cursos principais</h2>
    <div class="course-grid">
      <a class="course-card business" href="/escola/curso/business-administration/">
        <span class="course-icon">🎓</span>
        <div>
          <p class="kicker">Curso universitário</p>
          <h3>Business Administration</h3>
          <p>Cadeiras de gestão, marketing, finanças, economia, operações e estratégia.</p>
          <strong>{BUSINESS_SUBJECTS.length} cadeiras organizadas →</strong>
        </div>
      </a>
      <a class="course-card portuguese" href="/escola/curso/portugues/">
        <span class="course-icon">🇵🇹</span>
        <div>
          <p class="kicker">Curso independente</p>
          <h3>Português de Portugal</h3>
          <p>Português para a Fatma aprender como língua separada, sem misturar com Business.</p>
          <strong>Abrir curso →</strong>
        </div>
      </a>
    </div>
  </section>

  <section id="business-administration" class="business-section" aria-label="Business Administration">
    <div class="section-head">
      <div>
        <h2>Business Administration</h2>
        <p>Cadeiras do curso — cada uma abre a sua área de aulas, teoria e quizzes.</p>
      </div>
      <span>{BUSINESS_SUBJECTS.length} cadeiras</span>
    </div>
    <div class="subject-grid">
      {#each BUSINESS_SUBJECTS as subject (subject.slug)}
        <a class="subject-card" href={`/escola/curso/${subject.slug}/`}>
          <span class="subject-icon">{subject.icon}</span>
          <div>
            <h3>{subject.title}</h3>
            <p>{subject.summary}</p>
            <small>{subject.lessons} aulas · {subject.quizzes} quizzes</small>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="extras-section" aria-label="Extras e trabalhos da escola">
    <div class="section-head">
      <div>
        <h2>Extras, trabalhos e materiais</h2>
        <p>Isto não são cursos principais. São áreas de apoio à escola.</p>
      </div>
    </div>
    <div class="tool-grid">
      <a class="tool-card" href="/escola/curso/equivalenza/" style="--accent: #ec4899;">
        <span>🌸</span>
        <div>
          <h3>Equivalenza</h3>
          <p>Aula/case personalizado dentro de Business Administration, ligado ao trabalho que fizemos.</p>
        </div>
      </a>
      <a class="tool-card" href="/trabalhos/" style="--accent: #f59e0b;">
        <span>📝</span>
        <div>
          <h3>Trabalhos</h3>
          <p>Assignments, entregas, drafts e próximos passos.</p>
        </div>
      </a>
      <a class="tool-card" href="/biblioteca/" style="--accent: #8b5cf6;">
        <span>📚</span>
        <div>
          <h3>Biblioteca</h3>
          <p>Materiais, ficheiros, PDFs e recursos para estudar.</p>
        </div>
      </a>
      <a class="tool-card" href="/escola/caderno/" style="--accent: #10b981;">
        <span>📓</span>
        <div>
          <h3>Caderno</h3>
          <p>Notas, resumos e apontamentos da Fatma.</p>
        </div>
      </a>
    </div>
  </section>
</div>

<style>
  .escola {
    max-width: 1040px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .hero {
    text-align: left;
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    border-radius: 1.25rem;
    color: #fff;
    background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 38%), rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.11);
  }
  .hero-tag,
  .kicker {
    display: inline-block;
    color: #bfdbfe;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .hero h1 { margin: 0.35rem 0; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .sub,
  .section-head p,
  .course-card p,
  .subject-card p,
  .tool-card p { color: #cbd5e1; line-height: 1.5; margin: 0; }
  section { margin-top: 1.4rem; }
  .section-title,
  .section-head h2 { color: #fff; margin: 0 0 0.75rem; }
  .section-title { font-size: 1rem; }
  .section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }
  .section-head h2 { margin-bottom: 0.2rem; }
  .section-head span {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    color: #bfdbfe;
    background: rgba(59, 130, 246, 0.16);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 800;
  }
  .course-grid,
  .subject-grid,
  .tool-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
  }
  .course-card,
  .subject-card,
  .tool-card {
    color: #fff;
    text-decoration: none;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  }
  .course-card:hover,
  .course-card:focus-visible,
  .subject-card:hover,
  .subject-card:focus-visible,
  .tool-card:hover,
  .tool-card:focus-visible {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.085);
    border-color: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .course-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    padding: 1.2rem;
    min-height: 172px;
  }
  .course-card.business { background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(236,72,153,0.11)); }
  .course-card.portuguese { background: linear-gradient(135deg, rgba(16,185,129,0.17), rgba(59,130,246,0.09)); }
  .course-icon { font-size: 2.1rem; }
  .course-card h3 { margin: 0.2rem 0 0.35rem; font-size: 1.3rem; }
  .course-card strong { display: inline-block; margin-top: 0.75rem; color: #bfdbfe; }
  .subject-card,
  .tool-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.85rem;
    align-items: start;
    padding: 1rem;
  }
  .subject-icon,
  .tool-card > span { font-size: 1.55rem; }
  .subject-card h3,
  .tool-card h3 { margin: 0 0 0.25rem; font-size: 1rem; }
  .subject-card small { display: inline-block; margin-top: 0.55rem; color: #94a3b8; }
  .tool-card { border-left: 4px solid var(--accent, #8b5cf6); }
  @media (min-width: 720px) {
    .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .subject-grid,
    .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 1080px) {
    .subject-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
