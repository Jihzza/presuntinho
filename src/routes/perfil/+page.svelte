<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { getSession } from '$lib/auth/session';
  import { otherPerson, profileFor, type PersonProfile } from '$lib/profile/people';
  import type { ChatProfile } from '$lib/chat/client';

  let profileId = $state<ChatProfile | null>(null);
  let person = $state<PersonProfile>(profileFor('fatma'));
  let partner = $state<PersonProfile>(otherPerson('fatma'));
  let noSession = $state(false);

  onMount(() => {
    const session = getSession();
    if (!session) {
      noSession = true;
      return;
    }
    profileId = session.profile as ChatProfile;
    person = profileFor(profileId);
    partner = otherPerson(profileId);
  });
</script>

<svelte:head>
  <title>{$t('profile.page.title', { default: 'Perfil' })} — Presuntinho</title>
</svelte:head>

<section class="profile-page">
  {#if noSession}
    <div class="profile-card empty">
      <span class="avatar" aria-hidden="true">🔐</span>
      <h1>{$t('profile.no_session.title', { default: 'Entra primeiro na app' })}</h1>
      <p>{$t('profile.no_session.body', { default: 'Depois mostramos o teu espaço, preferências e atalhos.' })}</p>
      <a class="primary" href="/splash/">{$t('profile.no_session.cta', { default: 'Ir para entrada' })}</a>
    </div>
  {:else}
    <header class="profile-hero profile-card" style={`--person-accent: ${person.accent}`}>
      <span class="eyebrow">{$t('profile.page.eyebrow', { default: 'O teu espaço' })}</span>
      <div class="hero-main">
        <span class="avatar" aria-hidden="true">{person.emoji}</span>
        <div>
          <h1>{$t(person.nameKey)}</h1>
          <p class="role">{$t(person.roleKey)}</p>
          <p class="subtitle">{$t(person.subtitleKey)}</p>
        </div>
      </div>
      <p class="bio">{$t(person.bioKey)}</p>
    </header>

    <div class="profile-grid">
      <article class="profile-card">
        <h2>{$t('profile.section.preferences', { default: 'Preferências' })}</h2>
        <dl class="facts">
          <div>
            <dt>{$t('profile.field.language', { default: 'Idioma' })}</dt>
            <dd>{$t(person.localeKey)}</dd>
          </div>
          <div>
            <dt>{$t('profile.field.location', { default: 'Contexto' })}</dt>
            <dd>{$t(person.locationKey)}</dd>
          </div>
        </dl>
      </article>

      <article class="profile-card">
        <h2>{$t('profile.section.privacy', { default: 'Privacidade' })}</h2>
        <p>{$t('profile.privacy.body', { default: 'As mensagens privadas usam sessão local e ligação segura quando o backend está configurado. Dados sensíveis não aparecem no perfil.' })}</p>
        <a href="/mensagens/" class="inline-link">💬 {$t('profile.privacy.chat', { default: 'Abrir chat privado com {name}', values: { name: $t(partner.nameKey) } })}</a>
      </article>
    </div>

    <section class="profile-card">
      <h2>{$t('profile.section.focus', { default: 'Prioridades' })}</h2>
      <ul class="focus-list">
        {#each person.focusKeys as key}
          <li>{$t(key)}</li>
        {/each}
      </ul>
    </section>

    <section class="profile-card">
      <h2>{$t('profile.section.shortcuts', { default: 'Atalhos' })}</h2>
      <div class="shortcut-grid">
        {#each person.shortcuts as item}
          <a href={item.href} class="shortcut" data-sveltekit-preload-data>
            <span aria-hidden="true">{item.icon}</span>
            <strong>{$t(item.labelKey)}</strong>
            <small>{$t(item.descKey)}</small>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</section>

<style>
  .profile-page { max-width: 840px; margin: 0 auto; padding: 1.5rem 1rem 6rem; color: var(--txt); }
  .profile-card { border: 1px solid var(--border); border-radius: var(--radius-lg, 1rem); background: var(--card); box-shadow: var(--shadow-sm, none); padding: var(--space-4, 1rem); }
  .profile-card + .profile-card, .profile-grid + .profile-card { margin-top: var(--space-4, 1rem); }
  .profile-hero { background: linear-gradient(135deg, color-mix(in srgb, var(--person-accent, var(--accent)) 22%, var(--card)), var(--card)); }
  .eyebrow { display: block; color: var(--txt3); font-size: var(--fs-xs, .76rem); text-transform: uppercase; letter-spacing: .08em; margin-bottom: var(--space-3, .75rem); }
  .hero-main { display: flex; align-items: center; gap: var(--space-4, 1rem); }
  .avatar { width: 4rem; height: 4rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 1.4rem; font-size: 2.25rem; background: color-mix(in srgb, var(--person-accent, var(--accent)) 20%, transparent); border: 1px solid color-mix(in srgb, var(--person-accent, var(--accent)) 45%, var(--border)); flex: 0 0 auto; }
  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: .25rem; font-size: clamp(1.7rem, 6vw, 2.3rem); }
  h2 { font-size: var(--fs-lg, 1.15rem); margin-bottom: .75rem; }
  .role { margin: 0; font-weight: 700; color: var(--accent); }
  .subtitle, .bio, .profile-card p { color: var(--txt2); line-height: 1.55; }
  .bio { margin: var(--space-4, 1rem) 0 0; }
  .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4, 1rem); margin-top: var(--space-4, 1rem); }
  .facts { margin: 0; display: grid; gap: var(--space-3, .75rem); }
  .facts div { display: grid; gap: .15rem; }
  dt { color: var(--txt3); font-size: var(--fs-xs, .76rem); }
  dd { margin: 0; font-weight: 700; }
  .inline-link, .primary { color: var(--accent); font-weight: 700; text-decoration: none; }
  .inline-link:focus-visible, .primary:focus-visible, .shortcut:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .focus-list { display: flex; flex-wrap: wrap; gap: .5rem; padding: 0; margin: 0; list-style: none; }
  .focus-list li { padding: .45rem .7rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt2); font-size: var(--fs-sm, .88rem); }
  .shortcut-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3, .75rem); }
  .shortcut { min-height: 44px; padding: var(--space-3, .75rem); border: 1px solid var(--border); border-radius: var(--radius-md, .75rem); background: var(--bg-elev); color: inherit; text-decoration: none; display: grid; gap: .25rem; }
  .shortcut span { font-size: 1.5rem; }
  .shortcut small { color: var(--txt3); line-height: 1.35; }
  .empty { text-align: center; display: grid; justify-items: center; gap: var(--space-3, .75rem); }
  @media (max-width: 640px) { .profile-grid { grid-template-columns: 1fr; } .hero-main { align-items: flex-start; } }
</style>
