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
