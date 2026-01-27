// frontend/src/utils/encryptionWorkerManager.js

/**
 * Encryption Worker Manager
 * Manages the encryption Web Worker and provides a Promise-based API
 * for encrypting files and data without blocking the main thread
 */

class EncryptionWorkerManager {
  constructor() {
    this.worker = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.progressCallbacks = new Map();
  }

  /**
   * Initialize the Web Worker
   */
  init() {
    if (this.worker) {
      console.log('⚠️ [EncryptionWorker] Worker already initialized');
      return;
    }

    try {
      this.worker = new Worker(new URL('../workers/encryptionWorker.js', import.meta.url));

      this.worker.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      this.worker.addEventListener('error', (error) => {
        console.error('❌ [EncryptionWorker] Worker error:', error);
      });

      console.log('✅ [EncryptionWorker] Manager initialized');
    } catch (error) {
      console.error('❌ [EncryptionWorker] Failed to initialize worker:', error);
      throw error;
    }
  }

  /**
   * Handle messages from the Web Worker
   */
  handleMessage(message) {
    const { type, id, operation, result, error, progress, message: progressMessage } = message;

    switch (type) {
      case 'result':
        this.handleResult(id, result);
        break;

      case 'error':
        this.handleError(id, error);
        break;

      case 'progress':
        this.handleProgress(id, operation, progress, progressMessage);
        break;

      default:
        console.warn('⚠️ [EncryptionWorker] Unknown message type:', type);
    }
  }

  /**
   * Handle successful result from worker
   */
  handleResult(id, result) {
    const request = this.pendingRequests.get(id);
    if (request) {
      request.resolve(result);
      this.pendingRequests.delete(id);
      this.progressCallbacks.delete(id);
    }
  }

  /**
   * Handle error from worker
   */
  handleError(id, error) {
    const request = this.pendingRequests.get(id);
    if (request) {
      request.reject(new Error(error.message));
      this.pendingRequests.delete(id);
      this.progressCallbacks.delete(id);
    }
  }

  /**
   * Handle progress update from worker
   */
  handleProgress(id, operation, progress, message) {
    const callback = this.progressCallbacks.get(id);
    if (callback) {
      callback(operation, progress, message);
    }
  }

  /**
   * Send a message to the worker and return a Promise
   */
  sendMessage(type, data, onProgress) {
    if (!this.worker) {
      this.init();
    }

    const id = this.messageId++;

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(id, { resolve, reject });

      // Store the progress callback if provided
      if (onProgress) {
        this.progressCallbacks.set(id, onProgress);
      }

      // Send message to worker
      this.worker.postMessage({
        type,
        data,
        id
      });
    });
  }

  /**
   * Extract text from file (currently limited to text files)
   */
  async extractText(file, onProgress) {
    return this.sendMessage('extractText', { file }, onProgress);
  }

  /**
   * Encrypt file using AES-256-GCM
   * @param {Uint8Array} fileBuffer - File buffer to encrypt
   * @param {string} password - Encryption password
   * @param {function} onProgress - Progress callback
   * @returns {Promise<{ciphertext, salt, iv, authTag}>}
   */
  async encryptFile(fileBuffer, password, onProgress) {
    const result = await this.sendMessage(
      'encryptFile',
      { fileBuffer, password },
      onProgress
    );

    return {
      ciphertext: new Uint8Array(result.ciphertext),
      salt: new Uint8Array(result.salt),
      iv: new Uint8Array(result.iv),
      authTag: new Uint8Array(result.authTag)
    };
  }

  /**
   * Encrypt data (string) using AES-256-GCM
   * @param {string} text - Text to encrypt
   * @param {string} password - Encryption password
   * @param {function} onProgress - Progress callback
   * @returns {Promise<{ciphertext, salt, iv, authTag}>} - Base64-encoded values
   */
  async encryptData(text, password, onProgress) {
    return this.sendMessage('encryptData', { text, password }, onProgress);
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
      this.progressCallbacks.clear();
      console.log('✅ [EncryptionWorker] Worker terminated');
    }
  }
}

// Export singleton instance
export const encryptionWorkerManager = new EncryptionWorkerManager();
