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
	type SAHPoolUtil} from '@sqlite.org/sqlite-wasm';
import {
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type AbortableOperationOptions,
	type CompiledQuery,
	type ControlledTransaction,
	type DatabaseConnection,
	type Driver,
	type InsertObject,
	type QueryResult,
	type TransactionSettings
} from 'kysely';
import { type Service, type Hub } from 'tab-election/hub';
import { initializeDatabase, type Database } from './database_types';
import { Client, type Credentials, type Search3Args, type SearchResult3 } from '../navidrome';

interface DbEvents {
	'sync-progress': SyncUpdate;
} // reserved; state is primary

export class DatabaseService implements Service {
	readonly namespace = 'db' as const;
	readonly __events?: DbEvents; // phantom, for typed stubs
	private hub?: Hub;
	private db?: Kysely<Database>;
	private syncRunning = false;

	async init(hub: Hub) {
		console.log('Initializing database leader');
		console.log(
			`Cross Origin Isloated = ${self.crossOriginIsolated}, fsdh_found = ${FileSystemDirectoryHandle !== undefined}`
		);
		this.hub = hub;
		const sqlite3 = await sqlite3InitModule();
		const PoolUtil = await sqlite3.installOpfsSAHPoolVfs({
			initialCapacity: 3,
			clearOnInit: false, // Preserve data across sessions
			name: 'hificoos-pool'
		});
		console.log('Running SQLite3 version', sqlite3.version.libVersion);
		this.db = new Kysely<Database>({
			dialect: {
				createAdapter() {
					return new SqliteAdapter();
				},
				createDriver() {
					return new SqliteDriver(PoolUtil);
				},
				createIntrospector(db: Kysely<unknown>) {
					return new SqliteIntrospector(db);
				},
				createQueryCompiler() {
					return new SqliteQueryCompiler();
				}
			}
		});

		// TODO: move single connection enforcement inside initializeDatabase
		await this.db.connection().execute(async (db) => {
			await initializeDatabase(db);
		});
		this.hub.updateState({ db: { ready: true } });
		// TODO: emit complete sync to reset all other tabs after a switch
		console.log('Database initialized');
	}
	close() {
		this.db?.destroy();
	}

	async sync(credentials: Credentials): Promise<void> {
		console.log('SYNC CALLED');
		if (this.syncRunning) {
			return;
		}
		this.syncRunning = true;
		sync(this.db!, credentials, (upd) => this.hub?.emit('db', 'sync-progress', upd))
			.finally(() => {
				this.syncRunning = false;
			})
			.catch((e) => console.error(e));
	}

	async albums() {
		return this.db!.selectFrom('album')
			.leftJoin('song', 'album_id', 'album.id')
			.select(({ fn, val, ref }) => [
				'album.id',
				'album.name',
				'album.sort_name',
				'album.year',
				'album.cover_art',
				'album.display_artist',
				'album.created',
				fn.count<number>('song.id').as('song_count'),
				fn.sum<number>('song.duration').as('duration')
			]).groupBy('album.id')
			.orderBy('display_artist', 'asc')
			.orderBy('album.sort_name', 'asc')
			.execute();
	}
}

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
	error?: string;
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
	type: 'READY';
}

export type WorkerResponse = SyncUpdate | ReadyMessage;

const DB_NAME = 'hificoos.sqlite3';

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
		const rows = this.db.exec({
			sql: compiledQuery.sql,
			bind: compiledQuery.parameters as BindingSpec,
			rowMode: 'object', // Ensures rows are mapped to objects
			returnValue: 'resultRows'
		}) as R[];

		const numAffectedRows =
			typeof this.db.changes === 'function' ? BigInt(this.db.changes()) : undefined;

		console.log(compiledQuery.sql)
		return Promise.resolve({
			rows,
			numAffectedRows
		});
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
	private poolUtil: SAHPoolUtil;

	constructor(poolUtil: SAHPoolUtil) {
		this.poolUtil = poolUtil;
	}
	init(_options?: AbortableOperationOptions): Promise<void> {
		return Promise.resolve();
	}

	acquireConnection(_options?: AbortableOperationOptions): Promise<DatabaseConnection> {
		const db = openDB(this.poolUtil, DB_NAME);

		//db.exec('PRAGMA busy_timeout=5000;');
		db.exec('PRAGMA foreign_keys = ON;');

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

async function sync(
	db: Kysely<Database>,
	credentials: Credentials,
	updateCallback: (msg: SyncUpdate) => void
) {
	const txn = await db.startTransaction().execute();
	const status: SyncUpdate = {
		type: 'SYNC',
		albumsSynced: 0,
		artistsSynced: 0,
		songsSynced: 0,
		isDone: false
	};
	try {
		updateCallback(status);

		console.log('Cleaning songs');
		await txn.deleteFrom('song').execute();
		console.log('Cleaning albums');
		await txn.deleteFrom('album').execute();
		console.log('Cleaning artists');
		await txn.deleteFrom('artist').execute();

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
		await txn.commit().execute();
		state.status.isDone = true;
		state.updateCallback(state.status);
	} catch (e) {
		console.log(e);
		status.error = `${e}`;
		updateCallback(status);
		await txn.rollback().execute();
	}
}

function openDB(poolUtil: SAHPoolUtil, dbName: string) {
	try {
		const db = new poolUtil.OpfsSAHPoolDb(dbName);

		return db;
	} catch (e) {
		console.log('Error opening database:', e);
		throw e;
	}
}

type ArrayItem<T extends readonly unknown[]> = T extends readonly (infer U)[] ? U : never;

async function syncSearch3Field<T extends keyof SearchResult3, K extends keyof Database>(
	state: SyncState,
	field: T,
	table: K,
	mapper: (item: ArrayItem<Exclude<SearchResult3[T], undefined>>) => InsertObject<Database, K>
) {
	const BATCH_SIZE = 100;
	let offset = 0;
	const args: Search3Args = {
		albumCount: 0,
		albumOffset: 0,
		artistCount: 0,
		artistOffset: 0,
		songCount: 0,
		songOffset: 0
	};
	args[`${field}Count`] = BATCH_SIZE;
	while (true) {
		args[`${field}Offset`] = offset;
		const resp = await state.nv.search3(args);
		const lst = resp[field] as ArrayItem<Exclude<SearchResult3[T], undefined>>[];
		if (!lst?.length) {
			break;
		}

		const values = lst.map(mapper);
		await state.transaction.insertInto(table).values(values).execute();

		offset += values.length;
		state.status[`${field}sSynced`] = offset;
		state.updateCallback(state.status);
	}
}

async function syncArtists(state: SyncState) {
	await syncSearch3Field(state, 'artist', 'artist', (item) => {
		return {
			id: item.id,
			image_url: item.artistImageUrl,
			name: item.name,
			sort_name: item.sortName ?? item.name
		};
	});
}

async function syncAlbums(state: SyncState) {
	await syncSearch3Field(state, 'album', 'album', (item) => {
		return {
			id: item.id,
			name: item.name,
			sort_name: item.sortName ?? item.name,
			year: item.year ?? 0,
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
			rg_album_gain: item.replayGain?.albumGain ?? null,
			rg_album_peak: item.replayGain?.albumPeak ?? null,
			rg_track_gain: item.replayGain?.trackGain ?? null,
			rg_track_peak: item.replayGain?.trackPeak ?? null,
			suffix: item.suffix,
			track: item.track
		};
	});
}

//initializeDatabaseWorker();
