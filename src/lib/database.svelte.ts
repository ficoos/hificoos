import { SvelteMap } from 'svelte/reactivity';
import DatabaseWorker from './database_worker?sharedworker'
import type { WorkerCommand } from './database_worker';

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

	private handleResponse(data: unknown) {
		throw new Error('Method not implemented.');
	}

	private async send(type: WorkerCommand, payload = {}) {
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
