// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import type { Hub, Service } from 'tab-election/hub';
import { getSongCacheDirectoryHandle } from './song-cache-common';
import { Client, type Credentials } from '$lib/navidrome';

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

export enum SongAvailability {
	Present = 'present',
	Downloading = 'downloading',
	Missing = 'missing'
}

const PROGRESS_FILE_SUFFIX = '.progress';
const activeDownloads = new Map<string, unknown>();
interface SongCacheEvents {
	'availability-changed': {
		availability: SongAvailability;
		songId: string;
	};
}

export class SongCacheService implements Service {
	readonly namespace = 'song-cache' as const;
	readonly __events?: SongCacheEvents;
	private hub?: Hub;
	private nv: Client = new Client(import.meta.env.VITE_NAVIDROME_URL, {
		username: 'anon',
		password: 'anon'
	});

	async init(hub: Hub): Promise<void> {
		console.log('Initializing song cache leader');
		this.hub = hub;
		await cleanupSongCache();
		await this.clear();
		console.log('Song cache leader initialized');
	}
	close?(): void {}

	async clear() {
		const opfsRoot = await navigator.storage.getDirectory();
		// TODO: song-cache should be a const
		await opfsRoot.removeEntry('song-cache', { recursive: true });
	}

	updateCredentials(credentials: Credentials) {
		console.log(`[song-cache] Credentials updated '${credentials.username}'`);
		this.nv = new Client(import.meta.env.VITE_NAVIDROME_URL, credentials);
	}

	async cacheSong(songId: string) {
		switch (await getSongAvailability(songId)) {
			case SongAvailability.Downloading:
			case SongAvailability.Present:
				return;
		}

		// Register
		activeDownloads.set(songId, {});
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
			console.log(`[song-cache] Download failed for ${songId}`, e);
			this._postSongAvailability(songId, SongAvailability.Missing);
			throw e;
		} finally {
			activeDownloads.delete(songId);
		}
		console.log(`[song-cache] Successful ${songId} (${bytesWritten} bytes) `);
		// If we reached this point everything went well
		this._postSongAvailability(songId, SongAvailability.Present);
	}

	async getSongAvailability(songId: string): Promise<SongAvailability> {
		return getSongAvailability(songId);
	}

	private _postSongAvailability(songId: string, availability: SongAvailability) {
		// TODO: make typesafe
		this.hub!.emit(this.namespace, 'avalability-changed', { songId, availability });
	}
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
