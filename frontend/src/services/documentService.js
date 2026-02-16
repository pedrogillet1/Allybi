import api from './api';
import { calculateFileHash } from '../utils/security/crypto';
const AUTH_LOCALSTORAGE_COMPAT = process.env.REACT_APP_AUTH_LOCALSTORAGE_COMPAT === 'true';

const getCompatAccessToken = () => {
  if (!AUTH_LOCALSTORAGE_COMPAT) return null;
  return localStorage.getItem('accessToken') || localStorage.getItem('token');
};

/**
 * Document service for handling document operations
 */
class DocumentService {
  /**
   * Upload a single document
   * @param {File} file - The file to upload
   * @param {string} folderId - Optional folder ID
   * @param {function} onProgress - Progress callback (percentage)
   * @returns {Promise<object>} - Upload result
   */
  async uploadDocument(file, folderId = null, onProgress = null) {
    try {
      console.log(`[DocumentService] Starting upload for: ${file.name}`);

      // Calculate file hash
      console.log(`[DocumentService] Calculating hash...`);
      const fileHash = await calculateFileHash(file);
      console.log(`[DocumentService] Hash calculated: ${fileHash.substring(0, 16)}...`);

      // Create form data
      const formData = new FormData();
      formData.append('files', file);
      formData.append('fileHash', fileHash);
      formData.append('filename', file.name); // Send filename separately
      if (folderId) {
        formData.append('folderId', folderId);
      }

      console.log(`[DocumentService] Sending POST request to /api/documents/upload...`);

      // Upload with progress tracking
      const response = await api.post('/api/documents/upload', formData, {
        timeout: 600000, // 10 minute timeout for large files (up to 500MB)
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            console.log(`[DocumentService] onUploadProgress: ${percentCompleted}%`);
            onProgress(percentCompleted);
          }
        },
      });

      console.log(`[DocumentService] Response received:`, response.data);
      console.log(`[DocumentService] Response status:`, response.status);
      return response.data;
    } catch (error) {
      console.error(`[DocumentService] Error:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Upload multiple documents
   * @param {File[]} files - Array of files to upload
   * @param {string} folderId - Optional folder ID
   * @param {function} onProgress - Progress callback (percentage)
   * @returns {Promise<object>} - Upload result
   */
  async uploadMultipleDocuments(files, folderId = null, onProgress = null) {
    try {
      // Calculate hashes for all files
      const fileHashes = await Promise.all(
        files.map(file => calculateFileHash(file))
      );

      // Create form data
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('fileHashes', JSON.stringify(fileHashes));
      formData.append('filenames', JSON.stringify(files.map(f => f.name))); // Send filenames separately
      if (folderId) {
        formData.append('folderId', folderId);
      }

      // Upload with progress tracking
      const response = await api.post('/api/documents/upload-multiple', formData, {
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get document download URL
   * @param {string} documentId - The document ID
   * @returns {Promise<object>} - Download URL and metadata
   */
  async getDownloadUrl(documentId) {
    try {
      const response = await api.get(`/api/documents/${documentId}/download`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Download a document
   * @param {string} documentId - The document ID
   * @param {function} onProgress - Progress callback (percentage)
   * @returns {Promise<void>}
   */
  async downloadDocument(documentId, onProgress = null) {
    try {
      // Get download info from backend
      const { url, filename, mimeType } = await this.getDownloadUrl(documentId);

      // Prepare fetch options - backend URLs require auth headers
      const isBackendUrl = url.startsWith('/api/') || url.startsWith(process.env.REACT_APP_API_BASE_URL || '');
      const fetchOptions = {
        method: 'GET',
        credentials: 'include',
      };
      
      // Add auth header for backend URLs (not needed for presigned storage URLs)
      if (isBackendUrl) {
        const token = getCompatAccessToken();
        if (token) {
          fetchOptions.headers = {
            'Authorization': `Bearer ${token}`
          };
        }
      }

      // Build full URL for relative paths
      let fetchUrl = url;
      if (url.startsWith('/api/')) {
        fetchUrl = (process.env.REACT_APP_API_BASE_URL || '') + url;
      }

      // Download file with progress tracking
      const response = await fetch(fetchUrl, fetchOptions);

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);
      let loaded = 0;

      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (onProgress && total) {
          const percentCompleted = Math.round((loaded * 100) / total);
          onProgress(percentCompleted);
        }
      }

      // Create blob and download
      const blob = new Blob(chunks, { type: mimeType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List documents
   * @param {string} folderId - Optional folder ID filter
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<object>} - Documents list with pagination
   */
  async listDocuments(folderId = null, page = 1, limit = 1000) {
    try {
      const params = { page, limit };
      if (folderId) {
        params.folderId = folderId;
      }

      const response = await api.get('/api/documents', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete a document
   * @param {string} documentId - The document ID
   * @returns {Promise<object>} - Delete result
   */
  async deleteDocument(documentId) {
    try {
      const response = await api.delete(`/api/documents/${documentId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get document processing status
   * @param {string} documentId - The document ID
   * @returns {Promise<object>} - Processing status
   */
  async getDocumentStatus(documentId) {
    try {
      const response = await api.get(`/api/documents/${documentId}/status`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upload a new version of a document
   * @param {string} documentId - The parent document ID
   * @param {File} file - The new version file
   * @param {function} onProgress - Progress callback (percentage)
   * @returns {Promise<object>} - Upload result
   */
  async uploadVersion(documentId, file, onProgress = null) {
    try {
      // Calculate file hash
      const fileHash = await calculateFileHash(file);

      // Create form data
      const formData = new FormData();
      formData.append('files', file);
      formData.append('fileHash', fileHash);
      formData.append('filename', file.name); // Send filename separately

      // Upload with progress tracking
      const response = await api.post(`/api/documents/${documentId}/version`, formData, {
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get document versions
   * @param {string} documentId - The document ID
   * @returns {Promise<object>} - List of versions
   */
  async getVersions(documentId) {
    try {
      const response = await api.get(`/api/documents/${documentId}/versions`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors
   * @param {Error} error - The error object
   * @returns {Error} - Formatted error
   */
  handleError(error) {
    if (error.response) {
      // Return server message if available, otherwise use translation key
      const serverMessage = error.response.data?.error || error.response.data?.message;
      const err = new Error(serverMessage || 'errors.genericError');
      err.isTranslationKey = !serverMessage;
      return err;
    } else if (error.request) {
      const err = new Error('errors.noServerResponse');
      err.isTranslationKey = true;
      return err;
    } else {
      return error;
    }
  }
}

export default new DocumentService();
