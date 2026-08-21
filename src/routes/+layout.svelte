<script lang="ts">
	import 'material-symbols/outlined.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import ServerStatus from '$lib/components/server-status.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="flex h-screen w-full flex-col overflow-hidden">
	<!-- Navbar -->
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-none">
			<!-- Start aligned content -->
		</div>
		<div class="flex-1">
			<a class="btn btn-ghost text-xl" href={resolve('/')}>HiFiCoos</a>
		</div>
		<div class="flex-none">
			<ServerStatus />
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex flex-1 overflow-hidden">
	    <main class="flex-1 overflow-y-auto p-2">
		{@render children()}
		</main>
		<aside class="w-80 shrink-0 overflow-y-auto bg-base-200 p-4">
			<ul class="menu min-h-full">
				<!-- Sidebar content here -->
				<li><a>Sidebar Item 1</a></li>
				<li><a>Sidebar Item 2</a></li>
			</ul>
		</aside>
	</div>
	<footer class="flex h-20 shrink-0 items-center bg-gray-800 px-4 text-xs text-white">
		TODO PLAYER
	</footer>
</div>
