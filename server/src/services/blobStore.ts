import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

let inputContainerClient: ContainerClient | null = null;
let outputContainerClient: ContainerClient | null = null;

function getConnectionString(): string {
  return process.env.AZURE_STORAGE_CONNECTION_STRING || '';
}

function getInputContainerName(): string {
  return process.env.AZURE_STORAGE_CONTAINER || 'timesheet-input';
}

function getOutputContainerName(): string {
  return process.env.AZURE_STORAGE_OUTPUT_CONTAINER || 'timesheet-output';
}

function getInputContainer(): ContainerClient | null {
  const connStr = getConnectionString();
  if (!connStr) return null;
  if (!inputContainerClient) {
    const blobService = BlobServiceClient.fromConnectionString(connStr);
    inputContainerClient = blobService.getContainerClient(getInputContainerName());
  }
  return inputContainerClient;
}

function getOutputContainer(): ContainerClient | null {
  const connStr = getConnectionString();
  if (!connStr) return null;
  if (!outputContainerClient) {
    const blobService = BlobServiceClient.fromConnectionString(connStr);
    outputContainerClient = blobService.getContainerClient(getOutputContainerName());
  }
  return outputContainerClient;
}

export function isBlobEnabled(): boolean {
  return !!getConnectionString();
}

export async function ensureContainer(): Promise<void> {
  const input = getInputContainer();
  const output = getOutputContainer();
  if (input) await input.createIfNotExists();
  if (output) await output.createIfNotExists();
}

// --- Input container (read-only after upload) ---
export async function readInputBlob(blobName: string): Promise<string | null> {
  const container = getInputContainer();
  if (!container) return null;
  const blobClient = container.getBlockBlobClient(blobName);
  try {
    const response = await blobClient.download(0);
    const body = response.readableStreamBody;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err: any) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

export async function readInputBlobBuffer(blobName: string): Promise<Buffer | null> {
  const container = getInputContainer();
  if (!container) return null;
  const blobClient = container.getBlockBlobClient(blobName);
  try {
    const response = await blobClient.download(0);
    const body = response.readableStreamBody;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: any) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

export async function writeInputBlobBuffer(blobName: string, content: Buffer, contentType: string): Promise<void> {
  const container = getInputContainer();
  if (!container) return;
  const blobClient = container.getBlockBlobClient(blobName);
  await blobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function inputBlobExists(blobName: string): Promise<boolean> {
  const container = getInputContainer();
  if (!container) return false;
  const blobClient = container.getBlockBlobClient(blobName);
  return blobClient.exists();
}

// --- Output container (read-write for app data) ---
export async function readOutputBlob(blobName: string): Promise<string | null> {
  const container = getOutputContainer();
  if (!container) return null;
  const blobClient = container.getBlockBlobClient(blobName);
  try {
    const response = await blobClient.download(0);
    const body = response.readableStreamBody;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err: any) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

export async function writeOutputBlob(blobName: string, content: string): Promise<void> {
  const container = getOutputContainer();
  if (!container) return;
  const blobClient = container.getBlockBlobClient(blobName);
  await blobClient.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

export async function listOutputBlobs(prefix: string): Promise<string[]> {
  const container = getOutputContainer();
  if (!container) return [];
  const names: string[] = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    names.push(blob.name);
  }
  return names;
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
