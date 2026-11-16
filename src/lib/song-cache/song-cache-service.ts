// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import type { Hub, Service } from 'tab-election/hub';
import { DEFAULT_CACHE_SIZE_BYTES, getSongCacheDirectoryHandle } from './song-cache-common';
import { Client, type Credentials } from '$lib/navidrome';

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

export enum SongAvailability {
	Present = 'present',
	Downloading = 'downloading',
	Missing = 'missing'
}

let requestId = 0;

const PROGRESS_FILE_SUFFIX = '.progress';
// Use at most this fraction of the storage the browser lets us have.
const QUOTA_HEADROOM = 0.9;
const activeDownloads = new Map<string, number>();

export interface CacheStatus {
	usedBytes: number;
	maxBytes: number;
	effectiveMaxBytes: number;
	songCount: number;
}

interface CacheEntry {
	size: number;
	lastUsed: number;
}

interface SongCacheEvents {
	'availability-changed': {
		availability: SongAvailability;
		songId: string;
	};
	'status-changed': CacheStatus;
	// Asks every tab to re-send its pinned songs (see setPinned).
	'pins-requested': Record<string, never>;
}

export class SongCacheService implements Service {
	readonly namespace = 'hificoos-song-cache' as const;
	readonly __events?: SongCacheEvents;
	private hub?: Hub;
	private index = new Map<string, CacheEntry>();
	private usedBytes = 0;
	private maxBytes = DEFAULT_CACHE_SIZE_BYTES;
	private effectiveMaxBytes = DEFAULT_CACHE_SIZE_BYTES;
	// Songs each tab is using (current + prefetch window), keyed by tab. The
	// merged set is never evicted or cleared, so we don't delete a file a player
	// may be reading. Entries of closed tabs linger until the next leader.
	private pinnedByTab = new Map<string, Set<string>>();
	// Songs whose download failed this session. Not retried automatically, to
	// avoid a retry loop (failure -> availability change -> queue update -> retry).
	private failedSongs = new Set<string>();
	private nv: Client = new Client(import.meta.env.VITE_NAVIDROME_URL, {
		username: 'anon',
		password: 'anon',
		salt: ''
	});

	async init(hub: Hub): Promise<void> {
		console.log('Initializing song cache leader');
		this.hub = hub;
		await cleanupSongCache();
		await this.loadIndex();
		// No eviction here: the configured size arrives via setMaxBytes().
		await this.refreshEffectiveMax();
		// A new leader starts with no pins; ask the tabs for theirs.
		this.requestPins();
		console.log('Song cache leader initialized');
	}
	close?(): void {}

	// Removes cached songs. Songs being downloaded are always kept. Pinned
	// songs (which a player may be reading) are kept unless includePinned is
	// set, e.g. when the credentials change and every cached song belongs to
	// the previous user/server.
	async clear(includePinned: boolean = false) {
		this.requestPins();
		const songCacheRoot = await getSongCacheDirectoryHandle();
		for (const songId of [...this.index.keys()]) {
			if (activeDownloads.has(songId) || (!includePinned && this.isPinned(songId))) {
				continue;
			}
			await this.removeSong(songCacheRoot, songId);
		}
		this.failedSongs.clear();
		await this.refreshEffectiveMax();
		this._postStatus();
	}

	async setMaxBytes(maxBytes: number) {
		this.maxBytes = maxBytes;
		await this.refreshEffectiveMax();
		await this.evictToFit();
		this._postStatus();
	}

	// Replaces the set of songs a tab is using. Idempotent: each call sends the
	// tab's whole set.
	setPinned(tabId: string, songIds: string[]) {
		this.pinnedByTab.set(tabId, new Set(songIds));
	}

	async getStatus(): Promise<CacheStatus> {
		return this.status();
	}

	updateCredentials(credentials: Credentials) {
		console.log(`[song-cache] Credentials updated '${credentials.username}'`);
		this.nv = new Client(import.meta.env.VITE_NAVIDROME_URL, credentials);
	}

	async cacheSong(songId: string) {
		switch (await getSongAvailability(songId)) {
			case SongAvailability.Downloading:
				return;
			case SongAvailability.Present: {
				const entry = this.index.get(songId);
				if (entry) {
					entry.lastUsed = Date.now();
				}
				return;
			}
		}
		if (this.failedSongs.has(songId)) {
			return;
		}
		try {
			await this.downloadSong(songId);
			return;
		} catch (e) {
			this.failedSongs.add(songId);
			if ((e as DOMException).name !== 'QuotaExceededError') {
				throw e;
			}
			console.log(`[song-cache] Quota exceeded for ${songId}, evicting and retrying`);
			await this.refreshEffectiveMax();
			await this.evictToFit((e as QuotaError).bytesWritten ?? 0);
		}
		await this.downloadSong(songId);
		this.failedSongs.delete(songId);
	}

	private async downloadSong(songId: string) {
		// Register
		const rid = ++requestId;
		if (activeDownloads.getOrInsert(songId, rid) !== rid) {
			return;
		}
		console.log(`[song-cache] Cache request for ${songId}`);
		this._postSongAvailability(songId, SongAvailability.Downloading);
		let bytesWritten = 0;
		try {
			const response = await this.nv.stream(songId, 'opus', 192);
			console.log(`[song-cache] Downloading ${songId} (${response.url})`);
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
				const cacheFile = await getCachedSongFileHandle(songId, true);
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
						bytesWritten += value.length;
					}
					await w.close();
				} catch (e) {
					// Release the file before removing the partial download.
					await w.abort().catch(() => {});
					await removeIfExists(cacheDir, cacheFile.name);
					(e as QuotaError).bytesWritten = bytesWritten;
					throw e;
				}
			} finally {
				await cacheDir.removeEntry(progressFile.name);
			}
		} catch (e) {
			console.log(`[song-cache] Download failed for ${songId}`, e);
			this._postSongAvailability(songId, SongAvailability.Missing);
			throw e;
		} finally {
			activeDownloads.delete(songId);
		}
		console.log(`[song-cache] Successful ${songId} (${bytesWritten} bytes) `);
		// If we reached this point everything went well
		this.index.set(songId, { size: bytesWritten, lastUsed: Date.now() });
		this.usedBytes += bytesWritten;
		this._postSongAvailability(songId, SongAvailability.Present);
		await this.refreshEffectiveMax();
		await this.evictToFit();
		this._postStatus();
	}

	async getSongAvailability(songId: string): Promise<SongAvailability> {
		return getSongAvailability(songId);
	}

	private _postSongAvailability(songId: string, availability: SongAvailability) {
		// TODO: make typesafe
		this.hub!.emit(this.namespace, 'availability-changed', { songId, availability });
	}

	private _postStatus() {
		this.hub!.emit(this.namespace, 'status-changed', this.status());
	}

	private status(): CacheStatus {
		return {
			usedBytes: this.usedBytes,
			maxBytes: this.maxBytes,
			effectiveMaxBytes: this.effectiveMaxBytes,
			songCount: this.index.size
		};
	}

	private async loadIndex() {
		const songCacheRoot = await getSongCacheDirectoryHandle();
		this.index.clear();
		this.usedBytes = 0;
		for await (const entry of songCacheRoot.values()) {
			if (entry.kind !== 'file' || entry.name.endsWith(PROGRESS_FILE_SUFFIX)) {
				continue;
			}
			const file = await (entry as FileSystemFileHandle).getFile();
			// TODO: Persist last-used times across restarts. For now every song
			// found on disk is treated as equally old.
			this.index.set(entry.name, { size: file.size, lastUsed: 0 });
			this.usedBytes += file.size;
		}
	}

	// Caps the configured size at what the browser lets us store, leaving room
	// for everything else in this origin (e.g. the library database).
	private async refreshEffectiveMax() {
		const { quota, usage } = await navigator.storage.estimate();
		if (quota === undefined || usage === undefined) {
			this.effectiveMaxBytes = this.maxBytes;
			return;
		}
		const available = Math.floor((quota - (usage - this.usedBytes)) * QUOTA_HEADROOM);
		this.effectiveMaxBytes = Math.max(0, Math.min(this.maxBytes, available));
	}

	private async evictToFit(extraBytes: number = 0) {
		const target = Math.min(this.effectiveMaxBytes, this.usedBytes) - extraBytes;
		if (this.usedBytes <= target) {
			return;
		}
		// Refresh the pins for next time; doesn't wait for the answers.
		this.requestPins();
		const candidates = [...this.index.entries()]
			.filter(([songId]) => !this.isPinned(songId))
			.sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
		const songCacheRoot = await getSongCacheDirectoryHandle();
		for (const [songId] of candidates) {
			if (this.usedBytes <= target) {
				break;
			}
			console.log(`[song-cache] Evicting ${songId}`);
			await this.removeSong(songCacheRoot, songId);
		}
	}

	private async removeSong(songCacheRoot: FileSystemDirectoryHandle, songId: string) {
		try {
			await removeIfExists(songCacheRoot, songId);
		} catch (e) {
			console.warn(`[song-cache] Failed to remove ${songId}`, e);
			return;
		}
		this.usedBytes -= this.index.get(songId)?.size ?? 0;
		this.index.delete(songId);
		this._postSongAvailability(songId, SongAvailability.Missing);
	}

	private isPinned(songId: string) {
		if (activeDownloads.has(songId)) {
			return true;
		}
		for (const pinned of this.pinnedByTab.values()) {
			if (pinned.has(songId)) {
				return true;
			}
		}
		return false;
	}

	private requestPins() {
		this.hub!.emit(this.namespace, 'pins-requested', {});
	}
}

type QuotaError = Error & { bytesWritten?: number };

async function cleanupSongCache() {
	// Cleanup partially downloaded files. Collect names first so we don't
	// modify the directory while iterating it.
	const songCacheRoot = await getSongCacheDirectoryHandle();
	const progressFiles: string[] = [];
	for await (const entry of songCacheRoot.values()) {
		if (entry.kind === 'file' && entry.name.endsWith(PROGRESS_FILE_SUFFIX)) {
			progressFiles.push(entry.name);
		}
	}
	for (const progressFile of progressFiles) {
		const badFile = progressFile.slice(0, -PROGRESS_FILE_SUFFIX.length);
		// Remove the backing file first in case we crash
		await removeIfExists(songCacheRoot, badFile);
		await removeIfExists(songCacheRoot, progressFile);
	}
}

async function removeIfExists(dir: FileSystemDirectoryHandle, name: string) {
	try {
		await dir.removeEntry(name);
	} catch (e) {
		if ((e as DOMException).name !== 'NotFoundError') {
			throw e;
		}
	}
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

export async function getCachedSongFileHandle(
	songId: string,
	create: boolean = false
): Promise<FileSystemFileHandle> {
	const songCacheRoot = await getSongCacheDirectoryHandle();
	return await songCacheRoot.getFileHandle(`${songId}`, { create: create });
}
