<script lang="ts">
  // Write — Writing Tips & Anti-AI Detection (V4 port of V3 #pg-write).
  // 5 tip cards in pt-PT (V3 lines 333-390).

  import { t } from 'svelte-i18n';

  interface Tip {
    icon: string;
    title: string;
    problem?: string;
    fixLabel?: string;
    points: string[];
  }

  const TIPS: Tip[] = [
    {
      icon: '✍️',
      title: 'Variação de frases',
      problem:
        'O problema: texto de IA tende a ter comprimento uniforme de frase e transições previsíveis ("Moreover,", "Furthermore,", "Additionally,").',
      fixLabel: 'A solução:',
      points: [
        'Alterna comprimentos: frases curtas e diretas. Depois mais longas com subordinação. Depois médias.',
        'Começa de formas diferentes: às vezes com "eu", às vezes com uma pergunta, às vezes com uma cláusula.',
        'Evita empilhar 3+ "Moreover-Furthermore-Additionally" no mesmo parágrafo.'
      ]
    },
    {
      icon: '🗣️',
      title: 'Voz pessoal',
      points: [
        'Usa contrações: não, é, estou, vamos',
        'Tens opiniões: "parece-me marcante", "o que me chamou a atenção foi..."',
        'Acrescenta a tua leitura: "isto sugere..." ou "a implicação parece ser..."',
        'Usa a primeira pessoa quando faz sentido: "eu recomendaria..."'
      ]
    },
    {
      icon: '🚫',
      title: 'Buzzwords a evitar',
      problem: 'A IA adora estes. Os humanos usam-nos com parcimónia:',
      points: [
        '"delve into", "tapestry", "vibrant", "robust", "leverage" (usa "usar")',
        '"em conclusão", "em resumo", "para resumir"',
        '"É importante notar que..."',
        '"navegar pelas complexidades", "no mundo acelerado de hoje"'
      ]
    },
    {
      icon: '💎',
      title: 'Exemplos específicos',
      problem: 'Substitui generalidades por detalhes concretos do caso:',
      points: [
        '❌ "A marca perdeu quota de mercado."',
        '✅ "As vendas a retalho em Espanha caíram de €22M para €14M entre 2018 e 2023."',
        '❌ "A satisfação do cliente é baixa."',
        '✅ "Um NPS de 17 coloca a Equivalenza bem abaixo da Druni (56) e da Primor (46)."'
      ]
    },
    {
      icon: '🤔',
      title: 'Hedging (precaução)',
      problem: 'Incerteza estratégica torna o texto mais humano:',
      points: [
        '"Parece que..."',
        '"Isto pode sugerir..."',
        '"Pode-se argumentar que..."',
        '"Talvez o fator mais importante seja..."'
      ]
    }
  ];
</script>

<svelte:head>
  <title>{$t('write.head.title', { default: 'Writing · Tips Anti-AI' })} · Presuntinho</title>
</svelte:head>

<div class="write">
  <header class="write-head">
    <p class="breadcrumb">
      <a href="/">{$t('write.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('write.breadcrumb.current', { default: 'Writing' })}</span>
    </p>
    <span class="tag">{$t('routes.write.modulo_tag', { default: 'Módulo 5' })}</span>
    <h1>✍️ Writing Tips & Anti-AI Detection</h1>
    <p class="sub">{$t('routes.write.subtitle', { default: 'Como escrever Q3-Q5 que soem a ti, não a um bot.' })}</p>
  </header>

  <section class="grid" aria-label="{$t('a11y.aria.tips_de_escrita', { default: 'Tips de escrita' })}">
    {#each TIPS as tip (tip.title)}
      <article class="tip-card">
        <h2><span class="icon" aria-hidden="true">{tip.icon}</span> {tip.title}</h2>
        {#if tip.problem}
          <p class="problem">{tip.problem}</p>
        {/if}
        {#if tip.fixLabel}
          <p class="fix-label"><strong>{tip.fixLabel}</strong></p>
        {/if}
        <ul>
          {#each tip.points as p (p)}
            <li>{p}</li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>

  <div class="cta">
    <a href="/pt/" class="btn primary">Seguinte: Lições em PT →</a>
  </div>
</div>

<style>
  .write {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .write-head { margin-bottom: 1.5rem; }
  .write-head h1 {
    color: #fff;
    margin: 0.25rem 0 0.5rem;
    font-size: 2rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.5);
    color: #a7f3d0;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .tip-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--accent, #10b981);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .tip-card h2 {
    color: #fff;
    font-size: 1.15rem;
    margin: 0 0 0.5rem;
  }
  .icon { margin-right: 0.25rem; }
  .problem {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0;
    font-size: 0.92rem;
    line-height: 1.55;
  }
  .fix-label {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0.25rem;
  }
  .tip-card ul {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0 1.25rem;
    padding: 0;
  }
  .tip-card ul li {
    margin: 0.3rem 0;
    line-height: 1.5;
    font-size: 0.92rem;
  }

  .cta { text-align: center; margin-top: 1.5rem; }
  .btn {
    display: inline-block;
    padding: 0.65rem 1.4rem;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    transition: background 0.15s;
  }
  .btn.primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn.primary:hover { background: #d63780; }
</style>
