<script lang="ts">
	// V10.1 (tarefa C) — cartão quadrado unificado para mini-apps.
	// Uma única linguagem visual para Home, Vida e afins: ícone, título,
	// descrição curta, progresso opcional e estados locked/empty bonitos.
	// Puramente apresentacional — dados ficam nos callers.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';

	interface Props {
		href?: string;
		icon: string;
		/** Já localizado pelo caller. */
		title: string;
		desc?: string;
		/** Terceira linha pequena (contagens, saldo, streak…). */
		meta?: string;
		/** Cor de destaque — pinta a barra lateral/realce. */
		accent?: string;
		progress?: { done: number; total: number };
		locked?: boolean;
		/** 'column' = quadrado compacto (grelhas); 'row' = lista horizontal. */
		layout?: 'column' | 'row';
		badge?: string;
		children?: Snippet;
	}

	let {
		href,
		icon,
		title,
		desc,
		meta,
		accent,
		progress,
		locked = false,
		layout = 'column',
		badge,
		children
	}: Props = $props();

	const pct = $derived(
		progress && progress.total > 0
			? Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)))
			: 0
	);
	const isLink = $derived(Boolean(href) && !locked);
</script>

{#snippet body()}
	<span class="ac-icon" aria-hidden="true">{icon}</span>
	<span class="ac-body">
		<span class="ac-title-row">
			<strong class="ac-title">{title}</strong>
			{#if badge}
				<span class="ac-badge">{badge}</span>
			{/if}
		</span>
		{#if desc}
			<span class="ac-desc">{desc}</span>
		{/if}
		{#if meta}
			<small class="ac-meta">{meta}</small>
		{/if}
		{#if progress}
			<span
				class="ac-progress"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={pct}
				aria-label={$t('appcard.progress.aria', {
					values: { done: progress.done, total: progress.total },
					default: 'Progresso: {done} de {total}'
				})}
			>
				<span class="ac-progress-bar" style="width: {pct}%"></span>
			</span>
			<small class="ac-progress-label">{progress.done}/{progress.total}</small>
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</span>
	{#if layout === 'row' && isLink}
		<span class="ac-arrow" aria-hidden="true">→</span>
	{/if}
	{#if locked}
		<span class="ac-lock" aria-hidden="true">🔒</span>
	{/if}
{/snippet}

{#if isLink}
	<a
		{href}
		class="app-card ac-{layout}"
		style={accent ? `--ac-accent: ${accent}` : undefined}
		data-sveltekit-preload-data
	>
		{@render body()}
	</a>
{:else}
	<span
		class="app-card ac-{layout}"
		class:ac-locked={locked}
		style={accent ? `--ac-accent: ${accent}` : undefined}
		aria-disabled="true"
	>
		{@render body()}
	</span>
{/if}

<style>
	.app-card {
		position: relative;
		display: flex;
		gap: 0.6rem;
		height: 100%;
		padding: var(--space-4, 1rem);
		border-radius: var(--radius-md, 0.75rem);
		background: var(--card);
		border: 1px solid var(--border);
		color: inherit;
		text-decoration: none;
		min-height: 44px;
		transition:
			background var(--motion-fast, 120ms) ease,
			border-color var(--motion-fast, 120ms) ease,
			transform var(--motion-fast, 120ms) ease;
	}

	.ac-column {
		flex-direction: column;
		gap: 0.3rem;
		min-height: 122px;
	}

	.ac-row {
		flex-direction: row;
		align-items: center;
		gap: 0.85rem;
		min-height: 88px;
		border-inline-start: 4px solid var(--ac-accent, var(--accent));
	}

	a.app-card:hover,
	a.app-card:focus-visible {
		background: var(--card-hover, var(--card));
		border-color: color-mix(in srgb, var(--ac-accent, var(--accent)) 45%, var(--border));
		transform: translateY(-1px);
		outline: none;
	}

	a.app-card:focus-visible {
		box-shadow: 0 0 0 2px var(--ac-accent, var(--accent));
	}

	a.app-card:active {
		transform: scale(0.98);
	}

	.ac-locked {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.ac-icon {
		font-size: 1.75rem;
		line-height: 1;
	}

	.ac-row .ac-icon {
		font-size: 2.1rem;
		width: 2.6rem;
		text-align: center;
	}

	.ac-body {
		display: flex;
		flex-direction: column;
		gap: 0.22rem;
		min-width: 0;
		flex: 1;
	}

	.ac-title-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.ac-title {
		font-weight: 600;
		font-size: var(--fs-md, 1rem);
	}

	.ac-badge {
		padding: 0.08rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ac-accent, var(--accent)) 22%, transparent);
		color: var(--ac-accent, var(--accent));
		font-size: 0.66rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.ac-desc {
		font-size: 0.85rem;
		color: var(--txt2);
		line-height: 1.35;
	}

	.ac-meta {
		font-size: 0.75rem;
		color: var(--txt3);
	}

	.ac-progress {
		display: block;
		height: 6px;
		margin-top: 0.25rem;
		background: var(--bg-elev, rgba(0, 0, 0, 0.28));
		border-radius: 999px;
		overflow: hidden;
	}

	.ac-progress-bar {
		display: block;
		height: 100%;
		background: var(--ac-accent, var(--accent));
		border-radius: 999px;
		transition: width var(--motion-base, 220ms) ease;
	}

	.ac-progress-label {
		font-size: 0.7rem;
		color: var(--txt3);
		font-variant-numeric: tabular-nums;
	}

	.ac-arrow {
		margin-inline-start: auto;
		color: var(--ac-accent, var(--accent));
		font-weight: 700;
	}

	.ac-lock {
		position: absolute;
		top: 0.5rem;
		inset-inline-end: 0.5rem;
		font-size: 0.85rem;
	}
</style>
