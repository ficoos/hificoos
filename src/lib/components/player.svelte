<script lang="ts">
	import { formatSongDuration } from '$lib/formatutils';
	import {
		playerControl,
		playerPosition,
		PlayerState,
		playerState,
		playQueue
	} from '$lib/player-service.svelte';
	import Icon from './icon.svelte';

	const PLAYER_PROGRESS_ID = 'player-progress';
	const ELEM_ID_ELAPSED_LABEL = 'label-time-elapsed';
	const ELEM_ID_DURATION_LABEL = 'label-time-duration';

	const current = $derived($playQueue.queue.at($playQueue.currentTrack));
	const updateProgress = () => {
		// Even though usually I am all for just updating things that are
		// idempotent. Here we check if the values on the elements have changed
		// before applying because some web layout engines will do a refresh even
		// if nothing changed.
		const pp = $playerPosition;
		const pos = Math.max(pp.position + (playerControl.getCurrentTime() - pp.base), 0);
		const elaplsedElem = document.getElementById(ELEM_ID_ELAPSED_LABEL) as HTMLSpanElement;
		if (elaplsedElem) {
			const elapsedText = formatSongDuration(pos);
			if (elaplsedElem.textContent != elapsedText) {
				elaplsedElem.textContent = elapsedText;
			}
		}
		const durationElem = document.getElementById(ELEM_ID_DURATION_LABEL) as HTMLSpanElement;
		if (durationElem) {
			const durationText = formatSongDuration(pp.duration);
			if (durationElem.textContent != durationText) {
				durationElem.textContent = durationText;
			}
		}

		const progressElem = document.getElementById(PLAYER_PROGRESS_ID) as HTMLProgressElement;
		if (progressElem) {
			if (progressElem.value != pos) {
				progressElem.value = pos;
			}
			if (progressElem.max != pp.duration) {
				progressElem.max = pp.duration;
			}
		}

		window.requestAnimationFrame(updateProgress);
	};

	updateProgress();
</script>

<div class="flex w-full p-2 max-lg:flex-col">
	<div class="flex flex-1 flex-row items-center gap-2">
		{#if current}
			<div>
				<img
					crossorigin=""
					class="size-20 min-w-20 border border-accent"
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
	<div class="flex flex-1 flex-col gap-2 p-2">
		<div class="flex flex-row items-center gap-2">
			<span id={ELEM_ID_ELAPSED_LABEL} class="cursor-default">00:00</span>
			{#if $playerState === PlayerState.Waiting}
				<progress class="progress progress-primary"></progress>
			{:else}
				<progress id={PLAYER_PROGRESS_ID} class="progress progress-primary" value="0"></progress>
			{/if}
			<span id={ELEM_ID_DURATION_LABEL} class="cursor-default">00:00</span>
		</div>
		<div class="flex items-center justify-center gap-2">
			<button
				class="btn btn-circle btn-neutral"
				onclick={() => {
					playerControl.play(Math.max($playQueue.currentTrack - 1, 0));
				}}
			>
				<Icon class="text-xl">skip_previous</Icon>
			</button>
			{#if $playerState === PlayerState.Paused}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.play()}>
					<Icon class="text-4xl">play_arrow</Icon>
				</button>
			{:else}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.pause()}>
					<Icon class="text-4xl">pause</Icon>
				</button>
			{/if}
			<button class="btn btn-circle btn-neutral" onclick={() => playerControl.skipNext()}>
					<Icon class="text-xl">skip_next</Icon>
			</button>
		</div>
	</div>
	<div class="flex-1"></div>
</div>
