import { Spoke } from 'tab-election/hub';
import HubWorkerUrl from '$lib/song-cache/hub.worker?worker&url';
import { SongCacheService } from './song-cache/song-cache-service';
import { credentials } from '$lib/auth.svelte';
import { settings } from '$lib/settings.svelte';

const spoke = new Spoke({
	workerUrl: HubWorkerUrl,
	name: 'hificoos-song-cache',
	version: '1'
});

export const songCache = spoke.getService<SongCacheService>('hificoos-song-cache');

// Each tab tells the song cache which songs it's using, so they aren't
// evicted or cleared. The cache asks again when it needs fresh information
// (new leader, cleanups).
const tabId = crypto.randomUUID();
let pinnedSongs: string[] = [];
export function setPinnedSongs(songIds: string[]) {
	pinnedSongs = songIds;
	songCache.setPinned(tabId, songIds);
}
songCache.on('pins-requested', () => songCache.setPinned(tabId, pinnedSongs));
credentials.subscribe((creds) => songCache.updateCredentials(creds));
settings.subscribe((s) => songCache.setMaxBytes(s.cacheSizeBytes));
