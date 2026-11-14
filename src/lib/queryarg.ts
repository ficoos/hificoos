import { writable, type Writable } from 'svelte/store';

export function queryparam<T>(
	name: string,
	parser: (value: string | null) => T,
	encoder: (value: T) => string | null
): Writable<T> {
	const params = new URLSearchParams(window.location.search);
	const param = params.get(name);
	const data = parser(param);
	const store = writable(data);
	store.subscribe((nv) => {
		const url = new URL(window.location.href);

		const newValue = encoder(nv);
		if (newValue) {
			url.searchParams.set(name, newValue);
		} else {
			url.searchParams.delete(name);
		}
		window.history.replaceState({}, '', url);
	});
    store.set(data); // Force sync

	return store;
}
