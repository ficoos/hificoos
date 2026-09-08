<script lang="ts">
	import { formatSongDuration } from '$lib/formatutils';
	import { playerControl, playQueue } from '$lib/player-service.svelte';
	import { SongAvailability } from '$lib/song-cache/song-cache-service';
</script>

<ul class="list rounded-box bg-base-100 shadow-md">
	{#each $playQueue.queue as item, index (index)}
		<li
			class="group list-row border p-1 {index === $playQueue.currentTrack
				? 'border-accent bg-accent-content'
				: 'border-transparent'}"
		>
			<div>
				<img crossorigin="" class="size-15" alt={item.album_name} src={item.cover_art} />
			</div>
			<div class="flex min-w-0 flex-col justify-center">
				<div class="cursor-default truncate text-ellipsis">{item.title}</div>
				<div class="cursor-default truncate text-xs text-ellipsis opacity-60">
					{item.display_artist} ● {item.album_name}
				</div>
				<div class="cursor-default truncate text-xs text-ellipsis opacity-60 inline-flex align-center">
					<span class="material-symbols-outlined align-middle text-xs!">Schedule</span>
					{formatSongDuration(item.duration)}
				</div>
			</div>
			<button
				class="btn hidden btn-square btn-ghost group-hover:flex"
				onclick={() => playerControl.play(index)}
			>
				<span class="material-symbols-outlined pr-1 align-middle">play_arrow</span>
			</button>
			<button
				class="btn hidden btn-square btn-ghost group-hover:flex"
				onclick={() => playerControl.playlistRemove(index)}
			>
				<span class="material-symbols-outlined pr-1 align-middle">delete</span>
			</button>
		</li>
	{/each}
</ul>
