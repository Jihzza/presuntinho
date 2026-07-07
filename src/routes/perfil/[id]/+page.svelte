<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import { getSession } from '$lib/auth/session';
  import { otherPerson, profileFor, type PersonProfile } from '$lib/profile/people';
  import { getMember } from '$lib/space/registry-db';
  import { xp, initStores } from '$lib/state/stores';
  import { progressToNext } from '$lib/gamification/levels';
  import type { ChatProfile } from '$lib/chat/client';

  // Use the REAL route id — never collapse an onboarded member's uuid to Fatma
  // (that leaked Fatma's name/@handle/bio to every tenant). profileFor() yields
  // the neutral generic profile for a uuid, and the member's own registry row
  // (loaded below) drives their real name/emoji/bio.
  const id = $derived((page.params.id ?? 'fatma') as ChatProfile);
  const isLegacy = $derived(id === 'fatma' || id === 'daniel');
  const session = $derived(getSession());
  const person = $derived<PersonProfile>(profileFor(id));
  const partner = $derived<PersonProfile>(otherPerson(id));
  const isOwn = $derived(session?.profile === id);

  // A uuid member's real identity lives in their registry row.
  let member = $state<{ displayName: string; emoji: string; bio?: string } | null>(null);
  const displayName = $derived(member?.displayName || $t(person.nameKey));
  const displayEmoji = $derived(member?.emoji || person.emoji);
  const displayBio = $derived(member?.bio || $t(person.bioKey));
  const postKey = $derived(isLegacy ? `profile.${id}.post.one` : 'profile.generic.post.one');

  // V10 — level stat (own profile only; XP is per-profile local data).
  let currentXp = $state(0);
  const levelInfo = $derived(progressToNext(currentXp));

  onMount(() => {
    const unsub = xp.subscribe((v) => (currentXp = v));
    void initStores();
    const raw = page.params.id;
    if (raw && raw !== 'fatma' && raw !== 'daniel') {
      void getMember(raw)
        .then((m) => {
          if (m) member = { displayName: m.displayName, emoji: m.emoji, bio: m.bio };
        })
        .catch(() => {});
    }
    return unsub;
  });
</script>

<svelte:head>
  <title>{displayName} — {$t('profile.page.title')}</title>
</svelte:head>

<section class="social-profile" style={`--person-accent: ${person.accent}`}>
  <header class="cover-card">
    <div class="cover" role="img" aria-label={$t('profile.cover.aria', { values: { name: displayName } })}></div>
    <div class="identity-row">
      <span class="avatar" aria-hidden="true">{displayEmoji}</span>
      <div class="actions">
        {#if isOwn}
          <a class="secondary" href="/definicoes/">{$t('profile.action.settings')}</a>
        {:else}
          <a class="primary" href="/mensagens/">{$t('profile.action.message')}</a>
        {/if}
      </div>
    </div>
    <div class="intro">
      <h1>{displayName}</h1>
      <p class="handle">{$t(person.handleKey)}</p>
      <p class="role">{$t(person.roleKey)}</p>
      <p class="bio">{displayBio}</p>
      <div class="meta-line">
        <span>{$t(person.locationKey)}</span>
        <span>{$t(person.localeKey)}</span>
      </div>
    </div>
    <div class="stats" aria-label={$t('profile.stats.label')}>
      {#if isOwn}
        <div>
          <strong>{levelInfo.level}</strong>
          <span>{$t('profile.stats.level', { default: 'Nível' })}</span>
        </div>
      {/if}
      <div><strong>{$t('profile.stats.private.value')}</strong><span>{$t('profile.stats.messages')}</span></div>
      <div><strong>{$t('profile.stats.memories.value')}</strong><span>{$t('profile.stats.memories')}</span></div>
      <div><strong>{person.shortcuts.length}</strong><span>{$t('profile.stats.shortcuts')}</span></div>
    </div>
  </header>

  <nav class="tabs" aria-label={$t('profile.tabs.aria')}>
    <a href="#sobre">{$t('profile.tabs.about')}</a>
    <a href="#memorias">{$t('profile.tabs.memories')}</a>
    <a href="#ficheiros">{$t('profile.tabs.media')}</a>
    <a href="#atalhos">{$t('profile.tabs.shortcuts')}</a>
  </nav>

  <section id="sobre" class="card">
    <h2>{$t('profile.tabs.about')}</h2>
    <ul class="focus-list">
      {#each person.focusKeys as key}
        <li>{$t(key)}</li>
      {/each}
    </ul>
    <p class="privacy">{$t('profile.privacy.body')}</p>
  </section>

  <section id="memorias" class="card post-list">
    <h2>{$t('profile.tabs.memories')}</h2>
    <article class="post-card">
      <span class="post-avatar" aria-hidden="true">{displayEmoji}</span>
      <div>
        <strong>{displayName}</strong>
        <p>{$t(postKey)}</p>
      </div>
    </article>
    <article class="post-card muted">
      <span class="post-avatar" aria-hidden="true">💭</span>
      <p>{$t('profile.tabs.empty.memories')}</p>
    </article>
  </section>

  <section id="ficheiros" class="card">
    <h2>{$t('profile.tabs.media')}</h2>
    <p class="empty-note">{$t('profile.tabs.empty.media')}</p>
  </section>

  <section id="atalhos" class="card">
    <h2>{$t('profile.tabs.shortcuts')}</h2>
    <div class="shortcut-grid">
      {#each person.shortcuts as item}
        <a href={item.href} class="shortcut" data-sveltekit-preload-data>
          <span aria-hidden="true">{item.icon}</span>
          <strong>{$t(item.labelKey)}</strong>
          <small>{$t(item.descKey)}</small>
        </a>
      {/each}
      {#if isLegacy}
        <a href={`/perfil/${partner.id}/`} class="shortcut">
          <span aria-hidden="true">{partner.emoji}</span>
          <strong>{$t('profile.page.view_partner', { values: { name: $t(partner.nameKey) } })}</strong>
          <small>{$t('profile.shortcut.partner.desc')}</small>
        </a>
      {/if}
    </div>
  </section>
</section>

<style>
  .social-profile { max-width: 880px; margin: 0 auto; padding: 1rem 1rem 6rem; color: var(--txt); }
  .cover-card, .card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); box-shadow: var(--shadow-sm, none); overflow: hidden; }
  .cover { height: clamp(8rem, 28vw, 14rem); background: radial-gradient(circle at 18% 24%, color-mix(in srgb, var(--person-accent) 42%, transparent), transparent 34%), linear-gradient(135deg, color-mix(in srgb, var(--person-accent) 28%, var(--bg-elev)), var(--card)); }
  .identity-row { display: flex; align-items: flex-end; justify-content: space-between; padding: 0 1rem; margin-top: -2.8rem; }
  .avatar { width: 6.2rem; height: 6.2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 2rem; border: 4px solid var(--card); background: color-mix(in srgb, var(--person-accent) 18%, var(--bg-elev)); font-size: 3.2rem; }
  .actions { display: flex; gap: .5rem; padding-bottom: .55rem; }
  .primary, .secondary { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0 .95rem; font-weight: 800; text-decoration: none; }
  .primary { background: var(--accent); color: var(--on-accent); }
  .secondary { border: 1px solid var(--border-strong); color: var(--txt); }
  .intro { padding: .75rem 1rem 1rem; }
  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: .05rem; font-size: clamp(2rem, 7vw, 3rem); }
  h2 { margin-bottom: .75rem; font-size: var(--fs-lg); }
  .handle { color: var(--txt3); margin-bottom: .65rem; }
  .role { color: var(--accent); font-weight: 800; margin-bottom: .5rem; }
  .bio, .privacy, .empty-note, .post-card p { color: var(--txt2); line-height: 1.55; }
  .meta-line { display: flex; flex-wrap: wrap; gap: .55rem 1rem; color: var(--txt3); font-size: var(--fs-sm); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); }
  .stats div { padding: .9rem 1rem; display: grid; gap: .1rem; }
  .stats strong { font-size: 1.25rem; }
  .stats span { color: var(--txt3); font-size: var(--fs-xs); }
  .tabs { position: sticky; top: 4.3rem; z-index: 4; display: flex; gap: .5rem; overflow-x: auto; padding: .75rem 0; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); }
  .tabs a { border: 1px solid var(--border); border-radius: 999px; padding: .45rem .85rem; color: var(--txt2); background: var(--card); text-decoration: none; white-space: nowrap; }
  .card { padding: 1rem; margin-top: .85rem; }
  .focus-list { list-style: none; padding: 0; margin: 0 0 .85rem; display: flex; flex-wrap: wrap; gap: .5rem; }
  .focus-list li { border: 1px solid var(--border); border-radius: 999px; padding: .45rem .7rem; color: var(--txt2); background: var(--bg-elev); }
  .post-list { display: grid; gap: .75rem; }
  .post-card { display: grid; grid-template-columns: auto 1fr; gap: .7rem; padding: .8rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-elev); }
  .post-card.muted { opacity: .8; }
  .post-avatar { width: 2.5rem; height: 2.5rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--card); }
  .shortcut-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; }
  .shortcut { min-height: 44px; padding: .75rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-elev); color: inherit; text-decoration: none; display: grid; gap: .25rem; }
  .shortcut span { font-size: 1.5rem; }
  .shortcut small { color: var(--txt3); line-height: 1.35; }
  a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  @media (max-width: 560px) { .identity-row { align-items: flex-start; } .avatar { width: 5.4rem; height: 5.4rem; font-size: 2.8rem; } .stats div { padding: .75rem; } }
</style>
