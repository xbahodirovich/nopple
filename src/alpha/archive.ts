/** Small, interoperable ZIP writer. Stored entries keep image/PDF data unchanged. */
export async function archiveFiles(files: { name: string; data: Blob | string }[]): Promise<Blob> {
  const parts: Uint8Array[] = [], directory: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let offset = 0, directorySize = 0;
  const header = (size: number) => { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; };
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(await file.data.arrayBuffer());
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, name.length, true);
    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint16(8, 0x0800, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, data.length, true); central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
    parts.push(local.bytes, name, data); directory.push(central.bytes, name);
    offset += 30 + name.length + data.length; directorySize += 46 + name.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes] as BlobPart[], { type: 'application/zip' });
}
