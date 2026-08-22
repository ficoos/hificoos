import { get, type Writable } from 'svelte/store';
import Player from '$lib/player?worker';
import type { Event, PlaylistClear, PlaylistInsert, PlaylistItem, PlaylistRemove } from './player';
import type { SongItem } from './database.svelte';
import { localStorageStore } from './localstore';

export const currentTrack: Writable<number | null> = localStorageStore(
	'hificoos-current-track',
	null
);
export const playlist: Writable<PlaylistItem[]> = localStorageStore('hificoos-playlist', []);
const workerInstance = new Player();

workerInstance.onmessage = (event: MessageEvent<Event>) => {
	console.log(event.data.type);
	switch (event.data.type) {
		case 'STATE_UPDATE':
			playlist.set(event.data.playlist);
			currentTrack.set(event.data.currentTrack);
	}
};

export const playerControl = {
	playlistClear: () => workerInstance.postMessage({ type: 'PLAYLIST_CLEAR' } as PlaylistClear),
	playlistInsert: (items: SongItem[], index: number | null = null) =>
		workerInstance.postMessage({ type: 'PLAYLIST_INSERT', items, index } as PlaylistInsert),
	playlistRemove: (index: number) =>
		workerInstance.postMessage({ type: 'PLAYLIST_REMOVE', index: index } as PlaylistRemove)
};

// Restore state on "boot"
playerControl.playlistClear();
playerControl.playlistInsert(get(playlist));
// TODO: set current track
