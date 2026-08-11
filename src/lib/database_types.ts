import type { Insertable, Selectable } from 'kysely';
import { md5 } from './md5';

type SQLType = 'TEXT' | 'INTEGER' | 'FLOAT';
interface TypeMap {
	TEXT: string;
	INTEGER: number;
	FLOAT: number;
}

type FieldProp = 'PRIMARY KEY';

interface Field {
	type: SQLType;
	props: readonly FieldProp[];
	isNullable: boolean;
}

interface ForeignKey {
	field: string;
	foreignTable: string;
	foreignField: string;
}

type TableFields = { [key: string]: Field };

interface Table {
	name: string;
	fields: TableFields;
	foreignKeys?: readonly ForeignKey[];
}

const ARTISTS_TABLE = {
	name: 'artist',
	fields: {
		id: { type: 'TEXT', isNullable: false, props: ['PRIMARY KEY'] },
		name: { type: 'TEXT', isNullable: false, props: [] },
		image_url: { type: 'TEXT', isNullable: false, props: [] },
		sort_name: { type: 'TEXT', isNullable: false, props: [] }
	}
} as const;

const ALBUMS_TABLE = {
	name: 'album',
	fields: {
		id: { type: 'TEXT', isNullable: false, props: ['PRIMARY KEY'] },
		name: { type: 'TEXT', isNullable: false, props: [] },
		sort_name: { type: 'TEXT', isNullable: false, props: [] },
		display_artist: { type: 'TEXT', isNullable: false, props: [] },
		year: { type: 'INTEGER', isNullable: true, props: [] },
		cover_art: { type: 'TEXT', isNullable: false, props: [] },
		created: { type: 'INTEGER', isNullable: false, props: [] }
	}
} as const;

const SONGS_TABLE = {
	name: 'song',
	fields: {
		id: { type: 'TEXT', isNullable: false, props: ['PRIMARY KEY'] },
		title: { type: 'TEXT', isNullable: false, props: [] },
		track: { type: 'INTEGER', isNullable: false, props: [] },
		disc_number: { type: 'INTEGER', isNullable: false, props: [] },
		cover_art: { type: 'TEXT', isNullable: false, props: [] },
		content_type: { type: 'TEXT', isNullable: false, props: [] },
		suffix: { type: 'TEXT', isNullable: false, props: [] },
		duration: { type: 'INTEGER', isNullable: false, props: [] },
		artist_id: { type: 'TEXT', isNullable: false, props: [] },
		album_id: { type: 'TEXT', isNullable: false, props: [] },
		rg_track_gain: { type: 'FLOAT', isNullable: true, props: [] },
		rg_album_gain: { type: 'FLOAT', isNullable: true, props: [] },
		rg_track_peak: { type: 'FLOAT', isNullable: true, props: [] },
		rg_album_peak: { type: 'FLOAT', isNullable: true, props: [] }
	},
	foreignKeys: [
		{
			field: 'album_id',
			foreignTable: 'albums',
			foreignField: 'id'
		},
		{
			field: 'artist_id',
			foreignTable: 'artists',
			foreignField: 'id'
		}
	]
} as const;

type TypeMapper<T extends TableFields> = {
	[K in keyof T]: TypeMap[T[K]['type']] extends unknown
		? T[K]['isNullable'] extends true
			? TypeMap[T[K]['type']] | null
			: TypeMap[T[K]['type']]
		: never;
};

type ArtistTable = TypeMapper<typeof ARTISTS_TABLE.fields>;
type AlbumTable = TypeMapper<typeof ALBUMS_TABLE.fields>;
type SongTable = TypeMapper<typeof SONGS_TABLE.fields>;

function generateSchema() {
	return generateSchemaBase() + `INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION})`;
}

function generateSchemaBase(): string {
	const tables: Readonly<Table>[] = [ARTISTS_TABLE, ALBUMS_TABLE, SONGS_TABLE];
	const schema: string[] = [];
	schema.push('PRAGMA journal_mode = WAL;');
	schema.push('PRAGMA synchronous = NORMAL;');
	for (const table of tables) {
		schema.push(`CREATE TABLE ${table.name} (`);
		// Sort to make sure the output is consistent
		const sortedFieldNames = Object.keys(table.fields).sort();
		for (const fieldName of sortedFieldNames) {
			const field = table.fields[fieldName];
			schema.push(
				`${fieldName} ${field.type} ${field.isNullable ? 'NOT NULL' : ''} ${field.props.join(' ')},`
			);
		}
		for (const fk of table.foreignKeys || []) {
			schema.push(
				`FOREIGN KEY (${fk.field})  REFERENCES ${fk.foreignTable}(${fk.foreignField}),`
			);
		}
		schema.push(');');
	}
	schema.push(
		"CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))"
	);

	return schema.join('\n');
}

function calculateSchemaVersion() {
	const base = generateSchemaBase();
	return md5(new TextEncoder().encode(base));
}

export type Artist = Selectable<ArtistTable>;
export type NewArtist = Insertable<ArtistTable>;
export type Album = Selectable<AlbumTable>;
export type NewAlbum = Insertable<AlbumTable>;
export type Song = Selectable<SongTable>;
export type NewSong = Insertable<SongTable>;

export interface Database {
	artist: ArtistTable;
	album: AlbumTable;
	song: SongTable;
}

export const SCHEMA_VERSION = calculateSchemaVersion();
export const SCHEMA: string = generateSchema();
