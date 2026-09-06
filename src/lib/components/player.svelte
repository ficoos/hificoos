<script>
	import {
		playerControl,
		playerPosition,
		PlayerState,
		playerState
	} from '$lib/player-service.svelte';
</script>

<div class="flex w-full p-2">
	<div class="flex-1"></div>
	<div class="flex flex-2 flex-col gap-2">
		<div class="flex flex-row items-center gap-2">
			<span class="cursor-default">00:00</span>
			{#if $playerState === PlayerState.Waiting}
				<progress
					class="progress progress-primary"
				></progress>
			{/if}
			{#if $playerState !== PlayerState.Waiting}
				<progress
					class="progress progress-primary"
					value={$playerPosition.position}
					max={$playerPosition.duration}
				></progress>
			{/if}
			<span class="cursor-default">00:00</span>
		</div>
		<div class="flex items-center justify-center gap-2">
			<button class="btn btn-circle btn-neutral">
				<span class="material-symbols-outlined align-middle">skip_previous</span>
			</button>
			{#if $playerState === PlayerState.Paused}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.play()}>
					<span class="material-symbols-outlined align-middle">play_arrow</span>
				</button>
			{/if}
			{#if $playerState !== PlayerState.Paused}
				<button class="btn btn-circle btn-primary btn-xl" onclick={() => playerControl.pause()}>
					<span class="material-symbols-outlined align-middle">pause</span>
				</button>
			{/if}
			<button class="btn btn-circle btn-neutral">
				<span class="material-symbols-outlined align-middle">skip_next</span>
			</button>
		</div>
	</div>
	<div class="flex-1"></div>
</div>
