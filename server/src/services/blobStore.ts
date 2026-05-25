import { put, list, del, head, get, BlobNotFoundError } from '@vercel/blob';

// Vercel Blob uses the BLOB_READ_WRITE_TOKEN env var automatically.

export function isBlobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function ensureContainer(): Promise<void> {
  // Vercel Blob doesn't require container creation — no-op
}

// --- Helper: read blob content via SDK get() to bypass CDN cache ---
async function readBlobContent(pathname: string): Promise<Buffer | null> {
  try {
    const result = await get(pathname, { access: 'public' });
    if (!result || result.statusCode !== 200) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

// --- Input blobs (uploaded files like MBRDI_TIMESHEET_PORTAL_INPUT.XLSX) ---

export async function readInputBlob(blobName: string): Promise<string | null> {
  const buf = await readBlobContent(`input/${blobName}`);
  return buf ? buf.toString('utf-8') : null;
}

export async function readInputBlobBuffer(blobName: string): Promise<Buffer | null> {
  return readBlobContent(`input/${blobName}`);
}

export async function writeInputBlobBuffer(blobName: string, content: Buffer, contentType: string): Promise<void> {
  const pathname = `input/${blobName}`;
  await put(pathname, content, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function inputBlobExists(blobName: string): Promise<boolean> {
  const pathname = `input/${blobName}`;
  try {
    await head(pathname);
    return true;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return false;
    throw err;
  }
}

// --- Output blobs (app data: timesheets, overrides, holidays) ---

export async function readOutputBlob(blobName: string): Promise<string | null> {
  const buf = await readBlobContent(`output/${blobName}`);
  return buf ? buf.toString('utf-8') : null;
}

export async function writeOutputBlob(blobName: string, content: string): Promise<void> {
  const pathname = `output/${blobName}`;
  await put(pathname, content, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function listOutputBlobs(prefix: string): Promise<string[]> {
  const pathname = `output/${prefix}`;
  const { blobs } = await list({ prefix: pathname });
  // Return names relative to 'output/' to match existing API
  return blobs.map(b => b.pathname.replace(/^output\//, ''));
}

// --- Legacy aliases (kept for backward compat, map to output) ---
export async function readBlob(blobName: string): Promise<string | null> {
  return readOutputBlob(blobName);
}

export async function writeBlob(blobName: string, content: string): Promise<void> {
  return writeOutputBlob(blobName, content);
}

export async function readBlobBuffer(blobName: string): Promise<Buffer | null> {
  return readInputBlobBuffer(blobName);
}

export async function writeBlobBuffer(blobName: string, content: Buffer, contentType: string): Promise<void> {
  return writeInputBlobBuffer(blobName, content, contentType);
}

export async function blobExists(blobName: string): Promise<boolean> {
  return inputBlobExists(blobName);
}
