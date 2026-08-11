import { SvelteMap } from 'svelte/reactivity';
import DatabaseWorker from './database_worker?sharedworker'
import type { WorkerCommand, WorkerResponse } from './database_worker';

export class DAL {
	private worker: SharedWorker;
	port: MessagePort;
	pendingRequests: SvelteMap<
		number,
		{ resolve: (value: unknown) => void; reject: (value: unknown) => void }
	>;
	nextId: number;
	isReady: boolean;

	constructor(workerName: string = 'shared-db') {
		this.worker = new DatabaseWorker({name: workerName});
		this.port = this.worker.port;
		this.pendingRequests = new SvelteMap();
		this.nextId = 0;
		this.isReady = false;
		this.port.onmessage = (e) => this.handleResponse(e.data);
		this.port.start();
	}

	private handleResponse(data: WorkerResponse) {
		console.log(data)
	}

	private async send(type: WorkerCommand, payload = {}) {
		console.log(this.isReady)
		while (!this.isReady) {
			await new Promise((r) => setTimeout(r, 50));
		}

		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.port.postMessage({ id, type, ...payload });
		});
	}

	async syncDB() {
		await this.send('SYNC')
	}

	async close() {
		this.port.close();
	}
}

navigator.locks.request('sqlite_db_leader', async (_lock) => {
  // 1. The browser ensures ONLY ONE TAB enters this block at a time
  console.log("I am the chosen leader tab. Spawning the single DB thread.");
  
  const worker = new Worker('my-sqlite-worker.js');
  
  // 2. Open up a BroadcastChannel so other tabs can talk to this worker
  const rxChannel = new BroadcastChannel('db_queries');
  rxChannel.onmessage = (e) => {
    worker.postMessage(e.data); // Forward queries from other tabs to the database
  };

  // Keep this lock alive as long as this tab is open
  await new Promise(() => {}); 
});