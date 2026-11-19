// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

import { OggOpusDecoderWebWorker } from 'ogg-opus-decoder';
import { getCachedSongFileHandle } from './song-cache/song-cache-common';
import { findNextFrame, geAbsolutetGranulePosition } from './ogg';

export interface FilledBuffer {
	type: 'FILLED_BUFFER';
	id: number;
	songId?: string;
	replayGain: number;
	buffers: Float32Array<ArrayBuffer>[];
	length: number;
	playQueueIndex?: number;
	offest: number; // Offset from the beginning of the song (in samples)
	isBuffering: boolean;
	isFirstChunkOfSong: boolean;
}

export type PlayerEvent = FilledBuffer;

export interface RequestAudio {
	type: 'REQUEST_AUDIO';
	id: number;
}

export interface SetNext {
	type: 'SET_NEXT';
	songId?: string;
	playQueueIndex?: number;
	replayGain?: number;
}

export interface Seek {
	type: 'SEEK';
	offset: number;
}

export interface Skip {
	type: 'SKIP';
}

export type Command = RequestAudio | SetNext | Skip | Seek;

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
interface Song {
	songId: string;
	replayGain: number;
	playQueueIndex: number;
}
let currentSong: Song | null;
let nextSong: Song | null;

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
			case 'SEEK':
				await seek(self, event.data);
				break;
			default:
			// TODO: Is this really the best way to handle this? Can we enfore exhustiveness instead?
			// Ignore
		}
	});

function findFirstAudioFrame(buffer: Uint8Array) {
	let s = 0;
	let g = -1;
	while (g === -1) {
		if (s > buffer.length - 8) {
			return -1;
		}
		s = findNextFrame(buffer, s);
		g = Number(geAbsolutetGranulePosition(buffer, s));
		if (g === -1) {
			s += 13;
		}
	}

	return s;
}

async function seek(self: Window, data: Seek) {
	if (!activeFile) {
		return;
	}
	const sampleOffset = BigInt(data.offset) * BigInt(sampleRate);
	const size = Math.floor(activeFile.size / 2);
	const i = size;
	// Load the entire file to memeory, since we know it's opus it will only ever be a few megabytes.
	// The reason we don't do it all the time is because the PCM data is much larger.
	const buffer = await activeFile.bytes();
	const firstFrameOffset = findFirstAudioFrame(buffer);
	const firstSample = geAbsolutetGranulePosition(buffer, firstFrameOffset);
	if (firstSample === BigInt(-1)) {
		return;
	}

	if (sampleOffset <= firstSample) {
		activeFileOffset = firstFrameOffset;
		activeFileSampleOffset = 0;
	} else {
		const newOffset = realSeek(buffer, sampleOffset, i, size);
		if (newOffset === -1) {
			return;
		}
		activeFileOffset = newOffset;
		// TODO: We are calculating this twice since this was alreaey figured out in realSeek;
		activeFileSampleOffset = Number(geAbsolutetGranulePosition(buffer, newOffset));
	}
	await activeDecoder.reset();
	await activeDecoder.ready;
	await activeDecoder.decode(buffer.slice(0, firstFrameOffset));
}

function realSeek(
	buffer: Uint8Array<ArrayBuffer>,
	item: bigint,
	offset: number,
	size: number
): number {
	let frameBase = -1;
	while (frameBase === -1 && offset < buffer.length) {
		frameBase = findNextFrame(buffer, offset);
	}

	const pos = geAbsolutetGranulePosition(buffer, frameBase);
	if (pos === BigInt(-1)) {
		return realSeek(buffer, item, offset + 13, size - 13);
	}
	if (Math.abs(Number(pos - item)) < 0.25 * sampleRate) {
		// We found a close enough position
		return frameBase;
	}

	size = Math.floor(size / 2);

	if (item > pos) {
		offset += size;
	} else {
		offset -= size;
	}

	return realSeek(buffer, item, offset, size);
}

async function requestAudio(self: Window, data: RequestAudio) {
	console.debug(`[player] requestAudio ${activeFile?.name}`);
	let isFirstFrameOfSong = false;
	if (!activeFile) {
		if (!currentSong) {
			currentSong = nextSong;
			nextSong = null;
		}
		console.log(`[player] switch track ${currentSong?.songId}`);
		if (!currentSong) {
			console.log('[player] EOS');
			self.postMessage({
				type: 'FILLED_BUFFER',
				buffers: silence,
				id: data.id,
				length: 0,
				isBuffering: true,
				offest: 0,
				replayGain: 1.0,
				isFirstChunkOfSong: true
			} as FilledBuffer);
			return;
		}
		try {
			const fh = await getCachedSongFileHandle(currentSong.songId);
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
				replayGain: 1.0,
				isFirstChunkOfSong: false
			} as FilledBuffer);
			return;
		}
		activeFileOffset = 0;
		activeFileSampleOffset = 0;
		isFirstFrameOfSong = true;

		await activeDecoder.reset();
		await activeDecoder.ready;
	}

	const buff = await activeFile.slice(activeFileOffset, activeFileOffset + CHUNK_SIZE).bytes();
	console.debug(`[player] read ${buff.byteLength} bytes`);
	if (buff.length === 0) {
		activeFile = null;
		currentSong = null;
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
		songId: currentSong?.songId,
		replayGain: currentSong?.replayGain ?? 1.0,
		length: decodedAudio.samplesDecoded,
		isBuffering: false,
		offest: activeFileSampleOffset,
		isFirstChunkOfSong: isFirstFrameOfSong,
		playQueueIndex: currentSong?.playQueueIndex
	} as FilledBuffer);
	// Advance *after* sending the progress since this will now
	// point to the *end* of the current buffer, which is the start
	// of the next one.
	activeFileSampleOffset += decodedAudio.samplesDecoded;
}

async function setNext(_self: Window & typeof globalThis, data: SetNext) {
	console.log(`[player] set next ${data.songId}`);
	nextSong = data.songId
		? {
				songId: data.songId,
				replayGain: data.replayGain ?? 1.0,
				playQueueIndex: data.playQueueIndex ?? 0
			}
		: null;
}

async function skip(_self: Window & typeof globalThis, _data: Skip) {
	console.log(`[player] skip to ${nextSong}`);
	currentSong = nextSong;
	nextSong = null;
	activeFile = null;
}

console.log('Audio player worker initialized');
