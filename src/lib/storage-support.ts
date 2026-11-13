// Checks that the OPFS operations used by the song cache and player work.
// Firefox private windows either block OPFS entirely (SecurityError) or reject
// createWritable()/getFile() (UnknownError), which breaks the app.
export async function isStorageSupported(): Promise<boolean> {
	const probeName = `.storage-probe-${crypto.randomUUID()}`;
	let root: FileSystemDirectoryHandle | undefined;
	try {
		root = await navigator.storage.getDirectory();
		const handle = await root.getFileHandle(probeName, { create: true });
		const writable = await handle.createWritable();
		await writable.write(new Uint8Array([1]));
		await writable.close();
		const file = await handle.getFile();
		await file.arrayBuffer();
		return true;
	} catch (e) {
		console.warn('Storage support check failed', e);
		return false;
	} finally {
		await root?.removeEntry(probeName).catch(() => {});
	}
}

export async function factoryReset(): Promise<void> {
	try {
		const resp = await fetch('/factory-reset.txt', { cache: 'no-store' });
		if (!resp.headers.has('Clear-Site-Data')) {
			throw new Error('Clear-Site-Data header missing');
		}
	} catch (e) {
		console.warn('Clear-Site-Data reset unavailable, deleting local data directly', e);
		localStorage.clear();
		try {
			const root = await navigator.storage.getDirectory();
			for await (const name of root.keys()) {
				await root
					.removeEntry(name, { recursive: true })
					.catch((err) => console.warn(`Failed to remove ${name}`, err));
			}
		} catch (err) {
			console.warn('Failed to delete local storage', err);
		}
	}
	location.reload();
}
