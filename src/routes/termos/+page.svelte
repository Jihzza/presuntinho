<script lang="ts">
  /**
   * Terms page (/termos). Plain-language terms of use, honest to what the app
   * is. A starting point to be reviewed for the target jurisdiction at launch.
   */
  import { t } from 'svelte-i18n';
</script>

<svelte:head>
  <title>{$t('legal.terms.title', { default: 'Termos' })} · Presuntinho</title>
  <meta name="description" content={$t('legal.terms.meta', { default: 'Termos de utilização do Presuntinho.' })} />
</svelte:head>

<div class="legal">
  <a class="back" href="/definicoes/">← {$t('legal.back', { default: 'Definições' })}</a>
  <h1>{$t('legal.terms.h1', { default: 'Termos de utilização' })}</h1>
  <p class="lead">{$t('legal.terms.lead', { default: 'Ao usar o Presuntinho concordas com o essencial abaixo. Escrito em linguagem simples de propósito.' })}</p>

  <h2>{$t('legal.terms.use.h', { default: '1. O que é' })}</h2>
  <p>{$t('legal.terms.use.p', { default: 'O Presuntinho é uma app pessoal de estudo, hábitos, finanças, humor e memórias, com uma camada social opcional para casais/contactos. É fornecido “tal como está”, com carinho mas sem garantias de disponibilidade permanente.' })}</p>

  <h2>{$t('legal.terms.data.h', { default: '2. Os teus dados são teus' })}</h2>
  <p>{$t('legal.terms.data.p', { default: 'És responsável pelo conteúdo que crias. Como a maioria dos dados fica no teu dispositivo, faz cópias de segurança (Definições → Cópia de segurança). Não nos responsabilizamos por perda de dados locais (ex.: ao limpar o navegador).' })}</p>

  <h2>{$t('legal.terms.conduct.h', { default: '3. Boa conduta' })}</h2>
  <p>{$t('legal.terms.conduct.p', { default: 'Nas funcionalidades sociais/mensagens, trata os outros com respeito. Não uses a app para assediar, enganar ou partilhar conteúdo ilegal.' })}</p>

  <h2>{$t('legal.terms.privacy.h', { default: '4. Privacidade' })}</h2>
  <p>{$t('legal.terms.privacy.p', { default: 'O tratamento de dados está descrito na página de Privacidade.' })} <a href="/privacidade/">{$t('legal.terms.privacy.link', { default: 'Ver Privacidade →' })}</a></p>

  <h2>{$t('legal.terms.changes.h', { default: '5. Alterações' })}</h2>
  <p>{$t('legal.terms.changes.p', { default: 'Estes termos podem mudar à medida que a app evolui. Continuar a usar depois de uma alteração significa que aceitas a versão nova.' })}</p>

  <p class="note">{$t('legal.terms.note', { default: 'Nota: texto de partida, honesto e simples; para uso comercial deve ser revisto juridicamente para a legislação aplicável.' })}</p>
</div>

<style>
  .legal { max-width: min(720px, 100%); width: 100%; margin: 0 auto; padding: 1.25rem 1rem 5rem; color: var(--txt); }
  .back { display: inline-block; color: var(--accent); text-decoration: none; font-size: var(--fs-sm, 0.85rem); padding: 0.35rem 0; }
  h1 { margin: 0.5rem 0 0.5rem; font-size: clamp(1.6rem, 6vw, 2rem); }
  .lead { color: var(--txt2); font-size: 1.02rem; line-height: 1.55; margin: 0 0 1.25rem; }
  h2 { font-size: 1.1rem; margin: 1.4rem 0 0.4rem; color: var(--txt); }
  p { color: var(--txt2); line-height: 1.6; margin: 0 0 0.6rem; }
  p a { color: var(--accent); }
  .note { margin-top: 1.5rem; font-size: 0.85rem; color: var(--txt3); border-top: 1px solid var(--border); padding-top: 0.75rem; }
</style>
