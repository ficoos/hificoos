<script lang="ts">
	import { getCredentials } from '$lib/auth.svelte';
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import type { SyncUpdate } from '$lib/db/database-service';
	import { Client } from '$lib/navidrome';
	import { get } from 'svelte/store';
	import AlbumGrid from '$lib/components/album-grid.svelte';
	const COVER_SIZE = 250;

	let syncProgress: SyncUpdate = $state({
		isDone: true,
		albumsSynced: 0,
		artistsSynced: 0,
		songsSynced: 0
	});
	let dal: DAL = getDAL();
	dal.db!.on('sync-progress', (payload) => {
		syncProgress = payload;
	});
	let albums: AlbumItem[] = $state([]);
	let creds = getCredentials();
	dal.albums().then((result) => {
		const c = get(creds);
		let client = new Client(import.meta.env.VITE_NAVIDROME_URL, c);

		albums = result
			.map((a) => {
				a.cover_art = client.getCoverArt(a.cover_art, COVER_SIZE);
				return a;
			})
			.slice(0, 30);
	});
</script>

<span>{albums.length}</span>
<div class="m-h-1/1 flex overflow-y-scroll p-2">
	<div class="flex-3">
		<!-- TODO: Move this section to the server status -->
		{#if !syncProgress.isDone}
			<h2>Syncing....</h2>
			<ul>
				<li>Artists: {syncProgress.artistsSynced}</li>
				<li>Albums: {syncProgress.albumsSynced}</li>
				<li>Songs: {syncProgress.songsSynced}</li>
			</ul>
		{/if}
		<button
			class="btn btn-square btn-primary"
			onclick={() => {
				dal.syncDB().finally(() => console.log('dsa'));
			}}>Sync</button
		>
		<!-- end temp -->
		<AlbumGrid {albums} coverSize={COVER_SIZE} />
	</div>
</div>
