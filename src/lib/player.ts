// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

export interface PlaylistItem {
	title: string;
	display_artist: string;
	cover_art: string;
	duration: number;
}

export interface PlayerrState {
	active: number;
	playlist: PlaylistItem[];
}

// TODO(performance): Sending the entire thing on each update could maybe be expensive.
// If for example I intend to send the state every second to denote the current
// track status, serializing the entire playlist could be needlessly expensive.
// If this becomes and issue, I may want to make all the update fields optional
// and have it so that the API is sending "deltas". I just don't want to deal
// with that right now and I imagine this will be simple enough to add later.
// I do know that at least it will flag typescript errors everywhere I will not
// already do null checks on the fields (which will probably be everyhwere).
type PlayerrStateUpdate = PlayerrState & { type: 'STATE_UPDATE' };

export type Event = PlayerrStateUpdate;

export interface PlaylistClear {
	type: 'PLAYLIST_CLEAR';
}

export interface PlaylistInsert {
	type: 'PLAYLIST_INSERT';
	// The place to insert the items, leave empty for append
	index?: number;
	items: PlaylistItem[];
}

export type Command = PlaylistClear | PlaylistInsert;

const state: PlayerrState = {
	active: 0,
	playlist: []
};

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<Command>) => {
	switch (event.data.type) {
		case 'PLAYLIST_CLEAR':
			playlistClear(self, event.data);
			break;
		case 'PLAYLIST_INSERT':
			playlistInsert(self, event.data);
			break;
		default:
		// TODO: Is this really the best way to handle this? Can we enfore exhustiveness instead?
		// Ignore
	}
};

function playlistClear(self: Window, _data: PlaylistClear) {
	state.playlist = [];
	self.postMessage(state as PlayerrStateUpdate);
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(Math.min(n, max), min);
}

function playlistInsert(self: Window, data: PlaylistInsert) {
	try {
		const index = clamp(data.index ?? state.playlist.length, 0, state.playlist.length);
		if (index >= state.playlist.length) {
			// Append simple path
			state.playlist.push(...data.items);
			return;
		}
		state.playlist.splice(index, 0, ...data.items);
		if (state.active >= index) {
			state.active += index;
		}
	} finally {
		self.postMessage(state as PlayerrStateUpdate);
	}
}
