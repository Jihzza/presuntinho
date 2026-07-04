<script lang="ts">
	// V10 — 7-circle week row (Mon→Sun): filled = active day, ❄ = frozen day.
	// Used in the streak flame popover and the victory flow.
	import { t, locale } from 'svelte-i18n';
	import type { WeekDayActivity } from '$lib/gamification/streak';

	interface Props {
		week: WeekDayActivity[];
		/** Compact rendering (smaller circles) for tight layouts. */
		compact?: boolean;
	}
	let { week, compact = false }: Props = $props();

	const dayLocale = $derived($locale || 'pt-PT');

	function dayInitial(dateKey: string): string {
		const [y, m, d] = dateKey.split('-').map(Number);
		return new Intl.DateTimeFormat(dayLocale, { weekday: 'narrow' }).format(
			new Date(y, m - 1, d)
		);
	}
</script>

<div
	class="week-circles"
	class:compact
	role="img"
	aria-label={$t('streak.week.aria', { default: 'Atividade desta semana' })}
>
	{#each week as day (day.date)}
		<span
			class="circle"
			class:active={day.active}
			class:frozen={day.frozen && !day.active}
			class:today={day.isToday}
			title={day.date}
		>
			{#if day.active}
				<span class="mark" aria-hidden="true">✓</span>
			{:else if day.frozen}
				<span class="mark" aria-hidden="true">❄</span>
			{:else}
				<span class="initial" aria-hidden="true">{dayInitial(day.date)}</span>
			{/if}
		</span>
	{/each}
</div>

<style>
	.week-circles {
		display: flex;
		gap: 0.4rem;
		justify-content: center;
	}

	.circle {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-xs, 0.75rem);
		color: var(--txt3, #94a3b8);
		background: var(--bg-elev, rgba(255, 255, 255, 0.06));
		border: 1.5px solid var(--border, rgba(255, 255, 255, 0.12));
		transition: transform var(--motion-fast, 120ms) ease;
	}

	.compact .circle {
		width: 24px;
		height: 24px;
	}

	.circle.active {
		background: color-mix(in srgb, var(--accent) 85%, transparent);
		border-color: var(--accent);
		color: var(--on-accent, #fff);
	}

	.circle.frozen {
		background: color-mix(in srgb, #60a5fa 30%, transparent);
		border-color: #60a5fa;
		color: #dbeafe;
	}

	.circle.today {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.mark {
		font-weight: 700;
		line-height: 1;
	}

	.initial {
		text-transform: uppercase;
		line-height: 1;
	}
</style>
