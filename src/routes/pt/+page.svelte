<script lang="ts">
  // PT — Aulas em PT (V4 port of V3 #pg-pt).
  // 4 framework sections (pt-PT) + mini-curso de Português (vogais,
  // 50 palavras, mini-diálogos, 5 verbos, quiz rápido).

  import { t } from 'svelte-i18n';

  // 4 frameworks in pt-PT
  interface FwSection {
    icon: string;
    title: string;
    desc: string;
    items: Array<{ letter: string; label: string; desc: string }>;
    example?: string;
  }

  const FRAMEWORKS: FwSection[] = [
    {
      icon: '📚',
      title: 'O que é um SWOT?',
      desc: 'A análise SWOT é uma ferramenta de diagnóstico estratégico. Divide em 4 quadrantes:',
      items: [
        { letter: 'S', label: 'Strengths (Forças)', desc: 'o que a empresa faz BEM internamente' },
        { letter: 'W', label: 'Weaknesses (Fraquezas)', desc: 'o que faz MAL internamente' },
        { letter: 'O', label: 'Opportunities (Oportunidades)', desc: 'tendências externas POSITIVAS' },
        { letter: 'T', label: 'Threats (Ameaças)', desc: 'tendências externas NEGATIVAS' }
      ],
      example:
        'Exemplo Equivalenza: Forças = 528 lojas; Fraquezas = NPS 17; Oportunidades = crescimento Gen Z; Ameaças = colapso do segmento dupe.'
    },
    {
      icon: '🎯',
      title: 'O que é TOWS?',
      desc: 'TOWS é a evolução do SWOT — cruza os quadrantes para gerar 4 TIPOS de estratégia:',
      items: [
        { letter: 'SO', label: 'Ofensiva', desc: 'usa Forças para Aproveitar Oportunidades → crescimento' },
        { letter: 'WO', label: 'Corretiva', desc: 'ultrapassa Fraquezas para Aproveitar Oportunidades → melhoria' },
        { letter: 'ST', label: 'Defensiva-Ofensiva', desc: 'usa Forças para Neutralizar Ameaças → proteção' },
        { letter: 'WT', label: 'Defensiva', desc: 'minimiza Fraquezas e evita Ameaças → contenção' }
      ]
    },
    {
      icon: '❓',
      title: 'O que é SCQA?',
      desc: 'Framework para enquadrar um problema de marketing de forma lógica:',
      items: [
        { letter: 'S', label: 'Situation (Situação)', desc: 'o contexto estável atual' },
        { letter: 'C', label: 'Complication (Complicação)', desc: 'o que mudou, a tensão' },
        { letter: 'Q', label: 'Question (Questão)', desc: 'a pergunta estratégica' },
        { letter: 'A', label: 'Answer (Resposta)', desc: 'a formulação do problema' }
      ]
    },
    {
      icon: '👤',
      title: 'O que é uma Buyer Persona?',
      desc:
        'Uma personagem semi-ficcional baseada em investigação real que representa o teu cliente ideal. Três camadas:',
      items: [
        { letter: '1', label: 'Demografia', desc: 'idade, localização, rendimento, educação' },
        { letter: '2', label: 'Psicografia', desc: 'valores, atitudes, estilo de vida, identidade' },
        { letter: '3', label: 'Comportamental', desc: 'como descobre, avalia, compra, mantém lealdade' }
      ]
    }
  ];

  // 5 vogais + IPA + mnemonic
  interface Vogal {
    vogal: string;
    ipa: string;
    dica: string;
  }
  const VOGAIS: Vogal[] = [
    { vogal: 'A', ipa: '/a/',  dica: 'Como em <em>pá</em> (não como em <em>café</em>)' },
    { vogal: 'E', ipa: '/e/ ou /ɨ/', dica: '<em>É</em> fechado se terminar em -e: <em>café</em>. Aberto se dentro: <em>casa</em>' },
    { vogal: 'I', ipa: '/i/',  dica: 'Como em <em>sim</em>' },
    { vogal: 'O', ipa: '/o/ ou /u/', dica: '<em>Ó</em> fechado no fim: <em>pôr</em>. <em>Ó</em> aberto dentro: <em>bola</em>' },
    { vogal: 'U', ipa: '/u/',  dica: 'Como em <em>luna</em>' }
  ];

  // Primeiras 50 palavras — categorias. Cada categoria tem um array de items
  // com forma uniforme ({ pt, extra?, ar? }). Cumprimentos tem tradução
  // tripla (PT/EN/AR); as outras são apenas listas de PT com tradução inline.
  interface WordItem {
    pt: string;
    en?: string;
    ar?: string;
  }

  const WORDS: Record<string, WordItem[]> = {
    'Cumprimentos': [
      { pt: 'Olá',           en: 'Hello',          ar: 'ahlan' },
      { pt: 'Bom dia',       en: 'Good morning',   ar: 'sbe7 el khir' },
      { pt: 'Boa tarde',     en: 'Good afternoon', ar: 'masa el khir' },
      { pt: 'Boa noite',     en: 'Good night',     ar: 'tesba7 3la khir' },
      { pt: 'Tchau / Adeus', en: 'Bye',            ar: 'besslema' },
      { pt: 'Por favor',     en: 'Please',         ar: 'min fadlek' },
      { pt: 'Obrigado/a',    en: 'Thanks',         ar: '3aychek' }
    ],
    'Números 1-10': [
      { pt: '1 um · 2 dois · 3 três · 4 quatro · 5 cinco' },
      { pt: '6 seis · 7 sete · 8 oito · 9 nove · 10 dez' }
    ],
    'Família': [
      { pt: 'mãe (mother)' },
      { pt: 'pai (father)' },
      { pt: 'irmão/irmã (sibling)' },
      { pt: 'filho/filha (son/daughter)' },
      { pt: 'avô/avó (grandparent)' },
      { pt: 'amigo/amiga (friend)' }
    ],
    'Cores': [
      { pt: 'vermelho (red) · azul (blue) · verde (green) · amarelo (yellow)' },
      { pt: 'preto (black) · branco (white) · rosa (pink) · dourado (gold)' }
    ],
    'Comida': [
      { pt: 'água (water) · pão (bread) · café (coffee) · vinho (wine)' },
      { pt: 'queijo (cheese) · peixe (fish) · carne (meat) · fruta (fruit)' }
    ],
    'Negócio': [
      { pt: 'empresa (company) · cliente (client) · mercado (market) · marca (brand)' },
      { pt: 'estratégia (strategy) · preço (price) · loja (store) · venda (sale) · lucro (profit) · crescimento (growth)' }
    ],
    'Frases úteis': [
      { pt: 'Como se diz…? — How do you say…?' },
      { pt: 'Não percebo — I don\'t understand' },
      { pt: 'Pode repetir? — Can you repeat?' },
      { pt: 'Quanto custa? — How much is it?' },
      { pt: 'Onde fica…? — Where is…?' }
    ]
  };

  // Mini-diálogos
  const DIALOGOS = [
    {
      title: '1. A conhecer um colega',
      lines: [
        '<b>A:</b> Olá! Eu sou a Fatma. E tu?',
        '<b>B:</b> Olá Fatma! Eu sou o Lucas. Muito prazer.',
        '<b>A:</b> De onde és?',
        '<b>B:</b> Sou do Brasil. E tu?',
        '<b>A:</b> Sou da Tunísia.',
        '<b>B:</b> Que legal! Bem-vinda à EU Business School.'
      ],
      en: 'Hi! I\'m Fatma. And you? / Hi Fatma! I\'m Lucas. Nice to meet you. / Where are you from? / I\'m from Brazil. And you? / I\'m from Tunisia. / Cool! Welcome to EU Business School.'
    },
    {
      title: '2. A pedir um café',
      lines: [
        '<b>A:</b> Bom dia! Um café, por favor.',
        '<b>B:</b> Curto ou longo?',
        '<b>A:</b> Curto, por favor. Quanto custa?',
        '<b>B:</b> Um euro.',
        '<b>A:</b> Aqui tem. Obrigada!'
      ]
    },
    {
      title: '3. A pedir indicações',
      lines: [
        '<b>A:</b> Com licença, onde fica a biblioteca?',
        '<b>B:</b> Vai em frente, depois vira à direita. É o segundo edifício.',
        '<b>A:</b> Muito obrigada!'
      ]
    }
  ];

  // 5 verbos essenciais (presente)
  const VERBOS = [
    {
      verbo: 'ser (to be, permanent)',
      conj: { eu: 'sou',    tu: 'és',     ele: 'é',     nos: 'somos',  eles: 'são' }
    },
    {
      verbo: 'estar (to be, temporary)',
      conj: { eu: 'estou',  tu: 'estás',  ele: 'está',  nos: 'estamos', eles: 'estão' }
    },
    {
      verbo: 'ter (to have)',
      conj: { eu: 'tenho',  tu: 'tens',   ele: 'tem',   nos: 'temos',  eles: 'têm' }
    },
    {
      verbo: 'ir (to go)',
      conj: { eu: 'vou',    tu: 'vais',   ele: 'vai',   nos: 'vamos',  eles: 'vão' }
    },
    {
      verbo: 'fazer (to do/make)',
      conj: { eu: 'faço',   tu: 'fazes',  ele: 'faz',   nos: 'fazemos', eles: 'fazem' }
    }
  ];
</script>

<svelte:head>
  <title>PT 🇵🇹 · {$t('routes.pt.title', { default: 'Aulas em Português' })} · Presuntinho</title>
</svelte:head>

<div class="pt">
  <header class="pt-head">
    <p class="breadcrumb">
      <a href="/">{$t('pt.breadcrumb.hub', { default: 'Hub' })}</a>
      <span class="sep">›</span>
      <span>PT</span>
    </p>
    <span class="tag">{$t('routes.pt.tag', { default: '🇵🇹 Lições em Português' })}</span>
    <h1>{$t('routes.pt.hero.title', { default: '🇵🇹 Aulas de Marketing — em PT' })}</h1>
    <p class="sub">{$t('routes.pt.subtitle_para_estudares', { default: 'Para estudares na tua língua materna.' })}</p>
  </header>

  <!-- 4 Frameworks pt-PT -------------------------------------------------- -->
  <section class="frameworks" aria-label="{$t('a11y.aria.frameworks_em_portugues', { default: 'Frameworks em português' })}">
    {#each FRAMEWORKS as fw (fw.title)}
      <article class="card">
        <h2>{fw.icon} {fw.title}</h2>
        <p class="fw-desc">{fw.desc}</p>
        <ul>
          {#each fw.items as item (item.letter)}
            <li>
              <strong>{item.letter} — {item.label}:</strong> {item.desc}
            </li>
          {/each}
        </ul>
        {#if fw.example}
          <p class="example"><em>{fw.example}</em></p>
        {/if}
      </article>
    {/each}
  </section>

  <!-- Dica final --------------------------------------------------------- -->
  <article class="card highlight">
    <h2>{$t('routes.pt.dica_final.title', { default: '💡 Dica final para escrever' })}</h2>
    <p>{$t('routes.pt.dica_final.lembrar', { default: 'Quando reescreveres o assignment na tua voz, lembra-te:' })}</p>
    <ul>
      <li>{$t('routes.pt.dica_final.contracoes', { default: 'Usa contrações: não, é, estou, vamos' })}</li>
      <li>{$t('routes.pt.dica_final.opinioes', { default: 'Opiniões pessoais: "eu recomendaria", "na minha leitura"' })}</li>
      <li>{$t('routes.pt.dica_final.hedging', { default: 'Hedging: "parece-me", "sugere que", "talvez"' })}</li>
      <li>{$t('routes.pt.dica_final.exemplos', { default: 'Exemplos específicos do caso (não generalidades)' })}</li>
      <li>{$t('routes.pt.dica_final.variar', { default: 'Varia o comprimento das frases' })}</li>
    </ul>
  </article>

  <!-- Mini-curso -------------------------------------------------------- -->
  <article class="card">
    <h2>{$t('routes.pt.mini.title', { default: '🇵🇹 Mini-Curso de Português (side quest!)' })}</h2>
    <p class="mini-intro">
      {$t('routes.pt.mini.intro', { default: 'Já que falas Tunisino + Inglês + Francês, e o Português está próximo do Francês, esta secção é um bónus. Não é matéria do trabalho — é um extra para te ajudar a comunicar com colegas brasileiros e portugueses na EU Business School.' })}
    </p>
  </article>

  <article class="card">
    <h2>{$t('routes.pt.vogais.title', { default: '🗣️ As 5 vogais + pronúncia essencial' })}</h2>
    <p class="mini-intro">{$t('routes.pt.vogais.intro', { default: 'O Português tem 5 vogais orais (mais nasais, mas vamos com o básico):' })}</p>
    <table class="vogais">
      <thead>
        <tr>
          <th>{$t('routes.pt.th.vogal', { default: 'Vogal' })}</th>
          <th>{$t('routes.pt.th.som_ipa', { default: 'Som (IPA)' })}</th>
          <th>{$t('routes.pt.th.truque_mnemonico', { default: 'Truque mnemónico' })}</th>
        </tr>
      </thead>
      <tbody>
        {#each VOGAIS as v (v.vogal)}
          <tr>
            <td><b>{v.vogal}</b></td>
            <td>{v.ipa}</td>
            <td>{@html v.dica}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="tunisian-note">
      <b>{$t('routes.pt.tunisian_note.label', { default: 'Para ti (Tunisian):' })}</b>
      {$t('routes.pt.tunisian_note.text_before_rr', { default: 'o Português é mais fonético que o Inglês. O' })}
      <b>rr</b>
      {$t('routes.pt.tunisian_note.text_after_rr', { default: 'é como um roncar (tremido); o' })}
      <b>lh</b>
      {$t('routes.pt.tunisian_note.text_after_lh', { default: 'é como' })}
      <em>million</em>; o <b>nh</b> {$t('routes.pt.tunisian_note.text_after_nh', { default: 'é como' })}
      <em>onion</em>. {$t('routes.pt.tunisian_note.text_end', { default: 'Tudo se lê.' })}
    </p>
  </article>

  <article class="card">
    <h2>{$t('routes.pt.words.title', { default: '📖 Primeiras 50 palavras — com tradução Tunisiana' })}</h2>
    <p class="mini-intro">{$t('routes.pt.mini_intro.em_7_categorias', { default: 'Em 7 categorias:' })}</p>
    {#each Object.entries(WORDS) as [cat, list] (cat)}
      <details class="cat" open={cat === 'Cumprimentos'}>
        <summary>{cat}</summary>
        {#if cat === 'Cumprimentos'}
          <table class="words">
            <tbody>
              {#each list as w (w.pt)}
                <tr>
                  <td><b>{w.pt}</b></td>
                  <td>{w.en ?? ''}</td>
                  <td dir="rtl">{w.ar ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          {#each list as w (w.pt)}
            <p class="word-line">{w.pt}</p>
          {/each}
        {/if}
      </details>
    {/each}
  </article>

  <article class="card">
    <h2>{$t('routes.pt.dialogos.title', { default: '💬 Mini-diálogos' })}</h2>
    {#each DIALOGOS as d (d.title)}
      <details class="dialog" open={d === DIALOGOS[0]}>
        <summary>{d.title}</summary>
        {#each d.lines as line (line)}
          <p class="dialog-line">{@html line}</p>
        {/each}
        {#if d.en}
          <p class="dialog-en"><b>{$t('routes.pt.dialogos.en_label', { default: 'EN:' })}</b> {d.en}</p>
        {/if}
      </details>
    {/each}
  </article>

  <article class="card">
    <h2>{$t('routes.pt.verbos.title', { default: '📝 5 verbos essenciais (presente)' })}</h2>
    <table class="verbos">
      <thead>
        <tr>
          <th>{$t('routes.pt.th.verbo', { default: 'Verbo' })}</th>
          <th>eu</th>
          <th>tu</th>
          <th>{$t('routes.pt.pronoun.ele_ela', { default: 'ele/ela' })}</th>
          <th>{$t('routes.pt.pronoun.nos', { default: 'nós' })}</th>
          <th>{$t('routes.pt.pronoun.eles_elas', { default: 'eles/elas' })}</th>
        </tr>
      </thead>
      <tbody>
        {#each VERBOS as v (v.verbo)}
          <tr>
            <td><b>{v.verbo}</b></td>
            <td>{v.conj.eu}</td>
            <td>{v.conj.tu}</td>
            <td>{v.conj.ele}</td>
            <td>{v.conj.nos}</td>
            <td>{v.conj.eles}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="verb-examples">
      <b>{$t('routes.pt.examples.label', { default: 'Exemplos:' })}</b> <i>Eu sou a Fatma</i> (I am Fatma). <i>Estou a estudar</i> (I am studying).
      <i>Tenho 22 anos</i> (I am 22). <i>Vou à biblioteca</i> (I'm going to the library).
      <i>Faço o trabalho amanhã</i> (I'll do the assignment tomorrow).
    </p>
  </article>

  <article class="card highlight">
    <h2>{$t('routes.pt.quiz.title', { default: '🎯 Quiz rápido — ganhas badge 🇵🇹!' })}</h2>
    <p>{$t('routes.pt.quiz.subtitle', { default: 'Testa o que aprendeste com o mini-curso.' })}</p>
    <a class="quiz-btn" href="/escola/quiz/ptq/">{$t('routes.pt.quiz.cta', { default: 'Fazer o quiz 🇵🇹' })}</a>
  </article>
</div>

<style>
  .pt {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .pt-head { margin-bottom: 1.5rem; }
  .pt-head h1 {
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
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #fecaca;
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

  .frameworks {
    display: grid;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .card.highlight {
    background: rgba(236, 72, 153, 0.06);
    border-left: 4px solid var(--accent, #ec4899);
  }
  .card h2 {
    color: #fff;
    font-size: 1.25rem;
    margin: 0 0 0.6rem;
  }
  .fw-desc, .mini-intro {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 0.75rem;
    line-height: 1.55;
  }
  .card ul {
    color: var(--txt2, #cbd5e1);
    margin: 0.4rem 0 0.4rem 1.25rem;
    padding: 0;
  }
  .card ul li {
    margin: 0.35rem 0;
    line-height: 1.5;
  }
  .example {
    color: var(--txt3, #94a3b8);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent, #ec4899);
    border-radius: 0.3rem;
    margin: 0.75rem 0 0 !important;
    font-size: 0.92rem;
  }

  /* Vogais table */
  .vogais {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
    font-size: 0.92rem;
  }
  .vogais th,
  .vogais td {
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .vogais th {
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    font-weight: 600;
  }
  .vogais td { color: var(--txt2, #cbd5e1); }
  .tunisian-note {
    color: var(--txt3, #94a3b8);
    font-size: 0.88rem;
    margin: 0.5rem 0 0;
  }

  /* Words */
  .cat {
    margin-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 0.4rem;
  }
  .cat summary {
    cursor: pointer;
    font-weight: 600;
    color: #fff;
    padding: 0.4rem 0;
  }
  .words {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.4rem;
    font-size: 0.92rem;
  }
  .words td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--txt2, #cbd5e1);
  }
  .word-line {
    color: var(--txt2, #cbd5e1);
    margin: 0.3rem 0;
    font-size: 0.92rem;
  }

  /* Dialogs */
  .dialog {
    margin-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 0.4rem;
  }
  .dialog summary {
    cursor: pointer;
    font-weight: 600;
    color: #fff;
    padding: 0.4rem 0;
  }
  .dialog-line {
    color: var(--txt2, #cbd5e1);
    margin: 0.3rem 0;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .dialog-en {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0.4rem 0 0;
  }

  /* Verbos */
  .verbos {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .verbos th,
  .verbos td {
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .verbos th {
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    font-weight: 600;
  }
  .verbos td { color: var(--txt2, #cbd5e1); }
  .verb-examples {
    color: var(--txt3, #94a3b8);
    font-size: 0.88rem;
    margin: 0.6rem 0 0;
  }

  /* Quiz CTA */
  .quiz-btn {
    display: inline-block;
    padding: 0.7rem 1.5rem;
    background: var(--accent, #ec4899);
    color: #fff;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    margin-top: 0.5rem;
  }
  .quiz-btn:hover { background: #d63780; }
</style>
