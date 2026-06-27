<script lang="ts">
  // Escola hub — list of available courses. Phase 4 ships with one course
  // (Equivalenza); the registry below is the source of truth for the cards
  // shown here. New courses = add an entry to COURSES + create the lesson
  // JSONs under static/lessons/<slug>/.

  import { t } from 'svelte-i18n';

  interface Course {
    slug: string;
    title: string;
    tagline: string;
    description: string;
    icon: string;
    color: string;
    lessonCount: number;
    quizCount: number;
    badge?: string;
  }

  const COURSES: Course[] = [
    {
      slug: 'equivalenza',
      title: 'Equivalenza — The Scent of a Second Chance',
      tagline: 'BCOBM311 Mid-Term · Case study completo',
      description:
        'Deep dive na marca espanhola de fragrâncias affordable: SWOT, Buyer Persona, Marketing Problem (SCQA), TOWS e Recomendação Estratégica. Cinco lições + quatro quizzes.',
      icon: '🌸',
      color: '#ec4899',
      lessonCount: 5,
      quizCount: 4,
      badge: 'Atual'
    },
    {
      slug: 'portugues',
      title: 'Português de Portugal 🇵🇹',
      tagline: 'Mini-curso desenhado para Tunisianos',
      description:
        'Aprende Português de Portugal com comparações ao Árabe Tunisiano + Francês + Inglês. Vogais, vocabulário, diálogos, verbos essenciais e quiz rápido.',
      icon: '🇵🇹',
      color: '#10b981',
      lessonCount: 1,
      quizCount: 1,
      badge: 'Novo'
    }
  ];
</script>

<svelte:head>
  <title>Escola · Cursos e Quizzes · Presuntinho</title>
  <meta name="description" content="Cursos, lições e quizzes da Fatma" />
  <meta property="og:title" content="Escola · Cursos e Quizzes" />
  <meta property="og:description" content="Cursos, lições e quizzes da Fatma" />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/" />
  <meta name="twitter:title" content="Escola · Cursos e Quizzes" />
  <meta name="twitter:description" content="Cursos, lições e quizzes da Fatma" />
</svelte:head>

<div class="escola">
  <header class="hero">
    <span class="hero-tag">{$t('escola.hero.tag', { default: '🎓 Escola' })}</span>
    <h1>{$t('escola.hero.title', { default: 'Cursos, lições e quizzes' })}</h1>
    <p class="sub">
      {$t('escola.hero.sub', { default: 'Aprende ao teu ritmo. Marca progresso. Faz quizzes para validar o que sabes.' })}
    </p>
  </header>

  <section class="courses" aria-label={$t('escola.section.courses.aria', { default: 'Cursos disponíveis' })}>
    <h2 class="section-title">{$t('escola.section.courses', { default: 'Cursos disponíveis' })}</h2>

    <div class="grid">
      {#each COURSES as course (course.slug)}
        <a
          class="card"
          href={`/escola/curso/${course.slug}/`}
          style="--course-color: {course.color};"
        >
          <div class="card-head">
            <span class="card-icon" aria-hidden="true">{course.icon}</span>
            {#if course.badge}
              <span class="badge">{course.badge}</span>
            {/if}
          </div>
          <h3>{course.title}</h3>
          <p class="tagline">{course.tagline}</p>
          <p class="desc">{course.description}</p>
          <div class="meta">
            <span>{$t('escola.card.lessons', { default: '📚 {n} lições' }).replace('{n}', String(course.lessonCount))}</span>
            <span>{$t('escola.card.quizzes', { default: '📝 {n} quizzes' }).replace('{n}', String(course.quizCount))}</span>
            <span class="open">{$t('escola.card.open', { default: 'Abrir curso →' })}</span>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="sections" aria-label={$t('escola.section.tools.aria', { default: 'Secções da escola' })}>
    <h2 class="section-title">{$t('escola.section.tools', { default: 'Ferramentas' })}</h2>
    <div class="grid sections-grid">
      <a class="section-card" href="/trabalhos/" style="--sc: #f59e0b;">
        <span class="sc-icon" aria-hidden="true">📝</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.trabalhos', { default: 'Trabalhos' })}</h3>
          <p>{$t('escola.tool.trabalhos.desc', { default: 'SWOT, Buyer Persona, TOWS, assignments da escola.' })}</p>
        </div>
      </a>
      <a class="section-card" href="/biblioteca/" style="--sc: #8b5cf6;">
        <span class="sc-icon" aria-hidden="true">📚</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.biblioteca', { default: 'Biblioteca' })}</h3>
          <p>{$t('escola.tool.biblioteca.desc', { default: 'Materiais, downloads e recursos para estudar.' })}</p>
        </div>
      </a>
      <a class="section-card" href="/escola/caderno/" style="--sc: #10b981;">
        <span class="sc-icon" aria-hidden="true">📓</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.caderno', { default: 'Meu Caderno' })}</h3>
          <p>{$t('escola.tool.caderno.desc', { default: 'As tuas notas, áudios, textos e imagens.' })}</p>
        </div>
      </a>
    </div>
  </section>
</div>

<style>
  .escola {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .hero { text-align: center; margin-bottom: 2rem; }
  .hero-tag {
    display: inline-block;
    padding: 0.2rem 0.7rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
    color: #fff;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .card {
    display: block;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--course-color, #ec4899);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .card:hover, .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .card-icon { font-size: 1.75rem; }
  .badge {
    padding: 0.1rem 0.55rem;
    background: rgba(236, 72, 153, 0.2);
    border: 1px solid rgba(236, 72, 153, 0.4);
    color: #fbcfe8;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .card h3 {
    margin: 0 0 0.25rem;
    color: #fff;
    font-size: 1.15rem;
  }
  .tagline {
    color: var(--course-color, #ec4899);
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .desc {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .open {
    margin-left: auto;
    color: var(--course-color, #ec4899);
    font-weight: 600;
  }
  .sections { margin-top: 2rem; }
  .sections-grid {
    grid-template-columns: 1fr;
  }
  .section-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--sc, #ec4899);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .section-card:hover, .section-card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }
  .sc-icon { font-size: 1.75rem; line-height: 1; flex-shrink: 0; }
  .sc-body h3 { margin: 0 0 0.15rem; font-size: 1rem; color: #fff; }
  .sc-body p { margin: 0; font-size: 0.85rem; color: var(--txt2, #cbd5e1); line-height: 1.4; }
  @media (min-width: 600px) {
    .sections-grid { grid-template-columns: 1fr 1fr; }
  }
</style>