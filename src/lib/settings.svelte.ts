import type { Writable } from 'svelte/store';
import { localStorageStore } from './localstore';

const STORAGE_KEY = 'hificoos-settings';

interface Settings {
    scrobble: boolean
}

export const settings: Writable<Settings> = localStorageStore(STORAGE_KEY, {scrobble: true});
