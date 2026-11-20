<script lang="ts">
	import { formatSongDuration } from '$lib/formatutils';
	import { playerControl, playQueue, type PlayQueueItem } from '$lib/player-service.svelte';
	import Icon from './icon.svelte';

	const EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

	let draggingItem: PlayQueueItem | null = $state(null);
	let draggingItemId: string | null = $state(null);
	let draggingItemIndex: number | null = $state(null);

	let hoveredItemIndex: number | null = $state(null);

	$effect(() => {
		if (draggingItem === null) {
			return;
		}
		if (draggingItemId === null) {
			return;
		}
		if (draggingItemIndex === null) {
			return;
		}
		if (hoveredItemIndex === null) {
			// TODO: We need to handle hovering over the empty space which should just be appending
			return;
		}

		if (draggingItemIndex === hoveredItemIndex) {
			return;
		}

		// TODO: This will trigger caching requests every time we pass the current track
		if (draggingItemIndex < hoveredItemIndex) {
			for (let i = draggingItemIndex; i < hoveredItemIndex; i++) {
				playerControl.swap(i, i + 1);
			}
		} else {
			for (let i = draggingItemIndex; i > hoveredItemIndex; i--) {
				playerControl.swap(i, i - 1);
			}
		}

		draggingItemIndex = hoveredItemIndex;
	});
</script>

<div class="flex h-1/1 flex-col">
	<ul class="list grow overflow-y-auto rounded-box bg-base-100 shadow-md">
		{#each $playQueue.queue as item, index (index)}
			<li
				draggable="true"
				class="group list-row border p-1
					{item.id === draggingItemId ? 'ms-5 ' : 'transition-[margin]'}
					{index !== $playQueue.currentTrack && item.id === draggingItemId
					? 'border-info'
					: 'border-transparent'}
					{index === $playQueue.currentTrack
					? 'border-accent bg-accent-content hover:border-accent/70 hover:bg-accent-content/70'
					: 'hover:bg-base-300'}"
				ondragstart={(e) => {
					if (!(e.target instanceof HTMLLIElement)) {
						return;
					}

					draggingItem = item;
					draggingItemIndex = index;
					draggingItemId = item.id;

					if (e.dataTransfer) {
						const img = document.createElement('img');
						img.src = EMPTY_GIF;

						e.dataTransfer.setDragImage(img, 0, 0);
					}
				}}
				ondragover={(_e) => {
					hoveredItemIndex = index;
				}}
				ondragend={(_e) => {
					draggingItemId = null; // makes item visible
					hoveredItemIndex = null; // prevents instant swap
				}}
			>
				<div class="cursor-grab">
					<img class="size-15" alt={item.album_name} src={item.cover_art} draggable="false" />
				</div>
				<div class="flex min-w-0 flex-col justify-center">
					<div class="cursor-default truncate text-ellipsis">{item.title}</div>
					<div class="cursor-default truncate text-xs text-ellipsis opacity-60">
						{item.display_artist} ● {item.album_name}
					</div>
					<div class="flex gap-2">
						{#if item.disc_number > 0}
							<div class="badge cursor-default items-center badge-soft badge-info">
								<Icon class="text-base">album</Icon>
								<span class="truncate font-mono text-xs text-ellipsis">{item.disc_number}</span>
							</div>
						{/if}
						<div class="badge cursor-default items-center badge-soft badge-info">
							<Icon class="text-base">music_note</Icon>
							<span class="truncate font-mono text-xs text-ellipsis">{item.track}</span>
						</div>
						<div class="badge cursor-default items-center badge-soft badge-info">
							<Icon class="text-base">Schedule</Icon>
							<span class="truncate font-mono text-xs text-ellipsis"
								>{formatSongDuration(item.duration)}</span
							>
						</div>
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
	<div class="join my-2 gap-2">
		<button class="btn join-item btn-neutral" onclick={() => playerControl.playlistClear()}
			><Icon>playlist_remove</Icon>Clear</button
		>
		<button class="btn join-item btn-neutral" onclick={() => playerControl.playlistShuffle()}
			><Icon>shuffle</Icon>Shuffle</button
		>
	</div>
</div>
