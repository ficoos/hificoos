CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT    DEFAULT (datetime('now'))
)

CREATE TABLE IF NOT EXISTS artists (
    id               TEXT    PRIMARY KEY   NOT NULL,
	name             TEXT                  NOT NULL,
	artist_image_url TEXT,
	sort_name        TEXT                  NOT NULL
)

CREATE TABLE IF NOT EXISTS albums (
    id                  TEXT      PRIMARY KEY    NOT NULL,
	name                TEXT                     NOT NULL
    sort_name           TEXT                     NOT NULL,
	display_artist      TEXT                     NOT NULL,
	year                INTEGER,
	cover_art           TEXT                     NOT NULL,
	created             TEXT                     NOT NULL
    -- TODO: set up multiple artists
	-- artists?: [
	-- 	{
	-- 		id: string;
	-- 		name: string;
	-- 	}
	-- ];
    -- TODO: set up genres
	-- genres?: [string];
)

CREATE TABLE IF NOT EXISTS songs (
    id                  TEXT     PRIMARY KEY   NOT NULL,
	title               TEXT                   NOT NULL,
	track               INTEGER                NOT NULL,
	disc_number         INTEGER                NOT NULL,
	cover_art           TEXT                   NOT NULL,
	content_type        TEXT                   NOT NULL,
	suffix              TEXT                   NOT NULL,
	duration            INTEGER                NOT NULL,
	artist_id           TEXT                   NOT NULL,
	album_id            TEXT                   NOT NULL,
	rg_track_gain       FLOAT,
	rg_album_gain       FLOAT,
	rg_track_peak       FLOAT,
	rg_album_peak       FLOAT,

    FOREIGN KEY (album_id)  REFERENCES albums(id),
    FOREIGN KEY (artist_id) REFERENCES artists(id)
)


-- Keep kast to make sure we don't have a version unless we set up the schema properly.
-- It shouldn't *really* matter because we are running it all in a single execution
-- but it's good to be explicit about such things.
INSERT INTO schema_version (version) VALUES (${CURRENT_SCHEMA_VERSION})
