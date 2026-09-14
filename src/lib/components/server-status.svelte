<script lang="ts">
	import { resolve } from '$app/paths';
	import { credentials } from '$lib/auth.svelte';
	import { getDAL } from '$lib/database.svelte';
	import type { SyncUpdate } from '$lib/db/database-service';
	import { Client } from '$lib/navidrome';
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
		class="menu dropdown-content z-1 w-52 rounded-box bg-base-100 shadow-sm"
		id="server-popover"
	>
		<li>
			<button
				disabled={!syncProgress.isDone}
				type="button"
				onclick={() => {
					dal.syncDB();
					// @ts-expect-error: Not all elements have blur
					// but we know the active element in this case will have blur
					document.activeElement?.blur();
				}}><Icon class="text-lg">sync</Icon>Sync</button
			>
		</li>
		<li><a href={resolve('/auth')}><Icon class="text-lg">settings</Icon>Settings...</a></li>
	</ul>
</div>
