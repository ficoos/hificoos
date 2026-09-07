<script lang="ts">
	import { playerControl, playQueue } from '$lib/player-service.svelte';
</script>

<ul class="list rounded-box bg-base-100 shadow-md">
	{#each $playQueue.queue as item, index (index)}
		<li
			class="group list-row border {index === $playQueue.currentTrack
				? 'border-accent bg-accent-content'
				: 'border-transparent'}"
		>
			<div>
				<img crossorigin="" class="size-10" alt={item.album_name} src={item.cover_art} />
			</div>
			<div class="flex min-w-0 flex-col">
				<div class="cursor-default truncate text-ellipsis">{item.title} ({item.availability})</div>
				<div class="cursor-default truncate text-xs font-semibold text-ellipsis opacity-60">
					{item.display_artist} ● {item.album_name}
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
