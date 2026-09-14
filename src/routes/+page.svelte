<script lang="ts">
	import { goto } from '$app/navigation';
	import { credentials } from '$lib/auth.svelte';
	import { resolve } from '$app/paths';

	import { get } from 'svelte/store';

	const creds = get(credentials);
	const redirectTo = creds.username.trim().length == 0 ? resolve('/auth') : resolve('/player');
	goto(redirectTo);
</script>

<div><!--TODO: add large app icon--></div>
