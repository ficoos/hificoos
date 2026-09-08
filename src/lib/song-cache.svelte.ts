import { Spoke } from 'tab-election/hub';
import HubWorkerUrl from '$lib/song-cache/hub.worker?worker&url';
import { SongCacheService } from './song-cache/song-cache-service';
import { credentials } from '$lib/auth.svelte';

const spoke = new Spoke({
	workerUrl: HubWorkerUrl,
	name: 'hificoos-song-cache',
	version: '1'
});

export const songCache = spoke.getService<SongCacheService>('hificoos-song-cache');
credentials.subscribe((creds) => songCache.updateCredentials(creds));
