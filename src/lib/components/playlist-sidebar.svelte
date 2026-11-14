<script lang="ts">
	import { formatSongDuration } from '$lib/formatutils';
	import { playerControl, playQueue } from '$lib/player-service.svelte';
	import Icon from './icon.svelte';
</script>

<div class="flex flex-col h-1/1">
	<ul class="list overflow-y-auto rounded-box bg-base-100 shadow-md grow">
		{#each $playQueue.queue as item, index (index)}
			<li
				class="group list-row border p-1 {index === $playQueue.currentTrack
					? 'border-accent bg-accent-content'
					: 'border-transparent'}"
			>
				<div>
					<img class="size-15" alt={item.album_name} src={item.cover_art} />
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
				<div class="hidden items-center group-hover:flex">
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
	<div class="join gap-2 my-2">
		<button class="btn join-item btn-neutral" onclick={() => playerControl.playlistClear()}
			><Icon>playlist_remove</Icon>Clear</button
		>
		<button
			class="btn join-item btn-neutral"
			onclick={() => playerControl.playlistShuffle()}><Icon>shuffle</Icon>Shuffle</button
		>
	</div>
</div>
