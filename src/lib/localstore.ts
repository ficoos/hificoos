import { writable } from 'svelte/store';

export function localStorageStore<T>(key: string, initialValue: T) {
  const isBrowser = typeof window !== 'undefined';
  const storedValue = isBrowser ? localStorage.getItem(key) : null;
  
  const data = storedValue ? JSON.parse(storedValue) as T : initialValue;
  const store = writable(data);

  if (isBrowser) {
    store.subscribe((value) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}