export const formatSongDuration = (time: number): string => {
	const minutes = Math.floor(time / 60);
	const seconds = time % 60;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;
};
