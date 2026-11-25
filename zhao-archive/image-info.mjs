import { readFile } from 'node:fs/promises';

const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);

export function imageInfo(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0, pngHeader.length).equals(pngHeader)) {
    return { type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 8 < bytes.length && bytes[offset] === 0xff;) {
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      const size = bytes.readUInt16BE(offset + 2);
      if (marker === 0xda || size < 2 || offset + 2 + size > bytes.length) break;
      if (size >= 8 && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'image/jpeg', width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }
  return null;
}

export async function photoDimensions(file) {
  const info = imageInfo(await readFile(file));
  if (!info?.width || !info.height) throw new Error(`Cannot read dimensions for ${file}`);
  return { width: info.width, height: info.height };
}
