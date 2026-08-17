<script lang="ts">
	import { DAL, getDAL } from '$lib/database.svelte';

	let dal: DAL = getDAL();
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
<button
	class="btn btn-square btn-primary"
	onclick={() => {
		dal.syncDB().finally(() => console.log('dsa'));
	}}>Sync</button
>
