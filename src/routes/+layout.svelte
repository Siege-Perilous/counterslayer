<script lang="ts">
	import './layout.css';
	import { dev } from '$app/environment';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={dev ? '/favicon-dev.svg' : '/favicon.svg'} />
</svelte:head>
{@render children()}
