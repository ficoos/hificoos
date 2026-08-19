import { md5 } from './md5';

const VERSION = '1.6.1';

export interface Credentials {
	username: string;
	password: string;
}

export interface Artist {
	id: string;
	name: string;
	coverArt: string;
	artistImageUrl: string;
	musicBrainzId: string;
	sortName?: string;
}

export interface Album {
	id: string;
	name: string;
	sortName?: string;
	displayArtist: string;
	artists?: [
		{
			id: string;
			name: string;
		}
	];
	year?: number;
	genres?: string[];
	coverArt?: string;
	duration: number;
	songCount: number;
	playCount: number;
	created: string;
}

export interface Song {
	id: string;
	parent: string;
	title: string;
	album: string;
	artist: string;
	track: number;
	year: number;
	genre: string;
	coverArt?: string;
	size: number;
	contentType: string;
	suffix: string;
	duration: number;
	discNumber: number;
	artistId: string;
	albumId: string;
	type: string;
	replayGain?: {
		trackGain: number;
		albumGain: number;
		trackPeak: number;
		albumPeak: number;
	};
}

export interface SearchResult3 {
	album?: Album[];
	artist?: Artist[];
	song?: Song[];
}

export interface SubsonicResponse {
	status: string;
	version: string;
	type: string;
	serverVersion: string;
	error?: SubsonicError;
	searchResult3?: SearchResult3;
}

export interface SubsonicError {
	code: number;
	message: string;
}

export interface Search3Args {
	query?: string;
	artistCount?: number;
	artistOffset?: number;
	albumCount?: number;
	albumOffset?: number;
	songCount?: number;
	songOffset?: number;
}

function generateRandomSalt(length: number) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

export class Client {
	private apiPath: string;
	private credentials: Credentials;
	private encoder: TextEncoder;

	public constructor(apiPath: string, credentials: Credentials) {
		this.apiPath = apiPath;
		this.credentials = credentials;
		this.encoder = new TextEncoder();
	}

	private buildUrl(path: string, p: Record<string, string>) {
		const salt = generateRandomSalt(16);
		const token = md5(this.encoder.encode(`${this.credentials.password}${salt}`)).toHex();
		const params = new URLSearchParams({
			u: this.credentials.username,
			t: token,
			s: salt,
			c: 'hificoos',
			f: 'json',
			v: VERSION,
			...p
		});
		return `${this.apiPath}/rest/${path}?${params}`;
	}

	private async get(path: string, p: Record<string, string>) {
		const url = this.buildUrl(path, p);
		const rawResp = await fetch(url);
		const content = await rawResp.json();
		const resp = content['subsonic-response'] as SubsonicResponse;
		if (resp.error && resp.error.code != 0) {
			throw new Error(`[${resp.error?.code}] ${resp.error?.message}`);
		}
		if (resp.status !== 'ok') {
			throw new Error(`Bad status: ${resp.status}`);
		}

		return resp;
	}

	getCoverArt(albumId: string, size: number = 300): string {
		return this.buildUrl('getCoverArt', { id: albumId, size: size.toString() });
	}

	async ping() {
		await this.get('ping', {});
	}

	async search3(args: Search3Args): Promise<SearchResult3> {
		const resp = await this.get(
			'search3',
			Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v.toString()]))
		);

		return resp.searchResult3!;
	}
}
