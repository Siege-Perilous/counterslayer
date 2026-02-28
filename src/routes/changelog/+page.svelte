<script lang="ts">
	import { Link, Text, Spacer, Title, Logo, IconButton, Icon } from '@tableslayer/ui';
	import { IconSun, IconMoon } from '@tabler/icons-svelte';
	import { marked } from 'marked';
	import type { PageData } from './$types';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let { data } = $props<{ data: PageData }>();

	// Theme state
	let mode = $state<'light' | 'dark'>('dark');

	// Initialize mode from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem('counterslayer-theme');
			if (saved === 'light' || saved === 'dark') {
				mode = saved;
			}
		}
	});

	function toggleTheme() {
		mode = mode === 'dark' ? 'light' : 'dark';
		if (browser) {
			localStorage.setItem('counterslayer-theme', mode);
		}
	}

	marked.setOptions({
		breaks: true,
		gfm: true
	});

	onMount(() => {
		if (browser) {
			document.documentElement.style.scrollBehavior = 'smooth';
		}
	});

	onDestroy(() => {
		if (browser) {
			document.documentElement.style.scrollBehavior = '';
		}
	});
</script>

<svelte:head>
	<title>Counter Slayer changelog</title>
	<meta name="description" content="Monthly updates and new features for Counter Slayer." />
</svelte:head>

<div class="appContainer {mode}">
	<!-- Header -->
	<div class="appHeader">
		<div style="display: flex; align-items: center; gap: 0.25rem;">
			<a href="/" style="display: contents; font-weight: 600; color: var(--fg); text-decoration: none;">Counter Slayer</a>
			by
			<Link href="https://davesnider.com" target="_blank" rel="noopener noreferrer">Dave Snider</Link>
		</div>
		<div style="display: flex; align-items: center; gap: 0.75rem;">
			<Link href="/changelog">Changelog</Link>
			<Link href="https://youtu.be/82d_-vjFpKw" target="_blank" rel="noopener noreferrer">Tutorial</Link>
			<Link href="https://github.com/Siege-Perilous/counterslayer" target="_blank" rel="noopener noreferrer">GitHub</Link>
			<IconButton variant="ghost" onclick={toggleTheme} size="sm">
				<Icon Icon={mode === 'dark' ? IconSun : IconMoon} />
			</IconButton>
		</div>
	</div>

	<div class="appContent">
		<div class="container">
			<div class="changelog__contentContainer">
				<Title as="h1" size="md">Product updates</Title>
				<Spacer size="0.5rem" />
				<Text color="var(--fgMuted)">
					Notable updates and improvements to Counter Slayer. A complete <Link
						href="https://github.com/Siege-Perilous/counterslayer/pulls?q=is%3Apr+is%3Amerged"
						target="_blank"
						rel="noopener noreferrer"
					>
						history
					</Link> is available on GitHub.
				</Text>
				<Spacer size="2rem" />

				{#if data.entries.length > 0}
					<Spacer size="3rem" />

					<div class="changelog__entries">
						{#each data.entries as entry}
							<div class="changelog__entry">
								<Link id={entry.anchorId} class="changelog__entryDate" href="#{entry.anchorId}">
									{entry.displayDate}
								</Link>
								<div class="changelog__content">
									{@html marked.parse(entry.content)}
								</div>
							</div>
							{#if entry !== data.entries[data.entries.length - 1]}
								<Spacer size="8rem" />
							{/if}
						{/each}
					</div>
				{:else}
					<Text>No changelog entries yet. Check back soon!</Text>
				{/if}
			</div>
			<div class="changelog__toc">
				<Text weight={600}>On this page</Text>
				<Spacer size="0.5rem" />
				<ul class="changelog__toc-list">
					{#each data.entries as entry}
						<li>
							<a href="#{entry.anchorId}" class="changelog__toc-link">
								{entry.displayDate}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.appContainer {
		--header-height: 2.5rem;
		min-height: 100vh;
		background: var(--bg);
		color: var(--fg);
	}

	.appHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: var(--borderThin);
		font-size: 0.875rem;
		color: var(--fgMuted);
		position: sticky;
		top: 0;
		background: var(--bg);
		z-index: 10;
		height: var(--header-height);
		box-sizing: border-box;
	}

	.appContent {
	}

	.container {
		width: 100%;
		padding: 0 2rem;
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 2rem;
	}

	.changelog__contentContainer {
		max-width: 672px;
		margin: 3rem auto;
	}

	.changelog__toc {
		border-left: var(--borderThin);
		padding: 1.5rem;
		padding-top: 3rem;
		position: sticky;
		top: var(--header-height);
		height: calc(100vh - var(--header-height));
		overflow-y: auto;
	}

	.changelog__toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.changelog__toc-list li {
		margin: 0.5rem 0;
	}

	.changelog__toc-link {
		color: var(--fgMuted);
		text-decoration: none;
		display: inline-block;
		padding: 0.25rem 0;
	}

	.changelog__toc-link:hover {
		text-decoration: underline;
	}

	.changelog__entry {
		display: grid;
		grid-template-columns: 150px 1fr;
	}

	:global(.changelog__entryDate) {
		scroll-margin-top: 2rem;
	}

	.changelog__content {
		color: var(--fg);
		line-height: 1.6;
	}

	.changelog__content :global(*:first-child) {
		margin-top: 0;
	}

	.changelog__content :global(h3) {
		color: var(--fgMuted);
		font-size: 1.25rem;
		margin-top: 2rem;
		margin-bottom: 1rem;
		line-height: 1.2;
		font-weight: 600;
	}

	.changelog__content :global(h4) {
		color: var(--fgMuted);
		font-size: 1.1rem;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		line-height: 1.2;
		font-weight: 600;
	}

	.changelog__content :global(p) {
		margin: 1rem 0;
	}

	.changelog__content :global(ul),
	.changelog__content :global(ol) {
		margin: 1rem 0;
		padding-left: 2rem;
	}

	.changelog__content :global(ul) {
		list-style: disc;
	}

	.changelog__content :global(li) {
		margin: 0.5rem 0;
	}

	.changelog__content :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		margin: 1.5rem 0;
	}

	.changelog__content :global(video) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		margin: 1.5rem 0;
	}

	.changelog__content :global(code) {
		background: var(--contrastLow);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.875em;
	}

	.changelog__content :global(pre) {
		background: var(--bgMuted);
		padding: 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		margin: 1rem 0;
	}

	.changelog__content :global(pre code) {
		background: none;
		padding: 0;
	}

	.changelog__content :global(blockquote) {
		border-left: 4px solid var(--fgPrimary);
		padding-left: 1rem;
		margin: 1rem 0;
		color: var(--fgMuted);
	}

	.changelog__content :global(a) {
		color: var(--fgPrimary);
		text-decoration: underline;
	}

	.changelog__content :global(a:hover) {
		opacity: 0.8;
	}

	@media (max-width: 768px) {
		.container {
			grid-template-columns: 1fr;
		}
		.changelog__toc {
			display: none;
		}
	}

	@media (max-width: 600px) {
		.changelog__entry {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}
	}
</style>
