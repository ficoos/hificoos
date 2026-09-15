<script module>
	const HeaderContextKey = 'header-context-key';
	export const getHeaderActions = (): HeaderActions => getContext(HeaderContextKey);
</script>

<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ServerStatus from '$lib/components/server-status.svelte';
	import { getContext, setContext } from 'svelte';
	import { HeaderActions } from '$lib/header-actions.svelte';

	let { children } = $props();

	const headerActions = new HeaderActions();

	setContext(HeaderContextKey, headerActions);
</script>

<svelte:head><title>HiFiCoos</title><link rel="icon" href={favicon} /></svelte:head>
<div class="flex h-screen w-full flex-col overflow-hidden">
	<!-- Navbar -->
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-none">
			<!-- Start aligned content -->
		</div>
		<div class="flex-0 mr-10">
			<span class="btn cursor-default btn-ghost text-xl">
				<img src={favicon} alt="app-icon" class="size-5" />HiFiCoos
			</span>
		</div>
		<div class="flex-2">
			{#if headerActions.actions}
				{@render headerActions.actions()}
			{/if}
		</div>
		<div class="flex-none">
			<ServerStatus />
		</div>
	</div>

	{@render children()}
</div>
