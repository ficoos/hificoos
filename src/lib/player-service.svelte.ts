import { get, writable, type Writable } from 'svelte/store';
import Player from '$lib/player?worker';
import {
	type PlayerEvent,
	type RequestAudio,
	type FilledBuffer,
	type SetNext,
	type Skip
} from './player';
import type { SongItem } from './database.svelte';
import { localStorageStore } from './localstore';
import type { SongAvailability } from './song-cache/song-cache-service';
import { songCache } from './song-cache.svelte';

export const currentTrack: Writable<number> = localStorageStore('hificoos-current-track', 0);

export interface PlayQueueItem extends SongItem {
	availability: SongAvailability;
}

export interface PlayQueue {
	currentTrack: number;
	queue: PlayQueueItem[];
}

export enum PlayerState {
	Paused,
	Playing,
	Waiting
}

export const playQueue: Writable<PlayQueue> = localStorageStore('hificoos-playqueue', {
	currentTrack: 0,
	queue: []
});
export const playerState: Writable<PlayerState> = writable(PlayerState.Paused);
export const playerPosition: Writable<{ base: number; position: number; duration: number }> =
	writable({
		position: 0,
		duration: 0,
		base: 0
	});

let bufferId = 0;
let firstValidBufferId = 0;
let nextSampleTime = 0;
const workerInstance = new Player();
const DOWNLOAD_AOT = 3;

// This can only be initialized as a result of a user input
let audioCtx: AudioContext | null = null;
const sampleRate = 48000; // Hz
const numberOfChannels = 2;
console.assert(numberOfChannels == 2); // The codebase assumes stereo. If this ever changes, it will require extensive refactoring.

const filledBuffers: FilledBuffer[] = [];

playQueue.subscribe((pq) => {
	const start = pq.currentTrack < pq.queue.length ? pq.currentTrack : 0;
	const end = Math.min(start + DOWNLOAD_AOT, pq.queue.length - 1);
	for (let i = start; i < end; i++) {
		songCache.cacheSong(pq.queue[i].id);
	}
	const nextSong = pq.queue.at(start + 1);
	console.log('update next');
	workerInstance.postMessage({
		type: 'SET_NEXT',
		songId: nextSong?.id
	} as SetNext);
});

workerInstance.onmessage = (event: MessageEvent<PlayerEvent>) => {
	console.log(event.data.type);
	switch (event.data.type) {
		case 'FILLED_BUFFER': {
			console.assert(audioCtx);
			filledBuffers.push(event.data);
			queueAudioBuffer();
			break;
		}
	}
};

songCache.on('availability-changed', (ev) => {
	playQueue.update((pq) => {
		for (const item of pq.queue) {
			if (item.id != ev.songId) {
				continue;
			}
			item.availability = ev.availability;
		}
		return pq;
	});
});

export const playerControl = {
	playlistClear: () => {
		playQueue.set({ currentTrack: 0, queue: [] });
	},
	playlistRemove: (index: number) => {
		if (index === get(playQueue).currentTrack) {
			skipNext();
		}
		playQueue.update((pq) => {
			if (index < 0 || index >= pq.queue.length) {
				return pq;
			}
			if (index < pq.currentTrack) {
				pq.currentTrack--;
			}
			pq.queue.splice(index, 1);

			return pq;
		});
	},
	playlistInsert: async (items: SongItem[], index: number | null = null) => {
		const hydratedItems = await hydrateItems(items);
		playQueue.update((pq) => {
			index = clamp(index ?? pq.queue.length, 0, pq.queue.length);
			if (index <= pq.currentTrack) {
				pq.currentTrack += hydratedItems.length;
			}
			if (index >= pq.queue.length) {
				// Append simple path
				pq.queue.push(...hydratedItems);
				return pq;
			}
			pq.queue.splice(index, 0, ...hydratedItems);
			if (pq.currentTrack >= index) {
				pq.currentTrack += index;
			}

			return pq;
		});
	},
	play: play,
	pause: pause,
	skipNext: skipNext,
	getCurrentTime: () => audioCtx?.currentTime ?? 0
};

function clamp(n: number, min: number, max: number): number {
	return Math.max(Math.min(n, max), min);
}

async function hydrateItems(items: SongItem[]) {
	return Promise.all(
		items.map(async (item) => ({
			availability: await songCache.getSongAvailability(item.id),
			...item
		}))
	);
}

function skipNext() {
	const pq = get(playQueue);
	pq.currentTrack++;
	const track = pq.queue.at(pq.currentTrack);
	if (!track) {
		stop();
		return;
	}
	play(pq.currentTrack);
}

function stop() {
	audioCtx?.close();
	audioCtx = null;
	firstValidBufferId = bufferId;
	playQueue.update((pq) => {
		pq.currentTrack = pq.queue.length;
		return pq;
	});
	playerPosition.set({ base: 0, duration: 0, position: 0 });
	playerState.set(PlayerState.Paused);
}

function pause() {
	audioCtx?.suspend();
	playerState.set(PlayerState.Paused);
}

function play(index: number | null = null) {
	console.log('Play');
	const pq = get(playQueue);
	if (pq.queue.length == 0) {
		console.warn('Asked to play an empty queue');
		return;
	}

	if (index == null && pq.currentTrack < pq.queue.length && audioCtx) {
		audioCtx.resume();
		// TODO: There is a race here, if we pause while waiting
		// and resume it will be playing. It's not that bad because the UI
		// will reorient itself on next buffer but still shuold work.
		playerState.set(PlayerState.Playing);
		return;
	}

	index ??= pq.currentTrack;
	if (index < 0 || index >= pq.queue.length) {
		index = 0;
	}

	const nextSong = pq.queue[index];

	songCache.cacheSong(nextSong.id);

	workerInstance.postMessage({
		type: 'SET_NEXT',
		songId: nextSong.id
	} as SetNext);

	workerInstance.postMessage({
		type: 'SKIP'
	} as Skip);

	if (audioCtx) {
		const actx = audioCtx;
		actx.suspend().then(() => actx.close());
	}

	audioCtx = new window.AudioContext();
	// Invalidate all previous buffers
	firstValidBufferId = bufferId;
	nextSampleTime = 0;
	audioCtx.resume();
	playerState.set(PlayerState.Waiting);
	playerPosition.set({ base: 0, position: 0, duration: nextSong.duration });

	// TODO: move to a const
	for (let i = 0; i < 3; i++) {
		workerInstance.postMessage({
			type: 'REQUEST_AUDIO',
			id: ++bufferId
		} as RequestAudio);
	}

	// This is a fresh play request
	playQueue.update((pq) => {
		pq.currentTrack = index;
		return pq;
	});
}

function queueAudioBuffer() {
	const dataBuff = filledBuffers.pop();
	if (!dataBuff) {
		// Nothing to queue
		return;
	}
	if (dataBuff.id < firstValidBufferId) {
		return;
	}
	const duration = dataBuff.length / sampleRate;
	if (nextSampleTime === 0) {
		// There is a delay from when the audio context is created and a chunk
		// is requested until it actually arrives. This tries to account for that.
		// Using 0 will technically just play the chunk immidately but the next
		// chunk will start too early (because techincally the first sample started late).
		nextSampleTime = audioCtx!.currentTime;
		playerState.set(PlayerState.Playing);
	}
	const start = nextSampleTime;
	nextSampleTime = nextSampleTime + duration;
	console.log(`queueing audio buffer ${dataBuff.id} with duration ${duration} at ${start}`);
	const audioBuf = new AudioBuffer({
		length: dataBuff.length == 0 ? 1 : dataBuff.length,
		sampleRate: sampleRate,
		numberOfChannels: dataBuff.buffers.length
	});
	for (let i = 0; i < numberOfChannels; i++) {
		audioBuf.copyToChannel(dataBuff.buffers[0], 0, 0);
		audioBuf.copyToChannel(dataBuff.buffers[1], 1, 0);
	}

	const src = audioCtx!.createBufferSource();
	const startEvent = audioCtx!.createBufferSource();
	startEvent.connect(audioCtx!.destination);
	src.connect(audioCtx!.destination);
	src.buffer = audioBuf;
	startEvent.buffer = new AudioBuffer({ length: 1, sampleRate: sampleRate, numberOfChannels: 1 });
	if (dataBuff.length > 0) {
		src.onended = () => {
			queueAudioBuffer();
			workerInstance.postMessage({
				type: 'REQUEST_AUDIO',
				id: ++bufferId
			} as RequestAudio);
			if (dataBuff.isLastFrameOfSong) {
				playQueue.update((pq) => {
					pq.currentTrack++;
					return pq;
				});
				const pq = get(playQueue);
				const song = pq.queue.at(pq.currentTrack);
				if (song) {
					playerPosition.set({ base: 0, position: 0, duration: song.duration });
				}
			}
		};
	} else {
		src.onended = () => {
			stop();
		};
	}

	startEvent.onended = () => {
		playerState.set(dataBuff.isBuffering ? PlayerState.Waiting : PlayerState.Playing);
		playerPosition.update((p) => {
			p.position = dataBuff.offest / sampleRate;
			p.base = start;
			return p;
		});
	};
	src.start(start, 0, duration);
	startEvent.start(start, 0);
}
