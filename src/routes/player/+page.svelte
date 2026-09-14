<script lang="ts">
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import { Client } from '$lib/navidrome';
	import { get } from 'svelte/store';
	import AlbumGrid from '$lib/components/album-grid.svelte';
	import { credentials } from '$lib/auth.svelte';
	const COVER_SIZE = 250;

	let dal: DAL = getDAL();
	let albums: AlbumItem[] = $state([]);
	dal.albums().then((result) => {
		const c = get(credentials);
		let client = new Client(import.meta.env.VITE_NAVIDROME_URL, c);

		albums = result
			.map((a) => {
				a.cover_art = client.getCoverArt(a.cover_art, COVER_SIZE);
				return a;
			})
			.slice(0, 30);
	});
</script>

<div class="m-h-1/1 flex overflow-y-scroll p-2">
	<AlbumGrid {albums} coverSize={COVER_SIZE} />
</div>
