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
import { client } from './navidrome-service.svelte';
import { settings } from './settings.svelte';

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
export interface PlayerPosition {
	base: number;
	position: number;
	duration: number;
	startTime: number;
	songId: string | null;
}
export const playerPosition: Writable<PlayerPosition> = writable({
	position: 0,
	duration: 0,
	base: 0,
	startTime: 0,
	songId: null
});

function handleSongChange() {
	const SCROBBLE_THRESHOLD = 0.6;

	let lastState = get(playerPosition);
	return (pos: PlayerPosition) => {
		try {
			if (!get(settings).scrobble) {
				return;
			}

			if (!lastState.songId) {
				return;
			}

			if (lastState.startTime === 0) {
				return;
			}

			if (lastState.duration === 0) {
				return;
			}

			// Did the song actually change
			if (lastState.songId == pos.songId && lastState.startTime == pos.startTime) {
				return;
			}

			const duration = (Date.now() - lastState.startTime) / 1_000;
			// TODO: This ignores pause time but it is good enough for now.
			const playedPercent = duration / lastState.duration;
			if (playedPercent < SCROBBLE_THRESHOLD) {
				return;
			}

			get(client).scrobble(lastState.songId, lastState.startTime, true);
		} finally {
			lastState = pos;
		}
	};
}

playerPosition.subscribe(handleSongChange());

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
	const end = Math.min(start + DOWNLOAD_AOT, pq.queue.length);
	for (let i = start; i < end; i++) {
		songCache.cacheSong(pq.queue[i].id);
	}
	const nextSong = pq.queue.at(start + 1);
	console.log('update next');
	workerInstance.postMessage({
		type: 'SET_NEXT',
		songId: nextSong?.id,
		// TODO: Check if the surrounding tracks are from the same album.
		// If they are assume we are playing an album an use album gain.
		// If they are different songs use track gain.
		replayGain: nextSong?.rg_album_gain,
		playQueueIndex: start + 1
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
	getCurrentTime: () => audioCtx?.currentTime ?? 0,
	skipPrevious: skipPrevious,
	playlistShuffle: () => {
		playQueue.update(pq => {
			shuffle(pq.queue.length, (i: number, j: number) => {
				const tmp = pq.queue[i]
				pq.queue[i] = pq.queue[j]
				pq.queue[j] = tmp;
				if (pq.currentTrack == i) {
					pq.currentTrack = j;
				} else if (pq.currentTrack == j) {
					pq.currentTrack = i;
				}
			})

			return pq
		})
	}
};

function shuffle(length: number, swap: (i: number, j: number) => void) {
	for (let i = length - 1; i >= 1; i--) {
		const j = Math.round(Math.random() * i)
		swap(i, j)
	}
	/*
	for i from n − 1 down to 1 do
     j ← random integer such that 0 ≤ j ≤ i
     exchange a[j] and a[i]
	 */

}

function skipPrevious() {
	play(Math.max(get(playQueue).currentTrack - 1, 0));
}

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
	playerPosition.set({ base: 0, duration: 0, position: 0, startTime: 0, songId: null });
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
		// TODO: The logic here is repeated above. Move to a function.
		type: 'SET_NEXT',
		songId: nextSong.id,
		replayGain: nextSong.rg_album_gain,
		playQueueIndex: index
	} as SetNext);

	workerInstance.postMessage({
		type: 'SKIP'
	} as Skip);

	if (audioCtx) {
		const actx = audioCtx;
		actx.suspend().then(() => actx.close());
	}

	audioCtx = new window.AudioContext();

	// TODO: Set up compressor to prevent audio clipping
	/*
	const limiter = audioCtx.createDynamicsCompressor();
	limiter.threshold.setValueAtTime(-1.0, audioCtx.currentTime); // Start limiting at -1dB
	limiter.knee.setValueAtTime(0, audioCtx.currentTime);       // Hard knee (sharp transition)
	limiter.ratio.setValueAtTime(20, audioCtx.currentTime);   // High ratio to act as a limiter
	limiter.attack.setValueAtTime(0, audioCtx.currentTime);    // Instant attack
	limiter.release.setValueAtTime(0.1, audioCtx.currentTime); // Fast release
	*/

	// Invalidate all previous buffers
	firstValidBufferId = bufferId;
	nextSampleTime = 0;
	audioCtx.resume();
	playerState.set(PlayerState.Waiting);
	playerPosition.set({
		base: 0,
		position: 0,
		duration: nextSong.duration,
		startTime: Date.now(),
		songId: nextSong.id
	});

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
	console.log(
		`queueing audio buffer ${dataBuff.id} with duration ${duration} at ${start}, isFirstFrame = ${dataBuff.isFirstChunkOfSong}`
	);
	const audioBuf = new AudioBuffer({
		length: dataBuff.length == 0 ? 1 : dataBuff.length,
		sampleRate: sampleRate,
		numberOfChannels: dataBuff.buffers.length
	});
	for (let i = 0; i < numberOfChannels; i++) {
		audioBuf.copyToChannel(dataBuff.buffers[0], 0, 0);
		audioBuf.copyToChannel(dataBuff.buffers[1], 1, 0);
	}

	const linearGain = Math.pow(10, dataBuff.replayGain / 20);
	const gain = audioCtx?.createGain();
	gain!.gain.setValueAtTime(linearGain, start);

	const src = audioCtx!.createBufferSource();
	const startEvent = audioCtx!.createBufferSource();
	startEvent.connect(audioCtx!.destination);
	gain!.connect(audioCtx!.destination);
	src.connect(gain!);
	src.buffer = audioBuf;
	startEvent.buffer = new AudioBuffer({ length: 1, sampleRate: sampleRate, numberOfChannels: 1 });
	if (dataBuff.length > 0) {
		src.onended = () => {
			queueAudioBuffer();
			workerInstance.postMessage({
				type: 'REQUEST_AUDIO',
				id: ++bufferId
			} as RequestAudio);
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
		if (dataBuff.isFirstChunkOfSong && dataBuff.playQueueIndex) {
			const idx = dataBuff.playQueueIndex;
			playQueue.update((pq) => {
				pq.currentTrack = idx;
				return pq;
			});
			const pq = get(playQueue);
			const song = pq.queue.at(pq.currentTrack);
			if (song) {
				playerPosition.set({
					base: 0,
					position: 0,
					duration: song.duration,
					startTime: Date.now(),
					songId: song.id
				});
			}
		}
	};
	src.start(start, 0, duration);
	startEvent.start(start, 0);
}
