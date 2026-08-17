import { browser } from '$app/environment';
import { Spoke, type ServiceStub } from 'tab-election/hub';
import HubWorkerUrl from '$lib/db/hub.worker?worker&url';
import { DatabaseService, type SyncUpdate } from '$lib/db/database-service';
import { getCredentials } from './auth.svelte';
import { get } from 'svelte/store';

export class DAL {
	private spoke: Spoke | undefined;
	readonly db: ServiceStub<DatabaseService> | undefined;
	state = $state<{ ready: boolean; isLeader: boolean; sync?: SyncUpdate; error?: string }>({
		ready: false,
		isLeader: false
	});

	private constructor() {
		if (!browser) {
			// SSR safety
			return;
		}
		this.spoke = new Spoke({
			workerUrl: HubWorkerUrl,
			name: 'hificoos-db',
			version: '1',
			callTimeout: 30 * 60 * 1000 // long syncs (gotcha #2)
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
		const credentials = get(getCredentials())
		return this.db!.sync(credentials);
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
