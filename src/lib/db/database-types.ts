import {
	CreateTableBuilder,
	sql,
	type ColumnBuilderCallback,
	type Insertable,
	type Kysely,
	type Selectable
} from 'kysely';
import { md5 } from '../md5';

type SQLType = 'TEXT' | 'INTEGER' | 'REAL';
interface TypeMap {
	TEXT: string;
	INTEGER: number;
	REAL: number;
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

const SCHEMA_VERSION_TABLE = {
	name: 'schema_version',
	fields: {
		version: { type: 'TEXT', isNullable: false, props: ['PRIMARY KEY'] }
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
		rg_track_gain: { type: 'REAL', isNullable: true, props: [] },
		rg_album_gain: { type: 'REAL', isNullable: true, props: [] },
		rg_track_peak: { type: 'REAL', isNullable: true, props: [] },
		rg_album_peak: { type: 'REAL', isNullable: true, props: [] }
	},
	foreignKeys: [
		{
			field: 'album_id',
			foreignTable: 'album',
			foreignField: 'id'
		},
		{
			field: 'artist_id',
			foreignTable: 'artist',
			foreignField: 'id'
		}
	]
} as const;

const TABLE_DEFS: Readonly<Table>[] = [
	SCHEMA_VERSION_TABLE,
	ARTISTS_TABLE,
	ALBUMS_TABLE,
	SONGS_TABLE
];

type TypeMapper<T extends TableFields> = {
	[K in keyof T]: TypeMap[T[K]['type']] extends unknown
		? T[K]['isNullable'] extends true
			? TypeMap[T[K]['type']] | null
			: TypeMap[T[K]['type']]
		: never;
};

type SchemaVersionTable = TypeMapper<typeof SCHEMA_VERSION_TABLE.fields>;
type ArtistTable = TypeMapper<typeof ARTISTS_TABLE.fields>;
type AlbumTable = TypeMapper<typeof ALBUMS_TABLE.fields>;
type SongTable = TypeMapper<typeof SONGS_TABLE.fields>;

function sqlTypeToDataTypeExpression(t: SQLType) {
	switch (t) {
		case 'TEXT':
			return 'text';
		case 'INTEGER':
			return 'integer';
		case 'REAL':
			return 'real';
		default:
			throw new Error(`Unsupported SQLType: ${t}`);
	}
}
function fieldPropsToColumnBuilder(p: readonly FieldProp[]): ColumnBuilderCallback {
	return (col) => {
		for (const prop of p) {
			switch (prop) {
				case 'PRIMARY KEY':
					col = col.primaryKey();
					break;
				default:
					throw new Error(`Unsupported prop ${prop}`);
			}
		}
		return col;
	};
}

export async function initializeDatabase(db: Kysely<Database>) {
	let version = '';
	try {
		const ver = await db.selectFrom('schema_version').select('version').executeTakeFirst();
		version = ver?.version ?? '';
	} catch {
		// ignore
	}
	if (version === SCHEMA_VERSION) {
		// Database is initialized
		return;
	}
	console.log(`Schema mismatch ${version} !== ${SCHEMA_VERSION}, resetting database`);

	try {
		await db.executeQuery(sql`PRAGMA foreign_keys = OFF;`.compile(db));

		// Drop all tables
		const tables = await db.executeQuery(
			sql<
				{name: string}
			>`SELECT name FROM sqlite_schema WHERE type ='table' AND name NOT LIKE 'sqlite_%';`.compile(
				db
			)
		);
		for (const table of tables.rows) {
			console.log(`dropping ${table.name}`);
			await db.schema.dropTable(table.name).execute();
		}

		// Create tables
		for (const table of TABLE_DEFS) {
			let bld: CreateTableBuilder<string, string> = db.schema.createTable(table.name);
			for (const col in table.fields) {
				const field = table.fields[col];
				bld = bld.addColumn(
					col,
					sqlTypeToDataTypeExpression(field.type),
					fieldPropsToColumnBuilder(field.props)
				);
			}
			for (const fk of table.foreignKeys ?? []) {
				bld = bld.addForeignKeyConstraint(
					`${fk.field}_fk`,
					[fk.field],
					fk.foreignTable,
					[fk.foreignField],
					(cb) => cb.onDelete('cascade')
				);
			}

			await bld.execute();
		}
		// TODO: VACCUME

		// Must be last to "commit" the schema creation
		await db.insertInto('schema_version').values({ version: SCHEMA_VERSION }).execute();
	} finally {
		await db.executeQuery(sql`PRAGMA foreign_keys = ON;`.compile(db));
	}
}

function calculateSchemaVersion() {
	// TODO: Find a way to ensure I don't forget to add tables here when they are added to the schema.
	const base = TABLE_DEFS.map((v) => JSON.stringify(v)).join('\n');
	return md5(new TextEncoder().encode(base)).toHex();
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
	schema_version: SchemaVersionTable;
}

export const SCHEMA_VERSION = calculateSchemaVersion();
