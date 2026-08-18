import { Spoke, type ServiceStub } from 'tab-election/hub';
import HubWorkerUrl from '$lib/db/hub.worker?worker&url';
import { DatabaseService, type SyncUpdate } from '$lib/db/database-service';
import { getCredentials } from './auth.svelte';
import { get } from 'svelte/store';

export interface AlbumItem {
    id: string;
    name: string;
    sort_name: string;
    year: number | null;
    cover_art: string;
    created: number;
    song_count: number;
    duration: number;
	display_artist: string;
}

export class DAL {
	private spoke: Spoke | undefined;
	readonly db: ServiceStub<DatabaseService>;
	state = $state<{ ready: boolean; isLeader: boolean; sync?: SyncUpdate; error?: string }>({
		ready: false,
		isLeader: false
	});

	constructor() {
		this.spoke = new Spoke({
			workerUrl: HubWorkerUrl,
			name: 'hificoos-db',
			version: '1',
			// TODO: I think this timeout is no longer needed
			callTimeout: 30 * 60 * 1000 // long syncs
		});
		this.db = this.spoke.getService<DatabaseService>('db');
		this.spoke.onState((s) => {
			this.state.ready = !!s.db?.ready;
			this.state.sync = s.sync;
			this.state.error = s.db?.error;
		});
		this.spoke.onLeaderChange((isLeader) => (this.state.isLeader = isLeader));
		this.spoke.onRecoveryFailed(
			({ attempts }) => (this.state.error = `DB worker recovery failed after ${attempts} attempts`)
		);
	}

	syncDB() {
		const credentials = get(getCredentials());
		return this.db.sync(credentials);
	}

	albums(): Promise<AlbumItem[]> {
		return this.db.albums()
	}
	// getArtists() {
	// 	return this.db!.getArtists();
	// }
	// ... getAlbums, getSongs, getSyncStatus
	close() {
		this.spoke?.close();
	}
}

let instance: DAL | undefined;
export function getDAL(): DAL {
	return (instance ??= new DAL());
} // ONE spoke/worker per tab — singleton
