<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ServerStatus from '$lib/components/server-status.svelte';

	let { children } = $props();
</script>

<svelte:head><title>HiFiCoos</title><link rel="icon" href={favicon} /></svelte:head>
<div class="flex h-screen w-full flex-col overflow-hidden">
	<!-- Navbar -->
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-none">
			<!-- Start aligned content -->
		</div>
		<div class="flex-1">
			<span class="btn cursor-default btn-ghost text-xl">
				<img src={favicon} alt="app-icon" class="size-5" />HiFiCoos
			</span>
		</div>
		<div class="flex-none">
			<ServerStatus />
		</div>
	</div>

	{@render children()}
</div>
