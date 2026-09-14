<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { credentials } from '$lib/auth.svelte';
	import { Client } from '$lib/navidrome';
	import { get } from 'svelte/store';
	const existing = get(credentials);

	let username = $state(existing.username ?? '');
	let password = $state(existing.password ?? '');
	let status = $state('');
	let alertClass = $state('');

	function handleSubmit() {
        // TODO: We probably want to clear out all the caches when this changes.
		credentials.set({ username, password });
		goto(resolve('/'));
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

<div class="m-auto flex w-200 flex-1 overflow-hidden">
	<main class="flex-1 overflow-y-auto p-2">
		<h3 class="text-lg font-bold">Authentication Settings</h3>
		<p class="py-4">Please enter authentication information</p>
		<fieldset class="fieldset">
			<label class="label" for="name">Username</label>
			<input
				type="text"
				id="name"
				bind:value={username}
				placeholder="Username"
				class="input w-1/1"
			/>
		</fieldset>
		<fieldset class="fieldset">
			<label class="label" for="password">Password</label>
			<input
				type="password"
				id="password"
				bind:value={password}
				placeholder="Password"
				class="input w-1/1"
			/>
		</fieldset>
		{#if status.length > 0}
			<div role="alert" class="alert {alertClass}">
				<!-- TODO: Add icon-->
				<span>{status}</span>
			</div>
		{/if}
		<div class="modal-action">
			<form method="dialog">
				<button type="submit" class="btn btn-secondary" onclick={() => goto(resolve('/'))}
					>Cancel
				</button>
			</form>
			<form method="dialog" onsubmit={handleSubmit}>
				<button type="submit" class="btn btn-primary">Save</button>
			</form>
		</div>
	</main>
</div>
