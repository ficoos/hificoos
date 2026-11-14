<script lang="ts">
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import { Client } from '$lib/navidrome';
	import { get, type Writable } from 'svelte/store';
	import AlbumGrid from '$lib/components/album-grid.svelte';
	import { credentials } from '$lib/auth.svelte';
	import { getHeaderActions } from '../+layout.svelte';
	import { AlbumsOrderBy } from '$lib/db/database-service';
	import Icon from '$lib/components/icon.svelte';
	import { debounce } from '$lib/debounce';
	import { queryparam } from '$lib/queryarg';
	const COVER_SIZE = 250;

	let dal: DAL = getDAL();
	let albums: AlbumItem[] = $state([]);
	// TODO: do it smarter since this is easy to mess up later with all the raw strings
	let orderBy: Writable<AlbumsOrderBy> = queryparam(
		'sort-by',
		(val) => {
			switch (val) {
				case 'recently-added':
					return AlbumsOrderBy.RecentlyAdded;
				case 'artist-year':
					return AlbumsOrderBy.ArtistYear;
				case 'title':
					return AlbumsOrderBy.Title;
				case 'random':
					return AlbumsOrderBy.Random;
			}

			return AlbumsOrderBy.RecentlyAdded;
		},
		(val) => {
			switch (val) {
				case AlbumsOrderBy.RecentlyAdded:
					return 'recently-added';
				case AlbumsOrderBy.ArtistYear:
					return 'artist-year';
				case AlbumsOrderBy.Title:
					return 'title';
				case AlbumsOrderBy.Random:
					return 'random';
				default:
					return 'recently-added';
			}
		}
	);
	let filter: string = $state('');
	let forceRefreshTrigger: boolean = $state(true);
	$effect(() => {
		// This is here to retrigger the fetch on reshuffle.
		const _ignor = forceRefreshTrigger;
		dal.albums($orderBy, filter).then((result) => {
			const c = get(credentials);
			let client = new Client(import.meta.env.VITE_NAVIDROME_URL, c);

			albums = result.map((a) => {
				a.cover_art = client.getCoverArt(a.cover_art, COVER_SIZE);
				return a;
			});
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
		<select bind:value={$orderBy}>
			<option value={AlbumsOrderBy.RecentlyAdded}>Recently added</option>
			<option value={AlbumsOrderBy.ArtistYear}>Artist, Year</option>
			<option value={AlbumsOrderBy.Title}>Title</option>
			<option value={AlbumsOrderBy.Random}>Random</option>
		</select>
	</label>
	{#if $orderBy == AlbumsOrderBy.Random}
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
