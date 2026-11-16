import type { Writable } from 'svelte/store';
import { localStorageStore } from './localstore';
import { DEFAULT_CACHE_SIZE_BYTES } from './song-cache/song-cache-common';

const STORAGE_KEY = 'hificoos-settings';

interface Settings {
	scrobble: boolean;
	cacheSizeBytes: number;
}

export const settings: Writable<Settings> = localStorageStore(STORAGE_KEY, {
	scrobble: true,
	cacheSizeBytes: DEFAULT_CACHE_SIZE_BYTES
});
