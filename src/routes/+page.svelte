<script lang="ts">
	let worker: Worker | null = null;

	$effect(() => {
		worker = new Worker(new URL('$lib/database.ts', import.meta.url), { type: 'module' });

		worker.postMessage({ type: 'init' });

		// Clean up the worker thread when the component unmounts
		return () => {
			worker?.terminate();
		};
	});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
