<script lang="ts">
	import { getCredentials } from '$lib/auth.svelte';
	import { DAL, getDAL, type AlbumItem } from '$lib/database.svelte';
	import type { SyncUpdate } from '$lib/db/database-service';
	import { Client } from '$lib/navidrome';
	import { get } from 'svelte/store';
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

	function formatDuration(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}
</script>

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
<div class="flex flex-wrap justify-center">
	{#each albums as album (album.id)}
		<div class="group image-full" style={`max-width: ${COVER_SIZE}px;`}>
			<figure>
				<img
					class="object-contain filter-none"
					style={`min-width:${COVER_SIZE}px;min-height:${COVER_SIZE}px;max-width:${COVER_SIZE}px;max-height:${COVER_SIZE}px`}
					crossorigin=""
					src={album.cover_art}
					alt={album.name}
				/>
			</figure>
			<div
				class="card-body hidden cursor-default rounded-md p-2 group-hover:flex"
				style={`max-width: ${COVER_SIZE}px; min-height:${COVER_SIZE}`}
			>
				<div
					class="justify-start rounded-md border border-white/80 bg-black/50 p-2 backdrop-blur-md"
				>
					<table>
						<tbody class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
							<tr>
								<td><span class="material-symbols-outlined align-middle pr-1">artist</span></td>
								<td>
									<div>{album.display_artist}</div>
								</td>
							</tr>
							<tr>
								<td><span class="material-symbols-outlined align-middle pr-1">album</span></td>
								<td>
									<div>{album.name}</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div class="flex-1 justify-center"></div>
				<div class="flex items-center gap-1 p-2">
					<div class="tooltip" data-tip="Play">
						<button class="btn btn-circle border border-white/80 btn-primary">
							<span class="material-symbols-outlined align-middle">play_arrow</span>
						</button>
					</div>
					<div class="tooltip" data-tip="Queue">
						<button class="btn btn-circle border border-white/80 btn-neutral">
							<span class="material-symbols-outlined align-middle">playlist_play</span>
						</button>
					</div>
					<div class="tooltip" data-tip="Append">
						<button class="btn btn-circle border border-white/80 btn-neutral">
							<span class="material-symbols-outlined align-middle">playlist_add</span>
						</button>
					</div>
					<div class="flex-1"></div>
					<div class="flex flex-col gap-1">
						<div class="badge w-1/1 justify-start border border-white/80">
							<span class="material-symbols-outlined align-middle text-sm!">music_note</span>
							{album.song_count}
						</div>
						<div class="badge w-1/1 justify-start border border-white/80">
							<span class="material-symbols-outlined align-middle text-sm!">hourglass</span>
							{formatDuration(album.duration)}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
