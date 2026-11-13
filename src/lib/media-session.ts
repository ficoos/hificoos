// Media Session (OS media controls / media keys).
// Browsers only attach OS media controls to an HTMLMediaElement, but playback
// here goes through Web Audio. Firefox also requires that element to have a
// non-stream source, be at least 3 s long, and be audible (volume > 0 and
// non-silent samples). So while the player is active we loop a 10 s clip that
// is silent except for a 20 ms burst of ~-60 dBFS noise, played at volume 0.01
// (~-100 dBFS output). Testing showed that short burst is enough for Firefox
// to keep the session registered through the silent part of the loop.
import {
	PlayerState,
	playQueue,
	playerControl,
	playerPosition,
	playerState
} from './player-service.svelte';

const CLIP_SECONDS = 10;
const BURST_MS = 20;
const CLIP_SAMPLE_RATE = 8000;
const NOISE_AMPLITUDE = 0.001;
const KEEP_ALIVE_VOLUME = 0.01;

function createKeepAliveClipUrl(): string {
	const sampleCount = CLIP_SECONDS * CLIP_SAMPLE_RATE;
	const burstSamples = (BURST_MS / 1000) * CLIP_SAMPLE_RATE;
	const view = new DataView(new ArrayBuffer(44 + sampleCount * 2));
	const writeAscii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};
	// 16-bit mono PCM WAV header.
	writeAscii(0, 'RIFF');
	view.setUint32(4, 36 + sampleCount * 2, true);
	writeAscii(8, 'WAVE');
	writeAscii(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, CLIP_SAMPLE_RATE, true);
	view.setUint32(28, CLIP_SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii(36, 'data');
	view.setUint32(40, sampleCount * 2, true);
	const peak = Math.round(NOISE_AMPLITUDE * 32767);
	for (let i = 0; i < burstSamples; i++) {
		view.setInt16(44 + i * 2, Math.random() < 0.5 ? -peak : peak, true);
	}
	return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
}

function setupMediaSession(mediaSession: MediaSession) {
	const keepAlive = new Audio(createKeepAliveClipUrl());
	keepAlive.loop = true;
	keepAlive.volume = KEEP_ALIVE_VOLUME;
	document.body.appendChild(keepAlive);

	// playerState changes synchronously inside play(), so this still runs within
	// the user gesture that autoplay policies require.
	playerState.subscribe((state) => {
		const active = state !== PlayerState.Paused;
		mediaSession.playbackState = active ? 'playing' : 'paused';
		if (active) {
			keepAlive.play().catch((e) => console.warn('Media session keep-alive failed to play', e));
		} else {
			keepAlive.pause();
		}
	});

	playQueue.subscribe((pq) => {
		const track = pq.queue.at(pq.currentTrack);
		mediaSession.metadata = track
			? new MediaMetadata({
					title: track.title,
					artist: track.display_artist,
					album: track.album_name,
					artwork: track.cover_art ? [{ src: track.cover_art }] : []
				})
			: null;
	});

	playerPosition.subscribe((pos) => {
		if (pos.duration > 0) {
			mediaSession.setPositionState({
				duration: pos.duration,
				position: Math.min(pos.position, pos.duration),
				playbackRate: 1
			});
		} else {
			mediaSession.setPositionState();
		}
	});

	mediaSession.setActionHandler('play', () => playerControl.play());
	mediaSession.setActionHandler('pause', () => playerControl.pause());
	mediaSession.setActionHandler('nexttrack', () => playerControl.skipNext());
	mediaSession.setActionHandler('previoustrack', () => playerControl.skipPrevious());
}

if ('mediaSession' in navigator) {
	setupMediaSession(navigator.mediaSession);
}
