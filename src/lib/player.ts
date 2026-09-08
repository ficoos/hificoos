// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

import { OggOpusDecoderWebWorker } from 'ogg-opus-decoder';
import { getCachedSongFileHandle } from './song-cache/song-cache-common';

export interface FilledBuffer {
	type: 'FILLED_BUFFER';
	id: number;
	buffers: Float32Array<ArrayBuffer>[];
	length: number;
	offest: number; // Offset from the beginning of the song (in samples)
	isBuffering: boolean;
	isLastFrameOfSong: boolean;
}

export type PlayerEvent = FilledBuffer;

export interface RequestAudio {
	type: 'REQUEST_AUDIO';
	id: number;
}

export interface SetNext {
	type: 'SET_NEXT';
	songId?: string;
}

export interface Skip {
	type: 'SKIP';
}

export type Command = RequestAudio | SetNext | Skip;

const activeDecoder: OggOpusDecoderWebWorker = new OggOpusDecoderWebWorker({
	forceStereo: true,
	speechQualityEnhancement: 'nolace'
});

await activeDecoder.ready;

// TODO: duplicate
const sampleRate = 48000; // Hz
const CHUNK_SIZE = 64_000;
let activeFile: File | null = null;
let activeFileOffset: number = 0;
let activeFileSampleOffset: number = 0;
let currentSongId: string | null;
let nextSongId: string | null;

const silenceSamples = Math.floor(sampleRate * 0.25);
const silence: Float32Array[] = [
	new Float32Array(silenceSamples),
	new Float32Array(silenceSamples)
];

self.onmessage = (event: MessageEvent<Command>) =>
	navigator.locks.request('player_sync', async () => {
		switch (event.data.type) {
			case 'REQUEST_AUDIO':
				await requestAudio(self, event.data);
				break;
			case 'SKIP':
				await skip(self, event.data);
				break;
			case 'SET_NEXT':
				await setNext(self, event.data);
				break;
			default:
			// TODO: Is this really the best way to handle this? Can we enfore exhustiveness instead?
			// Ignore
		}
	});

async function requestAudio(self: Window, data: RequestAudio) {
	console.debug(`[player] requestAudio ${activeFile?.name}`);
	if (!activeFile) {
		if (!currentSongId) {
			currentSongId = nextSongId;
			nextSongId = null;
		}
		console.log(`[player] switch track ${currentSongId}`);
		if (!currentSongId) {
			console.log('[player] EOS');
			self.postMessage({
				type: 'FILLED_BUFFER',
				buffers: silence,
				id: data.id,
				length: 0,
				isBuffering: true,
				offest: 0,
				isLastFrameOfSong: true
			} as FilledBuffer);
			return;
		}
		try {
			const fh = await getCachedSongFileHandle(currentSongId);
			activeFile = await fh.getFile();
		} catch {
			console.warn('[player] Waiting for file');
			self.postMessage({
				type: 'FILLED_BUFFER',
				buffers: silence,
				id: data.id,
				length: silenceSamples,
				isBuffering: true,
				offest: 0,
				isLastFrameOfSong: false
			} as FilledBuffer);
			return;
		}
		activeFileOffset = 0;
		activeFileSampleOffset = 0;

		await activeDecoder.reset();
		await activeDecoder.ready;
	}

	const buff = await activeFile.slice(activeFileOffset, activeFileOffset + CHUNK_SIZE).bytes();
	console.debug(`[player] read ${buff.byteLength} bytes`);
	if (buff.length === 0) {
		activeFile = null;
		currentSongId = null;
		// Move to next track
		return requestAudio(self, data);
	}
	activeFileOffset += buff.length;
	const decodedAudio = await activeDecoder.decode(buff);
	console.debug(`[player] decoded ${decodedAudio.samplesDecoded} samples`);
	if (decodedAudio.samplesDecoded === 0) {
		// We only got partial frames, try decoding another slice
		return requestAudio(self, data);
	}
	// TODO: check errors
	self.postMessage({
		type: 'FILLED_BUFFER',
		buffers: decodedAudio.channelData,
		id: data.id,
		length: decodedAudio.samplesDecoded,
		isBuffering: false,
		offest: activeFileSampleOffset,
		isLastFrameOfSong: buff.length < CHUNK_SIZE
	} as FilledBuffer);
	// Advance *after* sending the progress since this will now
	// point to the *end* of the current buffer, which is the start
	// of the next one.
	activeFileSampleOffset += decodedAudio.samplesDecoded;
}

async function setNext(_self: Window & typeof globalThis, data: SetNext) {
	console.log(`[player] set next ${data.songId}`);
	nextSongId = data.songId ?? null;
}

async function skip(_self: Window & typeof globalThis, _data: Skip) {
	console.log(`[player] skip to ${nextSongId}`);
	currentSongId = nextSongId;
	nextSongId = null;
	activeFile = null;
}

console.log('Audio player worker initialized');
