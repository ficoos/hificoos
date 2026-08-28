// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

import { get, writable, type Writable } from 'svelte/store';
import type { SongItem } from './database.svelte';
import { client as nv } from './navidrome-service.svelte';

const PROGRESS_FILE_SUFFIX = '.progress';
const DOWNLOAD_AOT = 3; // How many songs to download ahead of time.

export enum SongAvailability {
	Present = 'present',
	Downloading = 'downloading',
	Missing = 'missing'
}

export interface PlaylistItem extends SongItem {
	availability: SongAvailability;
}

export interface PlayerrState {
	currentTrack: number;
	playlist: PlaylistItem[];
}

// TODO(performance): Sending the entire thing on each update could maybe be expensive.
// If for example I intend to send the state every second to denote the current
// track status, serializing the entire playlist could be needlessly expensive.
// If this becomes and issue, I may want to make all the update fields optional
// and have it so that the API is sending "deltas". I just don't want to deal
// with that right now and I imagine this will be simple enough to add later.
// I do know that at least it will flag typescript errors everywhere I will not
// already do null checks on the fields (which will probably be everyhwere).
type PlayerrStateUpdate = PlayerrState & { type: 'STATE_UPDATE' };

export type Event = PlayerrStateUpdate;

export interface PlaylistClear {
	type: 'PLAYLIST_CLEAR';
}

export interface PlaylistInsert {
	type: 'PLAYLIST_INSERT';
	// The place to insert the items, leave empty for append
	index?: number;
	items: SongItem[];
}

export interface PlaylistRemove {
	type: 'PLAYLIST_REMOVE';
	index: number;
}

export type Command = PlaylistClear | PlaylistInsert | PlaylistRemove;

const state: Writable<PlayerrState> = writable({
	currentTrack: 0,
	playlist: []
});

const activeDownloads = new Map<string, unknown>();

state.subscribe((state) => {
	self.postMessage({ type: 'STATE_UPDATE', ...state } as PlayerrStateUpdate);
	scheduleDownloads(state);
});

self.onmessage = (event: MessageEvent<Command>) => {
	switch (event.data.type) {
		case 'PLAYLIST_CLEAR':
			playlistClear(self, event.data);
			break;
		case 'PLAYLIST_INSERT':
			playlistInsert(self, event.data);
			break;
		case 'PLAYLIST_REMOVE':
			playlistRemove(self, event.data);
			break;
		default:
		// TODO: Is this really the best way to handle this? Can we enfore exhustiveness instead?
		// Ignore
	}
};

function playlistClear(_self: Window, _data: PlaylistClear) {
	state.update((state) => {
		state.playlist = [];
		return state;
	});
}

function playlistRemove(_self: Window, data: PlaylistRemove) {
	state.update((state) => {
		state.playlist.splice(data.index, 1);
		return state;
	});
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(Math.min(n, max), min);
}

async function cleanupSongCache() {
	// Cleanup partially downloaded files
	const songCacheRoot = await getSongCacheDirectoryHandle();
	for await (const entry of songCacheRoot.values()) {
		if (entry.kind !== 'file') {
			// Ignore
			// TODO: This actually shouldn't happen. We probably want to clean that as well.
		}
		if (!entry.name.endsWith(PROGRESS_FILE_SUFFIX)) {
			continue;
		}
		const badFile = entry.name.slice(0, -PROGRESS_FILE_SUFFIX.length);
		// Remove the backing file first in case we crash
		try {
			songCacheRoot.removeEntry(badFile);
		} catch {
			// Ignore
			// TODO: make sure this is NotExists, otherwise we are in a bad state
		}
		songCacheRoot.removeEntry(entry.name);
	}
}

async function getSongCacheDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
	const opfsRoot = await navigator.storage.getDirectory();
	return await opfsRoot.getDirectoryHandle('song-cache', { create: true });
}

async function getCachedSongFileHandle(
	songId: string,
	create: boolean = false
): Promise<FileSystemFileHandle> {
	const songCacheRoot = await getSongCacheDirectoryHandle();
	return await songCacheRoot.getFileHandle(`${songId}`, { create: create });
}

async function createProgressFile(songId: string): Promise<FileSystemFileHandle> {
	const songCacheRoot = await getSongCacheDirectoryHandle();
	return await songCacheRoot.getFileHandle(`${songId}${PROGRESS_FILE_SUFFIX}`, { create: true });
}

async function getSongAvailability(songId: string): Promise<SongAvailability> {
	try {
		await getCachedSongFileHandle(songId);
		if (activeDownloads.has(songId)) {
			return SongAvailability.Downloading;
		}
		return SongAvailability.Present;
	} catch {
		// TODO: Check that it is the error we expect
		return SongAvailability.Missing;
	}
}

async function hydrateItems(items: SongItem[]) {
	return Promise.all(
		items.map(async (item) => ({
			availability: await getSongAvailability(item.id),
			...item
		}))
	);
}

async function playlistInsert(_self: Window, data: PlaylistInsert) {
	const hydratedItems = await hydrateItems(data.items);
	state.update((state) => {
		const index = clamp(data.index ?? state.playlist.length, 0, state.playlist.length);
		if (index >= state.playlist.length) {
			// Append simple path
			state.playlist.push(...hydratedItems);
			return state;
		}
		state.playlist.splice(index, 0, ...hydratedItems);
		if (state.currentTrack >= index) {
			state.currentTrack += index;
		}

		return state;
	});
}

function updateSongAvailabilityState(songId: string, availability: SongAvailability) {
	state.update((state) => {
		for (const item of state.playlist) {
			if (item.id != songId) {
				continue;
			}
			item.availability = availability;
		}
		return state;
	});
}

async function downdloadSong(songId: string) {
	switch (await getSongAvailability(songId)) {
		case SongAvailability.Downloading:
		case SongAvailability.Present:
			return;
	}

	// Register
	activeDownloads.set(songId, {});
	updateSongAvailabilityState(songId, SongAvailability.Downloading);
	try {
		const client = get(nv);
		const response = await client.stream(songId);
		if (!response.ok) {
			throw new Error(`HTTP error: status: ${response.status}`);
		}

		if (!response.body) {
			throw new Error(`Empty body`);
		}

		const cacheDir = await getSongCacheDirectoryHandle();
		// Create this first! Otherwise we may end up in a problematic state.
		// TOOD: Writeup some stuff at the top about how this works for posterity.
		const progressFile = await createProgressFile(songId);
		try {
			const cacheFile = await createProgressFile(songId);
			const w = await cacheFile.createWritable();
			try {
				const r = response.body.getReader();

				await w.truncate(0);
				while (true) {
					const { done, value } = await r.read();

					if (done) {
						break;
					}

					await w.write(value);
				}
			} catch (e) {
				await cacheDir.removeEntry(cacheFile.name);
				throw e;
			} finally {
				await w.close();
			}
		} finally {
			await cacheDir.removeEntry(progressFile.name);
		}
	} catch (e) {
		updateSongAvailabilityState(songId, SongAvailability.Missing);
		throw e;
	} finally {
		activeDownloads.delete(songId);
	}
	// If we reached this point everything went well
	updateSongAvailabilityState(songId, SongAvailability.Present);
}

async function scheduleDownloads(state: PlayerrState) {
	const newItems = await hydrateItems(state.playlist);
	const currentTrack = state.currentTrack;
	const end = Math.min(newItems.length, currentTrack + DOWNLOAD_AOT);
	for (let i = currentTrack; i < end; i++) {
		const item = newItems[i];
		if (item.availability != SongAvailability.Missing) {
			continue;
		}
		downdloadSong(item.id).catch((e) => console.log(e));
	}
}

// Initialize
cleanupSongCache();
