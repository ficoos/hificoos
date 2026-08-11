// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

import sqlite3InitModule, {
	Database as SqliteDatabase,
	type BindingSpec,
	type Sqlite3Static
} from '@sqlite.org/sqlite-wasm';
import { Client, type Credentials, type SearchResult3 } from './navidrome.ts';
import type { Database } from './database_types.ts';
import { SCHEMA } from './database_types.ts';
import {
	CompiledQuery,
	ControlledTransaction,
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type AbortableOperationOptions,
	type DatabaseConnection,
	type Driver,
	type InsertObject,
	type QueryResult,
	type TransactionSettings
} from 'kysely';

const ctx = self as unknown as SharedWorkerGlobalScope;

export type WorkerCommand = 'SYNC';

interface SyncState {
	status: SyncUpdate;
	transaction: ControlledTransaction<Database, []>;
	nv: Client;
	updateCallback: (update: SyncUpdate) => void;
}

interface SyncRequest {
	type: 'SYNC';
	id: number;
	credentials: Credentials;
}

export interface SyncUpdate {
	type: 'SYNC';
	artistsSynced: number;
	albumsSynced: number;
	songsSynced: number;
	isDone: boolean;
}

type WorkerRequest = SyncRequest;

export interface SuccessResponse<T> {
	id: number;
	data: T;
}

export interface ErrorResponse {
	id: number;
	error: string;
}

export interface ReadyMessage {
	type: 'READY'
}

export type WorkerResponse = SyncUpdate | ReadyMessage;

const DB_NAME = 'hificoos.sqlite3';
const CURRENT_SCHEMA_VERSION = 1;

let sqlite3: Sqlite3Static | null = null;
let isReady = false;

class SqliteConnection implements DatabaseConnection {
	db: SqliteDatabase;
	private inTransaction = false;

	constructor(db: SqliteDatabase) {
		this.db = db;
	}

	executeQuery<R>(
		compiledQuery: CompiledQuery,
		_options?: AbortableOperationOptions
	): Promise<QueryResult<R>> {
		try {
			const result = this.db.exec(compiledQuery.sql, {
				bind: compiledQuery.parameters as BindingSpec,
				returnValue: 'resultRows'
			});
			return Promise.resolve({ rows: result as R[] });
		} catch (err) {
			throw new Error(`Query execution failed`, { cause: err });
		}
	}

	streamQuery<R>(
		_compiledQuery: CompiledQuery,
		_chunkSize: number,
		_options?: AbortableOperationOptions
	): AsyncIterableIterator<QueryResult<R>> {
		throw new Error('Streaming queries not yet implemented');
	}

	beginTransaction(_settings: TransactionSettings): Promise<void> {
		if (this.inTransaction) {
			throw new Error('Cannot start transaction within an existing transaction');
		}
		this.db.exec('BEGIN IMMEDIATE');
		this.inTransaction = true;
		return Promise.resolve();
	}

	commitTransaction(): Promise<void> {
		if (!this.inTransaction) {
			throw new Error('No active transaction to commit');
		}
		try {
			this.db.exec('COMMIT');
		} catch (err) {
			try {
				this.db.exec('ROLLBACK');
			} catch {
				// ignored
			}
			throw new Error(`Commit failed`, {
				cause: err
			});
		}
		this.inTransaction = false;
		return Promise.resolve();
	}

	rollbackTransaction(): Promise<void> {
		try {
			this.db.exec('ROLLBACK');
		} catch (err) {
			console.error('Rollback failed:', err);
		}
		this.inTransaction = false;
		return Promise.resolve();
	}
}

class SqliteDriver implements Driver {
	init(_options?: AbortableOperationOptions): Promise<void> {
		return Promise.resolve();
	}

	acquireConnection(_options?: AbortableOperationOptions): Promise<DatabaseConnection> {
		const db = openDB(sqlite3!, DB_NAME);

		db.exec('PRAGMA busy_timeout=5000;');

		return Promise.resolve(new SqliteConnection(db));
	}

	beginTransaction(connection: SqliteConnection, settings: TransactionSettings): Promise<void> {
		return connection.beginTransaction(settings);
	}

	commitTransaction(connection: SqliteConnection): Promise<void> {
		return connection.commitTransaction();
	}

	rollbackTransaction(connection: SqliteConnection): Promise<void> {
		return connection.rollbackTransaction();
	}

	releaseConnection(
		connection: SqliteConnection,
		_options?: AbortableOperationOptions
	): Promise<void> {
		connection.db.close();
		return Promise.resolve();
	}

	destroy(_options?: AbortableOperationOptions): Promise<void> {
		return Promise.resolve();
	}
}

const db = new Kysely<Database>({
	dialect: {
		createAdapter() {
			return new SqliteAdapter();
		},
		createDriver() {
			return new SqliteDriver();
		},
		createIntrospector(db: Kysely<unknown>) {
			return new SqliteIntrospector(db);
		},
		createQueryCompiler() {
			return new SqliteQueryCompiler();
		}
	}
});

async function start() {
	let dbConn = openDB(sqlite3!, DB_NAME);
	if (!checkDBVersion(dbConn)) {
		console.log('DB Version check mismatch, resetting database');
		dbConn.close();
		await deleteOpfsFile(DB_NAME);
		dbConn = openDB(sqlite3!, DB_NAME);
		initDB(dbConn);
		dbConn.close();
	} else {
		console.log('Existing database found');
	}
	isReady = true;
}

ctx.onconnect = (event: MessageEvent<WorkerRequest>) => {
	const port: MessagePort & { _ready?: boolean } = event.ports[0];
	if (!isReady) {
		const check = setInterval(() => {
			if (isReady && !port._ready) {
				clearInterval(check);
				port._ready = true;
				port.postMessage({ type: 'READY' } as ReadyMessage);
			}
		}, 50);
	} else {
		port.postMessage({ type: 'READY' } as ReadyMessage);
	}

	port.onmessage = async (e: MessageEvent<WorkerRequest>) => {
		const { id, type, ...payload } = e.data;

		try {
			if (!isReady) {
				throw new Error('DB not initialized');
			}

			switch (type) {
				case 'SYNC':
					sync(payload.credentials, (data) => port.postMessage({ id, data }));
					break;
				default:
					throw new Error(`Unknown command: ${type}`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			port.postMessage({ id, error: message });
		}
	};

	port.start();
};

async function sync(credentials: Credentials, updateCallback: (msg: SyncUpdate) => void) {
	const txn = await db.startTransaction().execute();
	try {
		const status: SyncUpdate = {
			type: 'SYNC',
			albumsSynced: 0,
			artistsSynced: 0,
			songsSynced: 0,
			isDone: false,
		};
		updateCallback(status);

		txn.deleteFrom('song').execute();
		txn.deleteFrom('album').execute();
		txn.deleteFrom('artist').execute();

		const nv = new Client(import.meta.env.VITE_NAVIDROME_URL, credentials);

		const state: SyncState = {
			updateCallback,
			transaction: txn,
			nv,
			status
		};
		await syncArtists(state);
		await syncAlbums(state);
		await syncSongs(state);
		await txn.commit();
		state.status.isDone = true;
	} catch {
		await txn.rollback().execute();
	}
}

async function deleteOpfsFile(dbName: string): Promise<void> {
	const opfsRoot = await navigator.storage.getDirectory();
	try {
		await opfsRoot.removeEntry(dbName);
		console.log(`Deleted OPFS file: ${dbName}`);
	} catch (err) {
		console.warn('Could not delete OPFS file (may already be gone):', err);
	}
}

function openDB(sqlite3: Sqlite3Static, dbName: string) {
	console.log(
		`Cross Origin Isloated = ${self.crossOriginIsolated}, fsdh_found = ${FileSystemDirectoryHandle !== undefined}, schema_version = ${CURRENT_SCHEMA_VERSION}`
	);
	console.log('Running SQLite3 version', sqlite3.version.libVersion);
	try {
		const db = new sqlite3.oo1.DB(dbName, 'c', 'opfs');

		return db;
	} catch (e) {
		console.log('Error opening database:', e);
		throw e;
	}
}

function checkDBVersion(db: SqliteDatabase) {
	// TODO: User Kysely
	try {
		const result = db.exec('SELECT version FROM schema_version LIMIT 1', {
			returnValue: 'resultRows'
		});
		if (result.length == 0) {
			return false;
		}
		if (result[0][0] !== CURRENT_SCHEMA_VERSION) {
			return false;
		}
	} catch (e) {
		console.log('Error checking DB version:', e);
		return false;
	}

	return true;
}

async function initDB(db: SqliteDatabase) {
	db.exec(SCHEMA);
}

export const initializeDatabaseWorker = async () => {
	try {
		console.log('Loading and initializing SQLite3 module...');
		sqlite3 = await sqlite3InitModule();
		console.log('Done initializing. Running demo...');
		await start();
	} catch (err) {
		if (err instanceof Error) {
			console.error('Initialization error:', err.name, err.message);
		} else {
			console.error('Initialization error:', err);
		}
	}
};

type ArrayItem<T extends readonly unknown[]> = T extends readonly (infer U)[] ? U : never;

async function syncSearch3Field<T extends keyof SearchResult3, K extends keyof Database>(
	state: SyncState,
	field: T,
	table: K,
	mapper: (item: ArrayItem<Exclude<SearchResult3[T], undefined>>) => InsertObject<Database, K>
) {
	const BATCH_SIZE = 100;
	while (true) {
		const resp = await state.nv.search3({ albumCount: BATCH_SIZE, albumOffset: 0 });
		const lst = resp[field] as ArrayItem<Exclude<SearchResult3[T], undefined>>[];
		if (!lst?.length) {
			break;
		}

		const values = lst.map(mapper);
		state.transaction.insertInto(table).values(values).execute();

		state.status[`${field}sSynced`] += values.length;
		state.updateCallback(state.status);
	}
}

async function syncArtists(state: SyncState) {
	await syncSearch3Field(state, 'artist', 'artist', (item) => {
		return {
			id: item.id,
			image_url: item.artistImageUrl,
			name: item.name,
			sort_name: item.sortName || item.name
		};
	});
}

async function syncAlbums(state: SyncState) {
	await syncSearch3Field(state, 'album', 'album', (item) => {
		return {
			id: item.id,
			name: item.name,
			sort_name: item.sortName || item.name,
			year: item.year || 0,
			display_artist: item.displayArtist,
			cover_art: item.coverArt!,
			created: 0 // TODO
		};
	});
}

async function syncSongs(state: SyncState) {
	await syncSearch3Field(state, 'song', 'song', (item) => {
		return {
			id: item.id,
			title: item.title,
			album_id: item.albumId,
			artist_id: item.artistId,
			content_type: item.contentType,
			disc_number: item.discNumber,
			cover_art: item.coverArt!,
			duration: item.duration,
			rg_album_gain: item.replayGain?.albumGain || null,
			rg_album_peak: item.replayGain?.albumPeak || null,
			rg_track_gain: item.replayGain?.trackGain || null,
			rg_track_peak: item.replayGain?.trackPeak || null,
			suffix: item.suffix,
			track: item.track
		};
	});
}

initializeDatabaseWorker();
