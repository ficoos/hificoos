<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	const { needRefresh, updateServiceWorker, offlineReady } = useRegisterSW({
		onRegistered(r) {
			// uncomment following code if you want check for updates
			// r && setInterval(() => {
			//   console.log('Checking for sw update')
			//   r.update()
			// }, 20000 /* 20s for testing purposes */)
			console.log(`SW Registered: ${r}`);
		},
		onRegisterError(error) {
			console.log('SW registration error', error);
		}
	});
	const close = () => {
		offlineReady.set(false);
		needRefresh.set(false);
	};
	const toast = $derived($offlineReady || $needRefresh);
</script>

{#if toast}
	<div class="toast toast-end toast-bottom" role="alert">
		<div class="alert alert-info">
			{#if $offlineReady}
				<span> App ready to work offline </span>
			{:else}
				<span> An update is available available, click on reload button to update. </span>
			{/if}
			{#if $needRefresh}
				<button class="btn btn-primary" onclick={() => updateServiceWorker(true)}> Reload </button>
			{/if}
			<button class="btn" onclick={close}> Close </button>
		</div>
	</div>
{/if}
