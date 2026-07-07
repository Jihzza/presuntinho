<script lang="ts">
  /**
   * Privacy page (/privacidade). Plain-language, accurate to how the app
   * actually handles data: local-first (IndexedDB on your device), an optional
   * account for the couple/social features (Supabase), no ads, no third-party
   * analytics. This is a clear starting point — a launch should have it
   * reviewed for the target jurisdiction.
   */
  import { t } from 'svelte-i18n';
</script>

<svelte:head>
  <title>{$t('legal.privacy.title', { default: 'Privacidade' })} · Presuntinho</title>
  <meta name="description" content={$t('legal.privacy.meta', { default: 'Como o Presuntinho trata os teus dados.' })} />
</svelte:head>

<div class="legal">
  <a class="back" href="/definicoes/">← {$t('legal.back', { default: 'Definições' })}</a>
  <h1>{$t('legal.privacy.h1', { default: 'Privacidade' })}</h1>
  <p class="lead">{$t('legal.privacy.lead', { default: 'Em resumo: os teus dados vivem no teu dispositivo. Só sai de lá o que precisas para as funcionalidades de casal/social — e só se criares conta.' })}</p>

  <h2>{$t('legal.privacy.local.h', { default: '1. Os dados ficam no teu dispositivo' })}</h2>
  <p>{$t('legal.privacy.local.p', { default: 'A escola, hábitos, finanças, humor, memórias, caderno e a maioria das definições são guardados localmente no teu navegador (IndexedDB). Não são enviados para nenhum servidor. Se limpares os dados do site ou desinstalares a app, esses dados desaparecem do dispositivo.' })}</p>

  <h2>{$t('legal.privacy.account.h', { default: '2. Conta e funcionalidades de casal/social' })}</h2>
  <p>{$t('legal.privacy.account.p', { default: 'Se criares conta (opcional), guardamos o mínimo para te identificar e ligar ao teu parceiro/contactos: email, um @handle, nome e emoji de perfil. As mensagens privadas, convites e pares são sincronizados através do fornecedor de backend (Supabase) para chegarem ao outro dispositivo. Sem conta, nada disto é usado.' })}</p>

  <h2>{$t('legal.privacy.noads.h', { default: '3. Sem anúncios, sem rastreio de terceiros' })}</h2>
  <p>{$t('legal.privacy.noads.p', { default: 'Não há publicidade, nem trackers de terceiros, nem venda de dados. Não corremos analytics de terceiros.' })}</p>

  <h2>{$t('legal.privacy.control.h', { default: '4. O teu controlo' })}</h2>
  <ul>
    <li>{$t('legal.privacy.control.export', { default: 'Exportar: Definições → Cópia de segurança exporta tudo num ficheiro.' })}</li>
    <li>{$t('legal.privacy.control.delete', { default: 'Apagar: Definições → Limpar dados apaga os dados locais deste dispositivo. Apagar a conta remove também os dados de conta do servidor.' })}</li>
  </ul>

  <h2>{$t('legal.privacy.contact.h', { default: '5. Contacto' })}</h2>
  <p>{$t('legal.privacy.contact.p', { default: 'Dúvidas sobre privacidade? Fala com quem gere a app.' })}</p>

  <p class="note">{$t('legal.privacy.note', { default: 'Nota: esta página descreve o comportamento atual da app de forma honesta e simples; para uso comercial deve ser revista para a legislação aplicável.' })}</p>
</div>

<style>
  .legal { max-width: min(720px, 100%); width: 100%; margin: 0 auto; padding: 1.25rem 1rem 5rem; color: var(--txt); }
  .back { display: inline-block; color: var(--accent); text-decoration: none; font-size: var(--fs-sm, 0.85rem); padding: 0.35rem 0; }
  h1 { margin: 0.5rem 0 0.5rem; font-size: clamp(1.6rem, 6vw, 2rem); }
  .lead { color: var(--txt2); font-size: 1.02rem; line-height: 1.55; margin: 0 0 1.25rem; }
  h2 { font-size: 1.1rem; margin: 1.4rem 0 0.4rem; color: var(--txt); }
  p { color: var(--txt2); line-height: 1.6; margin: 0 0 0.6rem; }
  ul { color: var(--txt2); line-height: 1.6; margin: 0 0 0.6rem; padding-inline-start: 1.2rem; }
  li { margin: 0 0 0.3rem; }
  .note { margin-top: 1.5rem; font-size: 0.85rem; color: var(--txt3); border-top: 1px solid var(--border); padding-top: 0.75rem; }
</style>
