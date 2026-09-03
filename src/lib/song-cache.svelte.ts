import { Spoke } from 'tab-election/hub';
import HubWorkerUrl from '$lib/song-cache/hub.worker?worker&url';
import { SongCacheService } from './song-cache/song-cache-service';
import { getCachedSongFileHandle } from './song-cache/song-cache-common';
import { credentials } from '$lib/auth.svelte';

const spoke = new Spoke({
	workerUrl: HubWorkerUrl,
	name: 'hificoos-song-cache',
	version: '1'
});

const service = spoke.getService<SongCacheService>('song-cache');
credentials.subscribe((creds) => service.updateCredentials(creds));

export const songCache = {
	getSongAvailability: service.getSongAvailability,
	cacheSong: service.cacheSong,
	getCachedSongFileHandle: getCachedSongFileHandle
};
