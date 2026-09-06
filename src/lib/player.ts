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
}

export type PlayerEvent = FilledBuffer;

export interface RequestAudio {
	type: 'REQUEST_AUDIO';
	id: number;
}

export interface SetNext {
	type: 'SET_NEXT';
	songId: string;
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
				skip(self, event.data);
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
	console.log(`requestAudio ${activeFile?.name}`);
	if (!activeFile) {
		console.log(`switch track`);
		if (!nextSongId) {
			console.log('EOS');
			self.postMessage({
				type: 'FILLED_BUFFER',
				buffers: silence,
				id: data.id,
				length: 0,
				isBuffering: true,
				offest: 0
			} as FilledBuffer);
			return;
		}
		try {
			const fh = await getCachedSongFileHandle(nextSongId);
			activeFile = await fh.getFile();
		} catch {
			console.warn('Waiting for file');
			self.postMessage({
				type: 'FILLED_BUFFER',
				buffers: silence,
				id: data.id,
				length: silenceSamples,
				isBuffering: true,
				offest: 0
			} as FilledBuffer);
			return;
		}
		nextSongId = null;
		activeFileOffset = 0;
		activeFileSampleOffset = 0;

		await activeDecoder.reset();
		await activeDecoder.ready;
	}

	const buff = await activeFile.slice(activeFileOffset, activeFileOffset + CHUNK_SIZE).bytes();
	console.log(`[player] read ${buff.byteLength} bytes`);
	if (buff.length === 0) {
		activeFile = null;
		// Move to next track
		return requestAudio(self, data);
	}
	activeFileOffset += buff.length;
	const decodedAudio = await activeDecoder.decode(buff);
	activeFileSampleOffset += decodedAudio.samplesDecoded;
	console.log(`[player] decoded ${decodedAudio.samplesDecoded} samples`);
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
		offest: activeFileSampleOffset
	} as FilledBuffer);
}

async function setNext(_self: Window & typeof globalThis, data: SetNext) {
	console.log(`[player] set next ${data.songId}`);
	nextSongId = data.songId;
}

function skip(_self: Window & typeof globalThis, _data: Skip) {
	console.log(`[player] skip`);
	activeFile = null;
}

console.log('Audio player worker initialized');
