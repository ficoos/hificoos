import { get, type Writable } from 'svelte/store';
import Player from '$lib/player?worker';
import { SharedControlStateFacade, type Event, type PlaylistClear, type PlaylistInsert, type PlaylistItem, type PlaylistRemove, type SetSharedState } from './player';
import type { SongItem } from './database.svelte';
import { localStorageStore } from './localstore';
import { OggOpusDecoderWebWorker, type OggOpusDecodedAudio } from 'ogg-opus-decoder';

export const currentTrack: Writable<number | null> = localStorageStore(
	'hificoos-current-track',
	null
);
export const playlist: Writable<PlaylistItem[]> = localStorageStore('hificoos-playlist', []);
let isPlaying = false;
const workerInstance = new Player();

// This can only be initialized as a result of a user input
let audioCtx: AudioContext | null = null;
const sampleRate = 48000; // Hz
const bufferLengthSeconds = 5;
const ringBufferSize = sampleRate * bufferLengthSeconds;
const sharedBuffer = new SharedArrayBuffer(ringBufferSize * Float32Array.BYTES_PER_ELEMENT);
const ringBuffer = new Float32Array(sharedBuffer);

const stateBuffer = new SharedArrayBuffer(4 * 3); // 3 integers (read/write/generation pointers)
const controlState = new Int32Array(stateBuffer);
const sharedControlStateFacade = new SharedControlStateFacade(controlState)

workerInstance.onmessage = (event: MessageEvent<Event>) => {
	console.log(event.data.type);
	switch (event.data.type) {
		case 'STATE_UPDATE':
			playlist.set(event.data.playlist);
			currentTrack.set(event.data.currentTrack);
			isPlaying = event.data.isPlaying;
	}
};

export const playerControl = {
	playlistClear: () => workerInstance.postMessage({ type: 'PLAYLIST_CLEAR' } as PlaylistClear),
	playlistInsert: (items: SongItem[], index: number | null = null) =>
		workerInstance.postMessage({ type: 'PLAYLIST_INSERT', items, index } as PlaylistInsert),
	playlistRemove: (index: number) =>
		workerInstance.postMessage({ type: 'PLAYLIST_REMOVE', index: index } as PlaylistRemove),
	setSharedState: (audioData: Float32Array, controlState: Int32Array) =>
		workerInstance.postMessage({ type: 'SHARED_STATE_SET', audioData, controlState } as SetSharedState),

};

let nextStartTime = 0;
function playAudio(decoded: OggOpusDecodedAudio) {
	if (!audioCtx) {
		audioCtx = new window.AudioContext();
	}

	// TODO: handle errors
	const { channelData, samplesDecoded, sampleRate } = decoded;

	// Create an AudioBuffer for the current chunk
	// channelData is usually an array of Float32Arrays (one per channel)
	const buffer = audioCtx.createBuffer(channelData.length, samplesDecoded, sampleRate);

	// Copy PCM data into the AudioBuffer
	for (let i = 0; i < channelData.length; i++) {
		buffer.copyToChannel(channelData[i], i);
	}

	const source = audioCtx.createBufferSource();
	source.buffer = buffer;
	source.connect(audioCtx.destination);

	// Schedule this chunk to play exactly when the previous one finishes
	const startTime = Math.max(audioCtx.currentTime, nextStartTime);
	source.start(startTime);

	// Update our pointer for the next call
	nextStartTime = startTime + buffer.duration;
}

interface PlayerProcessorsNodeOptions {
	audioData: Float32Array;
	controlState: Int32Array;
}

class PlayerProcessorsNode extends AudioWorkletProcessor {
	private _audioData: Float32Array;
	private _controlState: Int32Array;

	constructor(
		options: {
			processorOptions: PlayerProcessorsNodeOptions;
		} /* TODO: Figure out if there is a type */
	) {
		super();
		this._audioData = options.processorOptions.audioData;
		this._controlState = options.processorOptions.controlState;
	}
	process(
		_inputs: Float32Array[][],
		outputs: Float32Array[][],
		_parameters: Record<string, Float32Array>
	): boolean {
		const output = outputs[0];
		const channel = output[0]; // Get first channel

		if (!isPlaying) {
			// Not playing, feed silence
			return true;
		}

		let readIdx = Atomics.load(this._controlState, 1);
		const writeIdx = Atomics.load(this._controlState, 0);
		if (readIdx == writeIdx) {
			// The writer is stalling, feed silence
			// TODO: add warning since this shouldn't happen
			return true;
		}

		for (let i = 0; i < channel.length; i++) {
			// TODO: This is where we should modify the volume (or use a Gain node).
			// Maybe figure out if using a Gain node is worth the hassle
			channel[i] = this._audioData[readIdx];
			readIdx = (readIdx + 1) % ringBufferSize;
		}

		Atomics.store(this._controlState, 1, readIdx);

		return true;
	}
}

async function playOggFromOPFS(fileName: string) {
	const CHUNK_SIZE = 64 * (1 << 10);
	try {
		const root = await navigator.storage.getDirectory();
		const fileHandle = await root.getFileHandle(fileName);
		const file = await fileHandle.getFile();
		const fsize = file.size;

		const decoder = new OggOpusDecoderWebWorker({
			forceStereo: true,
			speechQualityEnhancement: 'nolace',
			// @ts-expect-error: The public docs say this parameter exists even though the types don't.
			sampleRate: sampleRate
		});
		try {
			await decoder.ready;
			for (let offset = 0; offset < fsize		this._audioData = options.processorOptions.audioData;
		this._controlState = options.processorOptions.controlState;
	}; offset += CHUNK_SIZE) {
				const buff = await file.slice(offset, offset + CHUNK_SIZE).bytes();
				await decoder.decode(buff).then(playAudio);
			}
		} finally {
			await decoder.free();
		}
	} catch (err) {
		console.error('Error playing audio:', err);
	}
}

// Restore state on "boot"
playerControl.playlistClear();
playerControl.playlistInsert(get(playlist));
playerControl.setSharedState(ringBuffer, controlState);
// TODO: set current track
