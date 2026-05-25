import { put, list, del, head } from '@vercel/blob';
/// <reference lib="dom" />

// Vercel Blob uses the BLOB_READ_WRITE_TOKEN env var automatically.

export function isBlobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function ensureContainer(): Promise<void> {
  // Vercel Blob doesn't require container creation — no-op
}

// --- Helper: find blob URL by pathname ---
async function findBlobUrl(pathname: string): Promise<string | null> {
  const { blobs } = await list({ prefix: pathname });
  const match = blobs.find(b => b.pathname === pathname);
  return match?.url ?? null;
}

// --- Input blobs (uploaded files like MBRDI_TIMESHEET_PORTAL_INPUT.XLSX) ---

export async function readInputBlob(blobName: string): Promise<string | null> {
  const pathname = `input/${blobName}`;
  const url = await findBlobUrl(pathname);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.text();
}

export async function readInputBlobBuffer(blobName: string): Promise<Buffer | null> {
  const pathname = `input/${blobName}`;
  const url = await findBlobUrl(pathname);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function writeInputBlobBuffer(blobName: string, content: Buffer, contentType: string): Promise<void> {
  const pathname = `input/${blobName}`;
  await put(pathname, content, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
  });
}

export async function inputBlobExists(blobName: string): Promise<boolean> {
  const pathname = `input/${blobName}`;
  const url = await findBlobUrl(pathname);
  return url !== null;
}

// --- Output blobs (app data: timesheets, overrides, holidays) ---

export async function readOutputBlob(blobName: string): Promise<string | null> {
  const pathname = `output/${blobName}`;
  const url = await findBlobUrl(pathname);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.text();
}

export async function writeOutputBlob(blobName: string, content: string): Promise<void> {
  const pathname = `output/${blobName}`;
  await put(pathname, content, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
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
