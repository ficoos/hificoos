<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import 'material-symbols/outlined.css';

	let { children, class: klass }: { children: Snippet<[]>; class?: ClassValue } = $props();
</script>

<span class="matrial-icon align-middle {klass ?? ''}">{@render children()}</span>

<style>
	.matrial-icon {
		font-family: 'Material Symbols Outlined';
		line-height: 1;
		display: inline-block;
		white-space: nowrap;
		word-wrap: normal;
		direction: ltr;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		font-feature-settings: 'liga';
		letter-spacing: normal;
		text-transform: none;
	}
</style>
