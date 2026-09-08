// TOOD: This file has some duplication with the service.
export const PROGRESS_FILE_SUFFIX = '.progress';

export async function getSongCacheDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
	const opfsRoot = await navigator.storage.getDirectory();
	return await opfsRoot.getDirectoryHandle('song-cache', { create: true });
}

async function hasProgressFile(songId: string) {
	const songCacheRoot = await getSongCacheDirectoryHandle();
	try {
		await songCacheRoot.getFileHandle(`${songId}${PROGRESS_FILE_SUFFIX}`);
		return true;
	} catch {
		return false;
	}
}

export async function getCachedSongFileHandle(songId: string): Promise<FileSystemFileHandle> {
	const songCacheRoot = await getSongCacheDirectoryHandle();
	if (await hasProgressFile(songId)) {
		throw new Error('Song is being downloaded');
	}
	return await songCacheRoot.getFileHandle(`${songId}`);
}
