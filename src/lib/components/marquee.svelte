<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	let { children, class: klass }: { children: Snippet<[]>; class?: ClassValue } = $props();
</script>

<div class={'marquee ' + klass}>
	<div class="marquee-inner">
		{@render children()}
	</div>
</div>

<style>
	@keyframes marquee-scroll {
		0%,
		10% {
			transform: translateX(0);
		}
		90%,
		100% {
			transform: translateX(min(0px, 100cqw - 100%));
		}
	}

	.marquee {
		container-type: inline-size;
		overflow: hidden;
	}

	.marquee-inner {
		display: inline-block;
		min-width: 100%;
		white-space: nowrap;
		animation: marquee-scroll 12s linear infinite alternate;
	}

	@media (prefers-reduced-motion: reduce) {
		.marquee-inner {
			animation: none;
		}
	}
</style>
