// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

const ctx = self as unknown as SharedWorkerGlobalScope;

export type WorkerCommand = 'SYNC';

interface SyncState {
	status: SyncUpdate;
	db: SqliteDatabase;
	nv: Client;
	updateCallback: (update: SyncUpdate) => void;
}

interface SyncRequest {
	type: 'SYNC';
	id: number;
	credentials: Credentials;
}

interface SyncUpdate {
	artistsSynced: number;
	albumsSynced: number;
	songsSynced: number;
	isDone: boolean;
}

type WorkerRequest = SyncRequest;

interface SuccessResponse<T> {
	id: number;
	data: T;
}

interface ErrorResponse {
	id: number;
	error: string;
}

export type WorkerResponse<T> = SuccessResponse<T> | ErrorResponse;

import sqlite3InitModule, {
	Database as SqliteDatabase,
	type BindingSpec,
	type Sqlite3Static,
	type SqlValue
} from '@sqlite.org/sqlite-wasm';
import {
	Client,
	type Album as AlbumTable,
	type Artist as ArtistTable,
	type Credentials,
	type SearchResult3,
	type Song as SongTable
} from './navidrome.ts';
import type { Database } from './database_types.ts';
import {
	CompiledQuery,
	DummyDriver,
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type AbortableOperationOptions,
	type ControlConnectionProvider,
	type DatabaseConnection,
	type Driver,
	type QueryCompiler,
	type QueryResult,
	type TransactionSettings
} from 'kysely';

const DB_NAME = 'hificoos.sqlite3';
const TMP_DB_NAME = 'hificoos.tmp.sqlite3';
const COMMIT_LOCK_NAME = 'hificoos.commit.lock';
const CURRENT_SCHEMA_VERSION = 1;

let dbConn: SqliteDatabase | null = null;
let sqlite3: Sqlite3Static | null = null;
let isReady = false;

class MyConn implements DatabaseConnection {
	executeQuery<R>(compiledQuery: CompiledQuery, _options?: AbortableOperationOptions): Promise<QueryResult<R>> {
		// TODO: validate parameters
		const res = dbConn!.exec(compiledQuery.sql, {bind: compiledQuery.parameters as BindingSpec, returnValue: 'resultRows'})
		return Promise.resolve({
			numAffectedRows: BigInt(res.length),
			rows: res as R[]
		} as QueryResult<R>)
	}
	streamQuery<R>(compiledQuery: CompiledQuery, chunkSize: number, options?: AbortableOperationOptions): AsyncIterableIterator<QueryResult<R>> {
		throw new Error('Method not implemented.');
	}
}

class MyDriver implements Driver {
	init(_options?: AbortableOperationOptions): Promise<void> {
		return Promise.resolve();
	}
	acquireConnection(_options?: AbortableOperationOptions): Promise<DatabaseConnection> {
		throw new Error('Method not implemented.');
	}
	beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
		throw new Error('Method not implemented.');
	}
	commitTransaction(connection: DatabaseConnection): Promise<void> {
		throw new Error('Method not implemented.');
	}
	rollbackTransaction(connection: DatabaseConnection): Promise<void> {
		throw new Error('Method not implemented.');
	}
	savepoint?(connection: DatabaseConnection, savepointName: string, compileQuery: QueryCompiler['compileQuery']): Promise<void> {
		throw new Error('Method not implemented.');
	}
	rollbackToSavepoint?(connection: DatabaseConnection, savepointName: string, compileQuery: QueryCompiler['compileQuery']): Promise<void> {
		throw new Error('Method not implemented.');
	}
	releaseSavepoint?(connection: DatabaseConnection, savepointName: string, compileQuery: QueryCompiler['compileQuery']): Promise<void> {
		throw new Error('Method not implemented.');
	}
	releaseConnection(connection: DatabaseConnection, options?: AbortableOperationOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}
	destroy(options?: AbortableOperationOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

}

const db = new Kysely<Database>({
	dialect: {
		createAdapter() {
			return new SqliteAdapter();
		},
		createDriver() {
			return new DummyDriver();
		},
		createIntrospector(db: Kysely<unknown>) {
			return new SqliteIntrospector(db);
		},
		createQueryCompiler() {
			return new SqliteQueryCompiler();
		}
	}
});

async function recoverCommit() {
	try {
		const opfsRoot = await navigator.storage.getDirectory();
		const lockHandle = await opfsRoot.getFileHandle(COMMIT_LOCK_NAME).catch(() => null);
		if (!lockHandle) {
			return;
		}

		console.log(`Found ${COMMIT_LOCK_NAME}, recovering incomplete sync...`);
		await commitTempDatabase();
	} catch (err) {
		// TODO: We probably just want to clear everything and reset to a clean state
		console.error('Error during commit recovery:', err);
	}
}

async function start() {
	await recoverCommit();
	dbConn = openDB(sqlite3!, DB_NAME);
	if (!checkDBVersion(dbConn)) {
		console.log('DB Version check mismatch, resetting database');
		dbConn.close();
		await deleteOpfsFile(DB_NAME);
		dbConn = openDB(sqlite3!, DB_NAME);
		initDB(dbConn);
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
				port.postMessage({ type: 'READY' });
			}
		}, 50);
	} else {
		port.postMessage({ type: 'READY' });
	}

	port.onmessage = async (e: MessageEvent<WorkerRequest>) => {
		const { id, type, ...payload } = e.data;

		try {
			if (!isReady || !dbConn) {
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
	const status: SyncUpdate = {
		albumsSynced: 0,
		artistsSynced: 0,
		songsSynced: 0,
		isDone: false
	};
	updateCallback(status);

	await deleteOpfsFile(TMP_DB_NAME);
	const tdb = openDB(sqlite3!, TMP_DB_NAME);
	await initDB(tdb);

	const nv = new Client(import.meta.env.VITE_NAVIDROME_URL, credentials);

	const state: SyncState = {
		updateCallback,
		db: tdb,
		nv,
		status
	};
	await syncArtists(state);
	await syncAlbums(state);
	await syncSongs(state);
	tdb.close();
	await commitTempDatabase();
	state.status.isDone = true;
	dbConn?.close();
	dbConn = openDB(sqlite3!, DB_NAME); // Reopen the database
	updateCallback(state.status);
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

async function syncSearch3Field<T extends keyof SearchResult3>(
	state: SyncState,
	field: T,
	fieldMapper: {
		[key: string]: (item: ArrayItem<Exclude<SearchResult3[T], undefined>>) => SqlValue;
	}
) {
	const BATCH_SIZE = 100;
	const fields = Object.keys(fieldMapper);
	const ROW_PARAMS = `(${fields.map(() => '?')})`;
	while (true) {
		const resp = await state.nv.search3({ albumCount: BATCH_SIZE, albumOffset: 0 });
		const lst = resp[field];
		if (!lst?.length) {
			break;
		}

		let query = `INSERT INTO ${field}s (${fields.join(',')}) VALUES `;
		const rows: string[] = [];
		const args: SqlValue[] = [];
		lst.forEach((item) => {
			rows.push(ROW_PARAMS);
			fields.forEach((k) => {
				args.push(
					fieldMapper[k](item as unknown as ArrayItem<Exclude<SearchResult3[T], undefined>>)
				);
			});
		});
		query = query + rows.join(',') + ';';
		state.db.exec(query, { bind: args });
		state.status[`${field}sSynced`] += rows.length;
		state.updateCallback(state.status);
	}
}

async function syncArtists(state: SyncState) {
	const FIELDS_MAPPER: { [key: string]: (album: ArtistTable) => SqlValue } = {
		id: (a) => a.id,
		name: (a) => a.name,
		artist_image_url: (a) => a.artistImageUrl || null,
		sort_name: (a) => a.sortName || a.name
	};
	await syncSearch3Field(state, 'artist', FIELDS_MAPPER);
}

async function syncAlbums(state: SyncState) {
	const FIELD_MAPPER: { [key: string]: (album: AlbumTable) => SqlValue } = {
		id: (a) => a.id,
		name: (a) => a.name,
		sort_name: (a) => a.sortName || a.name,
		cover_art: (a) => a.coverArt || null, // TODO: set default
		display_artists: (a) => a.displayArtist,
		year: (a) => a.year || null,
		created: () => 0 // TODO: convert to unix time -- s.created
	};
	await syncSearch3Field(state, 'album', FIELD_MAPPER);
}

async function syncSongs(state: SyncState) {
	const FIELD_MAPPER: { [key: string]: (song: SongTable) => SqlValue } = {
		id: (s) => s.id,
		title: (s) => s.title,
		track: (s) => s.track,
		disc_number: (s) => s.discNumber,
		cover_art: (s) => s.coverArt,
		content_type: (s) => s.contentType,
		suffix: (s) => s.suffix,
		duration: (s) => s.duration,
		artist_id: (s) => s.artistId,
		album_id: (s) => s.albumId,
		rg_track_gain: (s) => s.replayGain?.trackGain || null,
		rg_album_gain: (s) => s.replayGain?.albumGain || null,
		rg_track_peak: (s) => s.replayGain?.trackPeak || null,
		rg_album_peak: (s) => s.replayGain?.albumPeak || null
	};
	await syncSearch3Field(state, 'song', FIELD_MAPPER);
}

async function commitTempDatabase() {
	const opfsRoot = await navigator.storage.getDirectory();

	// Create commit.lock to signal in-progress commit
	await opfsRoot.getFileHandle(COMMIT_LOCK_NAME, { create: true });

	try {
		let tmpHandle;
		try {
			tmpHandle = await opfsRoot.getFileHandle(TMP_DB_NAME);
		} catch {
			// TOOO: make sure it is actually not found error and not something else
			return;
		}
		await deleteOpfsFile(DB_NAME);

		// Copy data from temp DB to main DB
		const newHandle = await opfsRoot.getFileHandle(DB_NAME, { create: true });
		const tmpFile = await tmpHandle.getFile();
		const buffer = await tmpFile.arrayBuffer();
		const writable = await newHandle.createWritable();
		await writable.write(buffer);
		await writable.close();

		// Remove temp DB
		await deleteOpfsFile(TMP_DB_NAME);
	} finally {
		// Always remove commit.lock (even on error)
		try {
			await opfsRoot.removeEntry(COMMIT_LOCK_NAME);
		} catch (err) {
			console.warn('Could not remove commit.lock:', err);
		}
	}
}

initializeDatabaseWorker();
