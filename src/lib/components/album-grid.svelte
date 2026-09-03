<script lang="ts">
	import { getDAL, type AlbumItem } from '$lib/database.svelte';
	import { currentTrack, playerControl } from '$lib/player-service.svelte';
	import { get } from 'svelte/store';

	let { albums, coverSize }: { albums: AlbumItem[]; coverSize: number } = $props();

	function formatDuration(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	let dal = getDAL();

	async function playAlbum(album: AlbumItem) {
		playerControl.playlistClear();
		await appendAlbum(album);
		playerControl.play();
	}

	async function queueAlbum(album: AlbumItem) {
		playerControl.playlistInsert(await dal.albumSongs(album.id), get(currentTrack));
	}

	async function appendAlbum(album: AlbumItem) {
		await playerControl.playlistInsert(await dal.albumSongs(album.id));
	}
</script>

<div class="m-auto flex flex-wrap items-start justify-start">
	{#each albums as album (album.id)}
		<div class="group image-full" style={`max-width: ${coverSize}px;`}>
			<figure>
				<img
					class="object-contain filter-none"
					style={`min-width:${coverSize}px;min-height:${coverSize}px;max-width:${coverSize}px;max-height:${coverSize}px`}
					crossorigin=""
					src={album.cover_art}
					alt={album.name}
				/>
			</figure>
			<div
				class="card-body hidden cursor-default rounded-md p-2 group-hover:flex"
				style={`max-width: ${coverSize}px; min-height:${coverSize}`}
			>
				<div
					class="justify-start rounded-md border border-white/80 bg-black/50 p-2 backdrop-blur-md"
				>
					<table>
						<tbody class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
							<tr>
								<td><span class="material-symbols-outlined pr-1 align-middle">artist</span></td>
								<td>
									<div>{album.display_artist}</div>
								</td>
							</tr>
							<tr>
								<td><span class="material-symbols-outlined pr-1 align-middle">album</span></td>
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
						<button
							class="btn btn-square border border-white/80 btn-primary"
							onclick={() => playAlbum(album)}
						>
							<span class="material-symbols-outlined align-middle">play_arrow</span>
						</button>
					</div>
					<div class="tooltip" data-tip="Queue">
						<button
							class="btn btn-square border border-white/80 btn-neutral"
							onclick={() => queueAlbum(album)}
						>
							<span class="material-symbols-outlined align-middle">playlist_play</span>
						</button>
					</div>
					<div class="tooltip" data-tip="Append">
						<button
							class="btn btn-square border border-white/80 btn-neutral"
							onclick={() => appendAlbum(album)}
						>
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
