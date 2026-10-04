<script lang="ts">
	import { onMount } from 'svelte';
	import type { HTMLImgAttributes } from 'svelte/elements';

	const props: {
		src: string;
		alt?: HTMLImgAttributes['alt'];
		class?: HTMLImgAttributes['class'];
		style?: HTMLImgAttributes['style'];
		crossorigin?: HTMLImgAttributes['crossorigin'];
	} = $props();

	let rootElement: HTMLImageElement | undefined;

	async function fetchImageWithBackoff(url: string, retries: number = 5, delay: number = 1_000) {
		for (let i = 0; i < retries; i++) {
			try {
				const response = await fetch(url);
				if (response.status === 429) {
					// Check for Retry-After header or double the delay (exponential backoff)
					const retryAfter = response.headers.get('Retry-After');
					const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1_000 : delay * Math.pow(2, i);
					await new Promise((resolve) => setTimeout(resolve, waitTime));
					continue;
				}
				if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

				const blob = await response.blob();
				return URL.createObjectURL(blob);
			} catch (error) {
				if (i === retries - 1) throw error;
				await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
			}
		}
	}

	const intersectionCallback = (
		_entries: IntersectionObserverEntry[],
		observer: IntersectionObserver
	): void => {
		setTimeout(() => {
			if (!rootElement) {
				return;
			}

            // TODO: Handle errors
			fetchImageWithBackoff(props.src).then((blob) => {
				if (!rootElement) {
					return;
				}
				isLoaded = true;
				rootElement.src = blob!;
			});
		}, 200);
		observer.disconnect();
	};

	let isLoaded = $state(false);

	onMount(() => {
		const options = {
			rootMargin: '0px',
			scrollMargin: '0px',
			threshold: 1.0
		};
		const observer = new IntersectionObserver(intersectionCallback, options);
		observer.observe(rootElement!);
	});
</script>

<img
	bind:this={rootElement}
	alt={props.alt}
	class={`${props.class} ${isLoaded ? '' : 'skeleton'}`}
	crossorigin={props.crossorigin}
	style={props.style}
/>
