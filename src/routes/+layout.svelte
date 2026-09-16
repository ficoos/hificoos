<script module>
	const HeaderContextKey = 'header-context-key';
	export const getHeaderActions = () => getContext(HeaderContextKey) as HeaderActions;
</script>

<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ServerStatus from '$lib/components/server-status.svelte';
	import { getContext, setContext } from 'svelte';
	import { HeaderActions } from '$lib/header-actions.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { onMount } from 'svelte';
	console.log('PWA INFO', pwaInfo);

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(r) {
					// uncomment following code if you want check for updates
					// r && setInterval(() => {
					//    console.log('Checking for sw update')
					//    r.update()
					// }, 20000 /* 20s for testing purposes */)
					console.log(`SW Registered: ${r}`);
				},
				onRegisterError(error) {
					console.log('SW registration error', error);
				}
			});
		}
	});

	const webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	let { children } = $props();

	const headerActions = new HeaderActions();

	setContext(HeaderContextKey, headerActions);
</script>

<svelte:head>
	<title>HiFicoos</title>
	<link rel="icon" href={favicon} />

	{@html /* eslint-disable-line */ webManifestLink}
</svelte:head>
<div class="flex h-screen w-full flex-col overflow-hidden">
	<!-- Navbar -->
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-none">
			<!-- Start aligned content -->
		</div>
		<div class="mr-10 flex-0">
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

{#await import('$lib/ReloadPrompt.svelte') then { default: ReloadPrompt }}
	<ReloadPrompt />
{/await}
