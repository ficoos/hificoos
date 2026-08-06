<script lang="ts">
	import { getCredentials, setCredentials } from '$lib/auth.svelte';
	import { Client } from '$lib/navidrome';
	const existing = getCredentials();

	let username = $state($existing.username ?? '');
	let password = $state($existing.password ?? '');
	let status = $state('');
	let alertClass = $state('');

	function handleSubmit() {
		setCredentials({ username, password });
	}

	$effect(() => {
		const client = new Client(import.meta.env.VITE_NAVIDROME_URL, { username, password });
		status = 'Checking...';
		alertClass = 'alert-natural';
		client
			.ping()
			.then(() => {
				status = 'Connected!';
				alertClass = 'alert-success';
			})
			.catch((e) => {
				status = `${e}`;
				alertClass = 'alert-error';
			});
	});
</script>

<h3 class="text-lg font-bold">Authentication Settings</h3>
<p class="py-4">Please enter authentication information</p>
<fieldset class="fieldset">
	<label class="label" for="name">Username</label>
	<input type="text" id="name" bind:value={username} placeholder="Username" class="input" />
</fieldset>
<fieldset class="fieldset">
	<label class="label" for="password">Password</label>
	<input type="password" id="password" bind:value={password} placeholder="Password" class="input" />
</fieldset>
{#if status.length > 0}
	<div role="alert" class="alert {alertClass}">
		<!-- TODO: Add icon-->
		<span>{status}</span>
	</div>
{/if}
<div class="modal-action">
	<form method="dialog">
		<button type="submit" class="btn btn-secondary">Cancel</button>
	</form>
	<form method="dialog" onsubmit={handleSubmit}>
		<button type="submit" class="btn btn-primary">Save</button>
	</form>
</div>
