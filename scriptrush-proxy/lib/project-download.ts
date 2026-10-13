import type { KnowledgeFile } from "./knowledge-v2.ts";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Standard UTF-8 ZIP with stored entries, preserving every file byte. */
export function projectZip(files: KnowledgeFile[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  for (const file of files) {
    const name = encoder.encode(file.path), body = encoder.encode(file.content), crc = crc32(body);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, body.length, true); view.setUint32(22, body.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    const directory = new Uint8Array(46 + name.length), index = new DataView(directory.buffer);
    index.setUint32(0, 0x02014b50, true); index.setUint16(4, 20, true); index.setUint16(6, 20, true); index.setUint16(8, 0x0800, true); index.setUint16(14, 33, true);
    index.setUint32(16, crc, true); index.setUint32(20, body.length, true); index.setUint32(24, body.length, true); index.setUint16(28, name.length, true); index.setUint32(42, offset, true); directory.set(name, 46);
    local.push(header, body); central.push(directory); offset += header.length + body.length; centralSize += directory.length;
  }
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const bytes of [...local, ...central, end]) { output.set(bytes, cursor); cursor += bytes.length; }
  return output;
}
