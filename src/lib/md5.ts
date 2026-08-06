// Adapted from https://rosettacode.org/wiki/MD5/Implementation#JavaScript

const INITIAL_A = 0x67452301;
const INITIAL_B = 0xefcdab89; // No need for L suffix or static_cast
const INITIAL_C = 0x98badcfe; // No need for L suffix or static_cast
const INITIAL_D = 0x10325476;

const SHIFT_AMOUNTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

// K constants (T table) - Sine values
const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
];

function rotl(x: number, n: number) {
    // Ensure x is treated as 32-bit for the shifts
    return ((x << n) | (x >>> (32 - n))) | 0;
}


export function md5(message: ArrayLike<number>) {
	const BLOCK_SIZE = 64;
	const LEN_SIZE = 8;
	const msgLen = message.length;
	const msgLenBits = BigInt(msgLen * 8);

	const numBlocks = Math.ceil((msgLen + 1 + LEN_SIZE) / BLOCK_SIZE);
	const totalLength = numBlocks * 64;
	const paddedMessage = new Uint8Array(totalLength);
	paddedMessage.set(message);
	paddedMessage[msgLen] = 0x80;
	const lengthOffset = totalLength - LEN_SIZE;
	for (let i = 0; i < LEN_SIZE; ++i) {
		paddedMessage[lengthOffset + i] = Number(
			(msgLenBits >> (BigInt(i) * BigInt(LEN_SIZE))) & 0xffn
		);
	}

	// Initialize hash state variables (ensure they are 32-bit ints)
	let a = INITIAL_A | 0;
	let b = INITIAL_B | 0;
	let c = INITIAL_C | 0;
	let d = INITIAL_D | 0;

	const buffer = new Array(16);

        for (let i = 0; i < numBlocks; ++i) {
        const blockOffset = i * 64;

        // Prepare the 16-word buffer from the current block (little-endian)
        for (let j = 0; j < 16; ++j) {
            const wordIndex = blockOffset + j * 4;
            buffer[j] = (
                (paddedMessage[wordIndex]) |
                (paddedMessage[wordIndex + 1] << 8) |
                (paddedMessage[wordIndex + 2] << 16) |
                (paddedMessage[wordIndex + 3] << 24)
            ) | 0; // Ensure 32-bit integer
        }

        // Save current hash state
        const originalA = a;
        const originalB = b;
        const originalC = c;
        const originalD = d;

        // Main loop (64 rounds)
        for (let j = 0; j < 64; ++j) {
            let f, bufferIndex;
            const div16 = Math.floor(j / 16);

            switch (div16) {
                case 0: // Round 1: F = (B & C) | (~B & D)
                    f = (b & c) | (~b & d);
                    bufferIndex = j;
                    break;
                case 1: // Round 2: G = (B & D) | (C & ~D)
                    f = (b & d) | (c & ~d);
                    bufferIndex = (j * 5 + 1) % 16;
                    break;
                case 2: // Round 3: H = B ^ C ^ D
                    f = b ^ c ^ d;
                    bufferIndex = (j * 3 + 5) % 16;
                    break;
                case 3: // Round 4: I = C ^ (B | ~D)
                    f = c ^ (b | ~d);
                    bufferIndex = (j * 7) % 16;
                    break;
            }

            // Ensure intermediate results are 32-bit
            f = f! | 0;
            const term1 = a | 0;
            const term2 = buffer[bufferIndex!] | 0;
            const term3 = K[j] | 0;
            const shift = SHIFT_AMOUNTS[j]; // Use direct index j for SHIFT_AMOUNTS

            // Perform the round calculation: temp = B + rotl(A + F + M[g] + K[i], s)
            const sum = (term1 + f + term2 + term3) | 0;
            const rotatedSum = rotl(sum, shift);
            const temp = (b + rotatedSum) | 0;

            // Update hash variables
            a = d;
            d = c;
            c = b;
            b = temp;
        }

        // Add the original hash state back (with 32-bit wrap)
        a = (a + originalA) | 0;
        b = (b + originalB) | 0;
        c = (c + originalC) | 0;
        d = (d + originalD) | 0;
    }

    // Construct final 16-byte hash (little-endian)
    const md5Bytes = new Uint8Array(16);
    let count = 0;
    for (const word of [a, b, c, d]) {
        for (let i = 0; i < 4; ++i) {
            md5Bytes[count++] = (word >> (i * 8)) & 0xFF;
        }
    }

    return md5Bytes;
}
