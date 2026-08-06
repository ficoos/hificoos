<script lang="ts">
	import { Client } from '$lib/navidrome';
	import { getCredentials } from '$lib/auth.svelte';
	import AuthSettings from './auth-settings.svelte';

	getCredentials().subscribe((creds) => {
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
</script>

<div class="tooltip tooltip-bottom tooltip-end" data-tip={tooltip}>
	<button
		aria-label="Connection Status"
		class="btn btn-square"
		onclick={() => (document.getElementById('auth_settings') as HTMLDialogElement).showModal()}
	>
		<div class="inline-grid *:[grid-area:1/1]">
			<div class="status {animate ? 'animate-ping' : ''} {status}"></div>
			<div class="status {status}"></div>
		</div>
	</button>
	<dialog id="auth_settings" class="modal">
		<div class="modal-box"><AuthSettings /></div>
	</dialog>
</div>
