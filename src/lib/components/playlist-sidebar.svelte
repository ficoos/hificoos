<script lang="ts">
	import { formatSongDuration } from '$lib/formatutils';
	import { playerControl, playQueue } from '$lib/player-service.svelte';
	import Icon from './icon.svelte';
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
				<div
					class="align-center inline-flex cursor-default truncate text-xs text-ellipsis opacity-60"
				>
					<Icon class="text-sm">Schedule</Icon>
					{formatSongDuration(item.duration)}
				</div>
			</div>
			<div class="hidden group-hover:flex items-center">
				<button class="btn btn-square btn-ghost" onclick={() => playerControl.play(index)}>
					<Icon class="pr-1 text-2xl">play_arrow</Icon>
				</button>
				<button
					class="btn btn-square btn-ghost"
					onclick={() => playerControl.playlistRemove(index)}
				>
					<Icon class="align-middle">delete</Icon>
				</button>
			</div>
		</li>
	{/each}
</ul>
