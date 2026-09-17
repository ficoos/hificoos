<script lang="ts">
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import { Client } from '$lib/navidrome';
	import { get } from 'svelte/store';
	import AlbumGrid from '$lib/components/album-grid.svelte';
	import { credentials } from '$lib/auth.svelte';
	import { getHeaderActions } from '../+layout.svelte';
	import { AlbumsOrderBy } from '$lib/db/database-service';
	import Icon from '$lib/components/icon.svelte';
	import { debounce } from '$lib/debounce';
	const COVER_SIZE = 250;

	let dal: DAL = getDAL();
	let albums: AlbumItem[] = $state([]);
	let orderBy: AlbumsOrderBy = $state(AlbumsOrderBy.RecentlyAdded);
	let filter: string = $state('');
	let forceRefreshTrigger: boolean = $state(true);
	$effect(() => {
		// This is here to retrigger the fetch on reshuffle.
		const _ignor = forceRefreshTrigger;
		dal.albums(orderBy, filter).then((result) => {
			const c = get(credentials);
			let client = new Client(import.meta.env.VITE_NAVIDROME_URL, c);

			albums = result
				.map((a) => {
					a.cover_art = client.getCoverArt(a.cover_art, COVER_SIZE);
					return a;
				})
				.slice(0, 30);
		});
	});
	const headerActions = getHeaderActions();

	dal.db.on('sync-progress', (sp) => {
		if (sp.isDone) {
			forceRefreshTrigger = !forceRefreshTrigger;
		}
	});

	$effect(() => {
		headerActions.actions = header;
		return () => headerActions.clear();
	});
</script>

{#snippet header()}
	<label class="select">
		<span class="label">Sort by</span>
		<select bind:value={orderBy}>
			<option value={AlbumsOrderBy.RecentlyAdded}>Recently added</option>
			<option value={AlbumsOrderBy.ArtistYear}>Artist, Year</option>
			<option value={AlbumsOrderBy.Title}>Title</option>
			<option value={AlbumsOrderBy.Random}>Random</option>
		</select>
	</label>
	{#if orderBy == AlbumsOrderBy.Random}
		<button class="btn btn-outline" onclick={() => (forceRefreshTrigger = !forceRefreshTrigger)}>
			Reshuffle
		</button>
	{/if}
	<label class="input ml-10">
		<Icon class="text-xl">Search</Icon>
		<input
			oninput={debounce((ev: Event) => {
				const tgt = ev.target! as HTMLInputElement;
				filter = tgt.value;
			}, 100)}
			type="search"
			required
			placeholder="Search"
		/>
	</label>
{/snippet}

<AlbumGrid {albums} coverSize={COVER_SIZE} />
