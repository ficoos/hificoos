import type { Writable } from 'svelte/store';
import { localStorageStore } from './localstore';
import type { Credentials } from './navidrome';

const STORAGE_KEY = 'hificoos-navidrome-creds';

export const credentials: Writable<Credentials> = localStorageStore(STORAGE_KEY, {username: '', password: ''});
