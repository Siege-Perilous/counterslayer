<script lang="ts">
	import './layout.css';
	import { dev, browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { Link, IconButton, Icon, Popover } from '@tableslayer/ui';
	import { IconSun, IconMoon, IconMenu2 } from '@tabler/icons-svelte';
	import { setContext } from 'svelte';

	let { children } = $props();

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

	// Set context for child components
	setContext('theme', {
		get mode() {
			return mode;
		},
		toggle: toggleTheme
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={dev ? '/favicon-dev.svg' : '/favicon.svg'} />
</svelte:head>

<div class="appContainer {mode}">
	<!-- Header -->
	<div class="appHeader">
		<div style="display: flex; align-items: center; gap: 0.25rem;">
			<a href={resolve('/')} class="appTitle">Counter Slayer</a>
			by
			<Link href="https://davesnider.com" target="_blank" rel="noopener noreferrer"
				>Dave Snider</Link
			>
		</div>
		<div style="display: flex; align-items: center; gap: 0.75rem;">
			<div class="headerLinks">
				<Link href="/changelog">Changelog</Link>
				<Link href="https://youtu.be/82d_-vjFpKw" target="_blank" rel="noopener noreferrer"
					>Tutorial</Link
				>
				<Link
					href="https://github.com/Siege-Perilous/counterslayer"
					target="_blank"
					rel="noopener noreferrer">GitHub</Link
				>
			</div>
			<div class="headerMenu">
				<Popover positioning={{ placement: 'bottom-end' }}>
					{#snippet trigger()}
						<IconButton variant="ghost" size="sm">
							<Icon Icon={IconMenu2} />
						</IconButton>
					{/snippet}
					{#snippet content()}
						<div class="headerMenuContent">
							<Link href="/changelog">Changelog</Link>
							<Link href="https://youtu.be/82d_-vjFpKw" target="_blank" rel="noopener noreferrer"
								>Tutorial</Link
							>
							<Link
								href="https://github.com/Siege-Perilous/counterslayer"
								target="_blank"
								rel="noopener noreferrer">GitHub</Link
							>
						</div>
					{/snippet}
				</Popover>
			</div>
			<IconButton variant="ghost" onclick={toggleTheme} size="sm">
				<Icon Icon={mode === 'dark' ? IconSun : IconMoon} />
			</IconButton>
		</div>
	</div>

	<div class="appContent">
		{@render children()}
	</div>
</div>

<style>
	.appContainer {
		--header-height: 2.5rem;
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
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
		flex-shrink: 0;
	}

	.appTitle {
		display: contents;
		font-weight: 600;
		color: var(--fg);
		text-decoration: none;
	}

	.appContent {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.headerLinks {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.headerMenu {
		display: none;
	}

	.headerMenuContent {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}

	/* Mobile responsive styles */
	@media (max-width: 768px) {
		.headerLinks {
			display: none;
		}

		.headerMenu {
			display: block;
		}
	}
</style>
