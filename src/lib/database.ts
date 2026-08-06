// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

import sqlite3InitModule, { Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';

const DB_NAME = 'hificoos.sqlite3';
const CURRENT_SCHEMA_VERSION = 1;

async function start(sqlite3: Sqlite3Static) {
	let db = openDB(sqlite3);
	if (!checkDBVersion(db)) {
		console.log("DB Version check mismatch, resetting database")
		db.close();
		await deleteOpfsFile();
		db = openDB(sqlite3);
		initDB(db);
	} else {
		console.log("Existing database found")
	}
}

async function deleteOpfsFile(): Promise<void> {
	const opfsRoot = await navigator.storage.getDirectory();
	try {
		await opfsRoot.removeEntry(DB_NAME);
		console.log(`Deleted OPFS file: ${DB_NAME}`);
	} catch (err) {
		console.warn('Could not delete OPFS file (may already be gone):', err);
	}
}

function openDB(sqlite3: Sqlite3Static) {
    console.log(`Cross Origin Isloated = ${self.crossOriginIsolated}, fsdh_found = ${FileSystemDirectoryHandle !== undefined}, schema_version = ${CURRENT_SCHEMA_VERSION}`);
	console.log('Running SQLite3 version', sqlite3.version.libVersion);
	try {
		const db = new sqlite3.oo1.DB(DB_NAME, 'c', 'opfs');

		return db;
	} catch (e) {
		console.log('Error opening database:', e);
        throw e;
	}
}

function checkDBVersion(db: Database) {
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

async function initDB(db: Database) {
	db.exec(
		`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))`
	);
	db.exec(`INSERT INTO schema_version (version) VALUES (${CURRENT_SCHEMA_VERSION})`);
}

export const initializeDatabaseWorker = async () => {
	try {
		console.log('Loading and initializing SQLite3 module...');
		const sqlite3 = await sqlite3InitModule();
		console.log('Done initializing. Running demo...');
		await start(sqlite3);
	} catch (err) {
		if (err instanceof Error) {
			console.error('Initialization error:', err.name, err.message);
		} else {
			console.error('Initialization error:', err);
		}
	}
};

initializeDatabaseWorker();