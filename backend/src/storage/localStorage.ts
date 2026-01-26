/**
 * Local Storage
 * File system storage for development
 */

import fs from 'fs/promises';
import path from 'path';

const STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || './storage';

export async function uploadFileLocal(key: string, body: Buffer): Promise<string> {
  const filePath = path.join(STORAGE_PATH, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return key;
}

export async function getFileLocal(key: string): Promise<Buffer> {
  const filePath = path.join(STORAGE_PATH, key);
  return fs.readFile(filePath);
}

export async function deleteFileLocal(key: string): Promise<void> {
  const filePath = path.join(STORAGE_PATH, key);
  await fs.unlink(filePath);
}

export async function fileExistsLocal(key: string): Promise<boolean> {
  try {
    const filePath = path.join(STORAGE_PATH, key);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
