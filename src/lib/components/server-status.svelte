<script lang="ts">
	import { resolve } from '$app/paths';
	import { credentials } from '$lib/auth.svelte';
	import { getDAL } from '$lib/database.svelte';
	import type { SyncUpdate } from '$lib/db/database-service';
	import { Client } from '$lib/navidrome';
	import { settings } from '$lib/settings.svelte';
	import { songCache } from '$lib/song-cache.svelte';
	import type { CacheStatus } from '$lib/song-cache/song-cache-service';
	import { formatBytes } from '$lib/formatutils';
	import Icon from './icon.svelte';

	credentials.subscribe((creds) => {
		let client = new Client(import.meta.env.VITE_NAVIDROME_URL, creds);
		client
			.ping()
			.then(() => {
				tooltip = 'Connected';
				status = 'status-success';
				animate = false;
			})
			.catch((e) => {
				tooltip = `${e}`;
				status = 'status-error';
				animate = false;
			});
	});

	let tooltip = $state('Connecting');
	let status = $state('status-neutral');
	let animate = $state(true);

	let dal = getDAL();

	let syncProgress: SyncUpdate = $state({
		isDone: true,
		albumsSynced: 0,
		artistsSynced: 0,
		songsSynced: 0
	});
	dal.db!.on('sync-progress', (payload) => {
		syncProgress = payload;
	});

	let cacheStatus: CacheStatus = $state({
		maxBytes: 0,
		songCount: 0,
		usedBytes: 0,
		effectiveMaxBytes: 0
	});
	songCache.getStatus().then((s) => (cacheStatus = s));
	songCache.on('status-changed', (s) => (cacheStatus = s));
</script>

<div class="dropdown dropdown-end">
	<div class="tooltip tooltip-bottom tooltip-end" data-tip={tooltip}>
		<div tabindex="0" role="button" aria-label="Connection Status" class="btn btn-square">
			<div class="inline-grid *:[grid-area:1/1]">
				<div class="status {animate ? 'animate-ping' : ''} {status}"></div>
				<div class="status {status}"></div>
			</div>
		</div>
	</div>
	<ul
		tabindex="-1"
		class="menu dropdown-content z-1 w-64 rounded-box bg-base-100 shadow-sm"
		id="server-popover"
	>
		<li>
			<button
				disabled={!syncProgress.isDone}
				class="group flex"
				type="button"
				onclick={() => {
					dal.syncDB();
					// @ts-expect-error: Not all elements have blur
					// but we know the active element in this case will have blur
					document.activeElement?.blur();
				}}
				><span class="flex-2"><Icon class="pr-2 text-lg">sync</Icon>Sync</span><span
					class="loading hidden loading-xs loading-spinner group-disabled:inline-block"
				></span></button
			>
		</li>
		<li>
			<div
				class="flex flex-col items-stretch gap-1 cursor-default"
				title={cacheStatus.effectiveMaxBytes < cacheStatus.maxBytes
					? 'Capped by browser storage quota'
					: undefined}
			>
				<span class="flex">
					<Icon class="pr-2 text-lg">storage</Icon>Cache {formatBytes(cacheStatus.usedBytes)} / {formatBytes(
						cacheStatus.effectiveMaxBytes
					)}
				</span>
				<progress
					class="progress w-full"
					value={cacheStatus.usedBytes}
					max={cacheStatus.effectiveMaxBytes}
				></progress>
			</div>
		</li>
		<li>
			<button type="button" onclick={() => songCache.clear()}>
				<Icon class="text-lg">delete</Icon>Clear cache
			</button>
		</li>
		<li><a href={resolve('/auth')}><Icon class="text-lg">settings</Icon>Settings...</a></li>
		<li>
			<label class="flex">
				<span class="flex-2"><Icon class="pr-2 text-lg">publish</Icon>Scrobble</span>
				<input type="checkbox" bind:checked={$settings.scrobble} class="toggle" />
			</label>
		</li>
	</ul>
</div>
