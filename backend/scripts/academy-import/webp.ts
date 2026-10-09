/** Minimal RIFF/WebP header reader (lossy VP8, lossless VP8L, extended VP8X). */

export interface WebpInfo {
  format: 'VP8' | 'VP8L' | 'VP8X';
  width: number;
  height: number;
}

export function readWebpInfo(buf: Uint8Array): WebpInfo {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < 30) throw new Error('webp: file too short');
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP')
    throw new Error('webp: not a RIFF/WEBP container');
  if (b.readUInt32LE(4) + 8 !== b.length) throw new Error('webp: RIFF size does not match length');
  const fourcc = b.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a)
      throw new Error('webp: bad VP8 start code');
    return {
      format: 'VP8',
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }
  if (fourcc === 'VP8L') {
    if (b[20] !== 0x2f) throw new Error('webp: bad VP8L signature');
    const b0 = b[21] as number;
    const b1 = b[22] as number;
    const b2 = b[23] as number;
    const b3 = b[24] as number;
    return {
      format: 'VP8L',
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
    };
  }
  if (fourcc === 'VP8X') {
    return {
      format: 'VP8X',
      width: 1 + b.readUIntLE(24, 3),
      height: 1 + b.readUIntLE(27, 3),
    };
  }
  throw new Error(`webp: unsupported chunk ${fourcc}`);
}
