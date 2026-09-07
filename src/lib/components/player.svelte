<script>
	import {
		playerControl,
		playerPosition,
		PlayerState,
		playerState,
		playQueue
	} from '$lib/player-service.svelte';

	const current = $derived($playQueue.queue.at($playQueue.currentTrack));
</script>

<div class="flex max-lg:flex-col w-full p-2">
	<div class="flex flex-1 flex-row items-center gap-2">
		{#if current}
			<div>
				<img
					crossorigin=""
					class="min-w-20 size-20 border border-accent"
					alt={current.album_name}
					src={current.cover_art}
				/>
			</div>
			<div class="flex min-w-0 flex-col">
				<div class="cursor-default truncate text-xl text-ellipsis">
					{current.title}
				</div>
				<div class="cursor-default truncate text-xl text-ellipsis opacity-60">
					{current.album_name}
				</div>
				<div class="cursor-default truncate text-xl text-ellipsis opacity-60">
					{current.display_artist}
				</div>
			</div>
		{/if}
	</div>
	<div class="flex flex-1 flex-col gap-2">
		<div class="flex flex-row items-center gap-2">
			<span class="cursor-default">00:00</span>
			{#if $playerState === PlayerState.Waiting}
				<progress class="progress progress-primary"></progress>
			{:else}
				<progress
					class="progress progress-primary"
					value={$playerPosition.position}
					max={$playerPosition.duration}
				></progress>
			{/if}
			<span class="cursor-default">00:00</span>
		</div>
		<div class="flex items-center justify-center gap-2">
			<button
				class="btn btn-circle btn-neutral"
				onclick={() => {
					playerControl.play(Math.max($playQueue.currentTrack - 1, 0));
				}}
			>
				<span class="material-symbols-outlined align-middle">skip_previous</span>
			</button>
			{#if $playerState === PlayerState.Paused}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.play()}>
					<span class="material-symbols-outlined align-middle">play_arrow</span>
				</button>
			{:else}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.pause()}>
					<span class="material-symbols-outlined align-middle">pause</span>
				</button>
			{/if}
			<button class="btn btn-circle btn-neutral" onclick={() => playerControl.skipNext()}>
				<span class="material-symbols-outlined align-middle">skip_next</span>
			</button>
		</div>
	</div>
	<div class="flex-1"></div>
</div>
