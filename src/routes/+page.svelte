<script lang="ts">
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import type { SyncUpdate } from '$lib/db/database-service';

	let syncProgress: SyncUpdate = $state({
		type: 'SYNC',
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
	dal.albums().then((result) => {
		albums = result;
	});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
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
<span>{albums.length}</span>
<ul>
	{#each albums as album (album.id)}
		<li>{album.display_artist} - {album.name}</li>
	{/each}
</ul>
