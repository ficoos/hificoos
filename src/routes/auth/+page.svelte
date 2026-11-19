<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { credentials } from '$lib/auth.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { Client } from '$lib/navidrome';
	import { settings } from '$lib/settings.svelte';
	import { songCache } from '$lib/song-cache.svelte';
	import type { CacheStatus } from '$lib/song-cache/song-cache-service';
	import { BYTES_PER_GIB } from '$lib/song-cache/song-cache-common';
	import { formatBytes } from '$lib/formatutils';
	import { get } from 'svelte/store';
	const existing = get(credentials);

	let username = $state(existing.username ?? '');
	let password = $state(existing.password ?? '');
	let status = $state('');
	let alertClass = $state('');
	let cacheSizeGiB = $state(get(settings).cacheSizeBytes / BYTES_PER_GIB);
	let cacheStatus: CacheStatus | null = $state(null);
	songCache.getStatus().then((s) => (cacheStatus = s));

	function generateRandomSalt(length: number) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	function handleSubmit() {
		// Cached songs belong to the previous user/server.
		if (username !== existing.username || password !== existing.password) {
			songCache.clear(true);
		}
		const salt = generateRandomSalt(8);
		credentials.set({ username, password, salt });
		if (cacheSizeGiB > 0) {
			// A smaller size trims the cache to fit; it doesn't clear it.
			settings.update((s) => ({ ...s, cacheSizeBytes: Math.round(cacheSizeGiB * BYTES_PER_GIB) }));
		}
		goto(resolve('/'));
	}

	$effect(() => {
		const salt = generateRandomSalt(8);
		const client = new Client(import.meta.env.VITE_NAVIDROME_URL, { username, password, salt });
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

<div class="m-auto flex max-w-200 w-1/1 px-5 flex-1">
	<main class="flex-1 overflow-y-auto p-2">
		<h3 class="text-lg font-bold">Settings</h3>
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
		<fieldset class="fieldset">
			<label class="label" for="cache-size">Cache size (GiB)</label>
			<input
				type="number"
				id="cache-size"
				min="0.5"
				step="0.5"
				bind:value={cacheSizeGiB}
				class="input w-1/1"
			/>
			{#if cacheStatus && cacheStatus.effectiveMaxBytes < cacheStatus.maxBytes}
				<p class="label">
					Capped at {formatBytes(cacheStatus.effectiveMaxBytes)} by the browser's storage quota.
				</p>
			{/if}
		</fieldset>
		{#if status.length > 0}
			<div role="alert" class="alert {alertClass}">
				<Icon class="text-2xl">error</Icon>
				<!-- TODO: Add icon-->
				<span>{username.length > 0 ? status : 'Missing username'}</span>
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
