import { writable } from 'svelte/store';

export function localStorageStore<T>(key: string, initialValue: T) {
	const isBrowser = typeof window !== 'undefined';
	const storedValue = isBrowser ? localStorage.getItem(key) : null;

	const parsed = storedValue ? (JSON.parse(storedValue) as T) : initialValue;
	// Fill in fields that were added to the defaults after the value was stored.
	const data =
		isPlainObject(initialValue) && isPlainObject(parsed) ? { ...initialValue, ...parsed } : parsed;
	const store = writable(data);

	if (isBrowser) {
		store.subscribe((value) => {
			localStorage.setItem(key, JSON.stringify(value));
		});
	}

	return store;
}

function isPlainObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
