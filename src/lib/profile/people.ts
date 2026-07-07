import type { ChatProfile } from '$lib/chat/client';

export interface PersonProfile {
  id: ChatProfile;
  nameKey: string;
  handleKey: string;
  roleKey: string;
  subtitleKey: string;
  bioKey: string;
  emoji: string;
  accent: string;
  localeKey: string;
  locationKey: string;
  focusKeys: string[];
  shortcuts: { href: string; icon: string; labelKey: string; descKey: string }[];
}

export const PEOPLE: Record<ChatProfile, PersonProfile> = {
  fatma: {
    id: 'fatma',
    nameKey: 'profile.fatma.name',
    handleKey: 'profile.fatma.handle',
    roleKey: 'profile.fatma.role',
    subtitleKey: 'profile.fatma.subtitle',
    bioKey: 'profile.fatma.bio',
    emoji: '🌙',
    accent: 'var(--accent)',
    localeKey: 'profile.fatma.locale',
    locationKey: 'profile.fatma.location',
    focusKeys: ['profile.fatma.focus.school', 'profile.fatma.focus.life', 'profile.fatma.focus.memories'],
    shortcuts: [
      { href: '/mensagens/', icon: '💬', labelKey: 'nav.mensagens', descKey: 'profile.shortcut.messages.desc' },
      { href: '/escola/', icon: '🎓', labelKey: 'nav.escola', descKey: 'profile.shortcut.school.desc' },
      { href: '/vida/', icon: '🌿', labelKey: 'nav.vida', descKey: 'profile.shortcut.life.desc' },
      { href: '/mascotes/', icon: '🐷', labelKey: 'mascots.page.title', descKey: 'profile.shortcut.mascots.desc' },
      { href: '/definicoes/', icon: '⚙️', labelKey: 'nav.definicoes', descKey: 'profile.shortcut.settings.desc' }
    ]
  },
  daniel: {
    id: 'daniel',
    nameKey: 'profile.daniel.name',
    handleKey: 'profile.daniel.handle',
    roleKey: 'profile.daniel.role',
    subtitleKey: 'profile.daniel.subtitle',
    bioKey: 'profile.daniel.bio',
    emoji: '🚀',
    accent: 'var(--accent-2, var(--accent))',
    localeKey: 'profile.daniel.locale',
    locationKey: 'profile.daniel.location',
    focusKeys: ['profile.daniel.focus.messages', 'profile.daniel.focus.agent', 'profile.daniel.focus.settings'],
    shortcuts: [
      { href: '/mensagens/', icon: '💬', labelKey: 'nav.mensagens', descKey: 'profile.shortcut.messages.desc' },
      { href: '/agente/', icon: '🤖', labelKey: 'nav.agente', descKey: 'profile.shortcut.agent.desc' },
      { href: '/vida/', icon: '🌿', labelKey: 'nav.vida', descKey: 'profile.shortcut.life.desc' },
      { href: '/definicoes/', icon: '⚙️', labelKey: 'nav.definicoes', descKey: 'profile.shortcut.settings.desc' }
    ]
  }
};

/**
 * Neutral profile for onboarded members (uuid ids) — so a new user is NOT
 * shown Fatma's name/bio/role/location. Display call sites already prefer the
 * account's own name/emoji when available; this is the generic fallback for
 * everything else. All keys resolve in every locale (profile.generic.*).
 */
const GENERIC_PROFILE: PersonProfile = {
  id: 'fatma', // sentinel — only used in a display guard, never for routing
  nameKey: 'profile.generic.name',
  handleKey: 'profile.generic.handle',
  roleKey: 'profile.generic.role',
  subtitleKey: 'profile.generic.subtitle',
  bioKey: 'profile.generic.bio',
  emoji: '🐷',
  accent: 'var(--accent)',
  localeKey: 'profile.generic.locale',
  locationKey: 'profile.generic.location',
  focusKeys: ['profile.generic.focus.study', 'profile.generic.focus.life', 'profile.generic.focus.social'],
  shortcuts: [
    { href: '/escola/', icon: '🎓', labelKey: 'nav.escola', descKey: 'profile.shortcut.school.desc' },
    { href: '/vida/', icon: '🌿', labelKey: 'nav.vida', descKey: 'profile.shortcut.life.desc' },
    { href: '/mensagens/', icon: '💬', labelKey: 'nav.mensagens', descKey: 'profile.shortcut.messages.desc' },
    { href: '/definicoes/', icon: '⚙️', labelKey: 'nav.definicoes', descKey: 'profile.shortcut.settings.desc' }
  ]
};

export function profileFor(id: ChatProfile | null | undefined): PersonProfile {
  if (id === 'daniel') return PEOPLE.daniel;
  if (id === 'fatma') return PEOPLE.fatma;
  // Onboarded member (uuid) or unknown → generic, carrying the real id so the
  // display guard in profile-store still works.
  return id ? { ...GENERIC_PROFILE, id: id as ChatProfile } : PEOPLE.fatma;
}

export function otherPerson(id: ChatProfile | null | undefined): PersonProfile {
  return PEOPLE[id === 'daniel' ? 'fatma' : 'daniel'];
}
