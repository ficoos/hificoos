<script lang="ts">
	import PlaylistSidebar from '$lib/components/playlist-sidebar.svelte';
	import Player from '$lib/components/player.svelte';

	let { children } = $props();
</script>

<div class="flex flex-1 overflow-hidden">
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
	<aside class="w-120 shrink-0 bg-base-200 px-2">
		<PlaylistSidebar />
	</aside>
</div>
<footer class="flex h-fit shrink-0 items-center bg-gray-800 px-4 text-xs text-white">
	<Player />
</footer>
