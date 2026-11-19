const FRAME_MAGIC = [0x4f, 0x67, 0x67, 0x53, 0x00]; // OGGS + rev0

export function findNextFrame(buffer: Uint8Array, offest: number): number {
	for (let i = offest; i < buffer.length; i++) {
		for (let j = 0; j < FRAME_MAGIC.length; j++) {
			if (buffer[i + j] !== FRAME_MAGIC[j]) {
				break;
			}
			if (j === FRAME_MAGIC.length - 1) {
				return i;
			}
		}
	}

	return -1;
}

export function geAbsolutetGranulePosition(
	buffer: Uint8Array,
	offset: number
): bigint {
    const view = new DataView(buffer.buffer, offset)
    return view.getBigInt64(6, true) || BigInt(-1)
}
