import { Hub } from 'tab-election/hub';
import { SongCacheService } from './song-cache-service';

new Hub(
	(hub) => {
		hub.register(new SongCacheService());
	},
	'hificoos-song-cache', // lock/namespace,
	'1' // version, bump on breaking worker changes
);
