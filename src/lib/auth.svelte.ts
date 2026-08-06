import type { Writable } from 'svelte/store';
import { localStorageStore } from './localstore';
import type { Credentials } from './navidrome';

const STORAGE_KEY = 'hificoos-navidrome-creds';

const credentials: Writable<Credentials> = localStorageStore(STORAGE_KEY, {username: '', password: ''});

export function getCredentials() {
	return credentials;
}

export function setCredentials(newCreds: Credentials) {
	credentials.set(newCreds);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(newCreds));
}
