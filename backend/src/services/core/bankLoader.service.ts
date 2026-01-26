/**
 * Bank Loader - Simple accessor for data banks
 * Provides getBank() function used throughout the codebase
 */

import { DataBankLoaderService, DataBankLoaderOptions } from './dataBankLoader.service';
import * as path from 'path';

// Singleton instance
let loaderInstance: DataBankLoaderService | null = null;
let initialized = false;

/**
 * Get or create the data bank loader instance
 */
function getLoaderInstance(): DataBankLoaderService {
  if (!loaderInstance) {
    const env = (process.env.NODE_ENV || 'local') as 'production' | 'staging' | 'dev' | 'local';

    const options: DataBankLoaderOptions = {
      rootDir: path.join(process.cwd(), 'backend/src/data_banks'),
      env: env === 'development' ? 'dev' : env,
      strict: env === 'production',
      validateSchemas: false, // Enable when AJV is available
      allowEmptyChecksumsInNonProd: true,
      logger: {
        info: (msg, meta) => console.log(`[DataBank] ${msg}`, meta || ''),
        warn: (msg, meta) => console.warn(`[DataBank] ${msg}`, meta || ''),
        error: (msg, meta) => console.error(`[DataBank] ${msg}`, meta || ''),
      },
    };

    loaderInstance = new DataBankLoaderService(options);
  }
  return loaderInstance;
}

/**
 * Initialize the data bank loader (call once at startup)
 */
export async function initializeBanks(): Promise<void> {
  if (initialized) return;

  const loader = getLoaderInstance();
  await loader.loadAll();
  initialized = true;
}

/**
 * Get a bank by ID (with alias resolution)
 * @throws DataBankError if bank not found
 */
export function getBank<T = unknown>(bankId: string): T {
  const loader = getLoaderInstance();
  return loader.getBank<T>(bankId);
}

/**
 * Safely get a bank, returning null if not found
 */
export function getBankOrNull<T = unknown>(bankId: string): T | null {
  try {
    return getBank<T>(bankId);
  } catch {
    return null;
  }
}

/**
 * Check if a bank is loaded
 */
export function isBankLoaded(bankId: string): boolean {
  const loader = getLoaderInstance();
  return loader.listLoadedIds().includes(bankId);
}

/**
 * List all loaded bank IDs
 */
export function listLoadedBanks(): string[] {
  const loader = getLoaderInstance();
  return loader.listLoadedIds();
}

/**
 * Get the underlying loader instance (for advanced use)
 */
export function getDataBankLoader(): DataBankLoaderService {
  return getLoaderInstance();
}
