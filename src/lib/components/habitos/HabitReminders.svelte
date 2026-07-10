<script lang="ts">
  /**
   * HabitReminders — invisible scheduler mounted once in the root layout.
   *
   * While the app is open it checks every minute (and on tab focus) whether a
   * scheduled, not-yet-done habit has passed its reminder time and, if so,
   * shows a browser Notification (once per habit per day). No-op unless the
   * user enabled reminders in Definições AND granted permission. See
   * $lib/habitos/reminders for the honest scope note (background/closed-app
   * reminders need push infra and are out of scope for a local-first PWA).
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fireDueReminders, remindersEnabled, notificationPermission } from '$lib/habitos/reminders';

  onMount(() => {
    if (!browser) return;
    let stopped = false;

    async function tick(): Promise<void> {
      if (stopped) return;
      if (!remindersEnabled() || notificationPermission() !== 'granted') return;
      try {
        await fireDueReminders();
      } catch {
        /* never let a reminder failure surface to the user */
      }
    }

    // First check shortly after boot (don't collide with splash/onboarding),
    // then every minute, plus whenever the tab regains focus.
    const boot = setTimeout(() => void tick(), 4000);
    const poll = setInterval(() => void tick(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(boot);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>
