<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="navbar bg-base-100 shadow-sm">
  <div class="flex-none">
  <!-- Start aligned content -->
  </div>
  <div class="flex-1">
    <a class="btn btn-ghost text-xl" href={resolve("/")}>HiFiCoos</a>
  </div>
  <div class="flex-none">
  <!-- End aligned content -->
  </div>
</div>
{@render children()}
