import { writable, type Readable } from 'svelte/store';
import { credentials } from '$lib/auth.svelte';
import { Client } from './navidrome';

const wclient = writable(
	new Client(import.meta.env.VITE_NAVIDROME_URL, { username: 'unknown', password: '' })
);

export const client: Readable<Client> = wclient;

credentials.subscribe((creds) => {
	wclient.set(new Client(import.meta.env.VITE_NAVIDROME_URL, creds));
});
