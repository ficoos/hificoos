interface RingBufferElement<T> {
	typedArrayConstructor: (buffer: SharedArrayBuffer, byteOffset: number, byteLength: number) => T;
	copy: (into: T, from: T, intoIdx: number, fromIdx: number) => void;
	length: (of: T) => number;
}

export interface RingBufferPair<T> {
	tx: RingBufferProducer<T>;
	rx: RingBufferConsumer<T>;
}

const float32ArrayElement: RingBufferElement<Float32Array> = {
	typedArrayConstructor: (buffer: SharedArrayBuffer, byteOffset: number, byteLength: number) =>
		new Float32Array(buffer, byteOffset, byteLength / Float32Array.BYTES_PER_ELEMENT),
	copy: (into: Float32Array, from: Float32Array, intoIdx: number, fromIdx: number) =>
		(into[intoIdx] = from[fromIdx]),
	length: (of: Float32Array) => of.length
};

export function createFloat32RingBuffer(buffer: SharedArrayBuffer): RingBufferPair<Float32Array> {
	return createRingBuffer(buffer, float32ArrayElement);
}

const int32ArrayElement: RingBufferElement<Int32Array> = {
	typedArrayConstructor: (buffer: SharedArrayBuffer, byteOffset: number, byteLength: number) =>
		new Int32Array(buffer, byteOffset, byteLength / Int32Array.BYTES_PER_ELEMENT),
	copy: (into: Int32Array, from: Int32Array, intoIdx: number, fromIdx: number) =>
		(into[intoIdx] = from[fromIdx]),
	length: (of: Int32Array) => of.length
};

export function createInt32RingBuffer(buffer: SharedArrayBuffer): RingBufferPair<Int32Array> {
	return createRingBuffer(buffer, int32ArrayElement);
}

const float32ArrayDuplexElement: RingBufferElement<Float32Array[]> = {
	typedArrayConstructor: (buffer: SharedArrayBuffer, byteOffset: number, byteLength: number) => [
		new Float32Array(buffer, byteOffset, byteLength / Float32Array.BYTES_PER_ELEMENT / 2),
		new Float32Array(buffer, byteOffset, byteLength / Float32Array.BYTES_PER_ELEMENT / 2)
	],
	copy: (into: Float32Array[], from: Float32Array[], intoIdx: number, fromIdx: number) => {
		into[0][intoIdx] = from[0][fromIdx];
		into[1][intoIdx] = from[1][fromIdx];
	},
	length: (of: Float32Array[]) => of[0].length
};

export function createFloat32DuplexRingBuffer(
	buffer: SharedArrayBuffer
): RingBufferPair<Float32Array[]> {
	return createRingBuffer(buffer, float32ArrayDuplexElement);
}

function createRingBuffer<T>(
	buffer: SharedArrayBuffer,
	element: RingBufferElement<T>
): RingBufferPair<T> {
	return {
		tx: new RingBufferProducer(buffer, element),
		rx: new RingBufferConsumer(buffer, element)
	};
}

enum ControlIndex {
	W_IDX,
	R_IDX,
	SKIP_IDX, // Tells the reader to skip until that idx. Used to "reset" the stream.
	W_ACTION_IDX, // The reader asks the the writer to skip.
	// Keep last
	COUNT
}

const SKIP_IDX_FLAG_MASK = 0x80000000;
const SKIP_IDX_MASK = 0x7fffffff;

export type PendingAction = 'none' | 'skip';

export class RingBufferProducer<T> {
	private _control: Int32Array;
	private _buffer: T;
	private _element: RingBufferElement<T>;

	constructor(buffer: SharedArrayBuffer, elemet: RingBufferElement<T>) {
		this._element = elemet;
		this._control = new Int32Array(buffer, 0, ControlIndex.COUNT);
		this._buffer = elemet.typedArrayConstructor(
			buffer,
			ControlIndex.COUNT * Int32Array.BYTES_PER_ELEMENT,
			buffer.byteLength
		);
	}

	reset() {
		const widx = Atomics.load(this._control, ControlIndex.W_IDX);
		const skipIdx = (widx | SKIP_IDX_FLAG_MASK) >>> 0;
		Atomics.store(this._control, ControlIndex.SKIP_IDX, skipIdx);
	}

	wait_reader() {
		const ridx = Atomics.load(this._control, ControlIndex.R_IDX);
		Atomics.wait(this._control, ControlIndex.R_IDX, ridx);
	}

	getPendingAction(): PendingAction {
		const action = Atomics.exchange(this._control, ControlIndex.W_ACTION_IDX, 0);
		switch (action) {
			case 1:
				return 'skip';
			default:
				return 'none';
		}
	}

	write(data: T): number {
		const dataLength = this._element.length(data);
		if (dataLength === 0) {
			return 0;
		}
		const len = this._element.length(this._buffer);

		let widx = Atomics.load(this._control, ControlIndex.W_IDX);

		// Writer is blocked if it is one cell before the reader.
		const nextWidx = (widx + 1) % len;
		const ridx = Atomics.load(this._control, ControlIndex.R_IDX);
		if (ridx === nextWidx) {
			return 0;
		}

		const lastValidIdx = (ridx + len - 1) % len;
		let nwritten = 0;
		while (widx !== lastValidIdx && nwritten < dataLength) {
			this._element.copy(this._buffer, data, widx, nwritten);
			widx = (widx + 1) % len;
			nwritten++;
		}

		Atomics.store(this._control, ControlIndex.W_IDX, widx);
		return nwritten;
	}
}

export class RingBufferConsumer<T> {
	private _control: Int32Array;
	private _buffer: T;
	private _element: RingBufferElement<T>;

	constructor(buffer: SharedArrayBuffer, element: RingBufferElement<T>) {
		const CONTROL_SIZE = 4 * 3;
		this._element = element;
		this._control = new Int32Array(buffer, 0, CONTROL_SIZE);
		this._buffer = element.typedArrayConstructor(
			buffer,
			CONTROL_SIZE,
			buffer.byteLength - CONTROL_SIZE
		);
	}

	skip() {
		Atomics.store(this._control, ControlIndex.W_ACTION_IDX, 1);
		Atomics.notify(this._control, ControlIndex.R_IDX);
	}

	read(into: T): number {
		const intoLength = this._element.length(into);
		if (intoLength === 0) {
			return 0;
		}
		const widx = Atomics.load(this._control, ControlIndex.W_IDX);
		let ridx = Atomics.load(this._control, ControlIndex.R_IDX);
		let skipIdx = Atomics.exchange(this._control, ControlIndex.SKIP_IDX, 0);
		if ((skipIdx & SKIP_IDX_FLAG_MASK) != 0) {
			skipIdx = (skipIdx & SKIP_IDX_MASK) >>> 0;
			ridx = skipIdx;
		}
		if (widx === ridx) {
			return 0;
		}

		const len = this._element.length(this._buffer);
		let nread = 0;
		while (ridx !== widx && nread < intoLength) {
			this._element.copy(into, this._buffer, nread, ridx);
			ridx = (ridx + 1) % len;
			nread++;
		}

		Atomics.store(this._control, ControlIndex.R_IDX, ridx);
		Atomics.notify(this._control, ControlIndex.R_IDX);
		return nread;
	}
}
