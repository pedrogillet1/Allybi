/**
 * Unified Download Service for Koda
 * 
 * Provides consistent download functionality across all components.
 * Supports downloading original files, exporting to PDF, and previewing.
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * Get token from localStorage (same pattern as other services)
 */
const getAuthToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
};

/**
 * Build API URL for document operations
 */
const buildDocumentUrl = (documentId, endpoint = '', queryParams = {}) => {
  let url = `${API_BASE_URL}/api/documents/${documentId}${endpoint}`;
  
  const params = new URLSearchParams();
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  return url;
};

/**
 * Download original file
 * 
 * @param {string} documentId - The document ID
 * @param {string} filename - Optional filename override
 * @returns {Promise<void>}
 */
export const downloadOriginal = async (documentId, filename = null) => {
  try {
    const token = getAuthToken();
    const url = buildDocumentUrl(documentId, '/stream', { 
      download: 'true',
      ...(filename && { filename })
    });
    
    // Use fetch to get the blob with auth header
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    // Get filename from Content-Disposition header if not provided
    let downloadFilename = filename;
    if (!downloadFilename) {
      const disposition = response.headers.get('Content-Disposition');
      if (disposition) {
        const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (filenameMatch) {
          downloadFilename = decodeURIComponent(filenameMatch[1]);
        }
      }
    }
    downloadFilename = downloadFilename || 'download';
    
    const blob = await response.blob();
    triggerDownload(blob, downloadFilename);
    
    return { success: true, filename: downloadFilename };
  } catch (error) {
    console.error('Download original error:', error);
    throw error;
  }
};

/**
 * Download as PDF (export)
 * For Office documents, downloads the converted PDF version.
 * For PDFs, downloads the original.
 * 
 * @param {string} documentId - The document ID
 * @param {string} originalFilename - The original filename (used to generate PDF name)
 * @param {string} mimeType - The document's MIME type
 * @returns {Promise<void>}
 */
export const downloadAsPdf = async (documentId, originalFilename, mimeType) => {
  try {
    const token = getAuthToken();
    
    // Check if document is already PDF
    if (mimeType === 'application/pdf') {
      return downloadOriginal(documentId, originalFilename);
    }
    
    // Supported types for PDF export: Office documents and images
    const officeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint'
    ];

    const isOfficeDoc = officeTypes.includes(mimeType);
    const isImage = mimeType.startsWith('image/');

    if (!isOfficeDoc && !isImage) {
      throw new Error('PDF export is only available for Office documents and images');
    }
    
    // Call export endpoint to get download URL
    const exportResponse = await fetch(`${API_BASE_URL}/api/documents/${documentId}/export`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ format: 'pdf' })
    });
    
    if (!exportResponse.ok) {
      const errorData = await exportResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `Export failed: ${exportResponse.status}`);
    }
    
    const exportData = await exportResponse.json();
    
    // Download the exported PDF using the returned URL
    const pdfUrl = exportData.downloadUrl.startsWith('/') 
      ? `${API_BASE_URL}${exportData.downloadUrl}`
      : exportData.downloadUrl;
    
    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!pdfResponse.ok) {
      throw new Error(`PDF download failed: ${pdfResponse.status}`);
    }
    
    const blob = await pdfResponse.blob();
    const pdfFilename = exportData.filename || originalFilename.replace(/\.[^.]+$/, '.pdf');
    triggerDownload(blob, pdfFilename);
    
    return { success: true, filename: pdfFilename };
  } catch (error) {
    console.error('Download as PDF error:', error);
    throw error;
  }
};

/**
 * Get view URL (for in-browser viewing)
 * 
 * @param {string} documentId - The document ID
 * @returns {string} URL for viewing the document
 */
export const getViewUrl = (documentId) => {
  return buildDocumentUrl(documentId, '/stream');
};

/**
 * Get preview PDF URL (for Office documents)
 * 
 * @param {string} documentId - The document ID  
 * @returns {string} URL for viewing the PDF preview
 */
export const getPreviewPdfUrl = (documentId) => {
  return buildDocumentUrl(documentId, '/preview-pdf');
};

/**
 * Trigger browser download
 * @private
 */
const triggerDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/**
 * Check if document can be exported as PDF
 *
 * @param {string} mimeType - The document's MIME type
 * @returns {boolean}
 */
export const canExportAsPdf = (mimeType) => {
  // PDF is already PDF (just download original)
  if (mimeType === 'application/pdf') {
    return true;
  }

  // Images can be converted to PDF
  if (mimeType && mimeType.startsWith('image/')) {
    return true;
  }

  // Office documents can be exported to PDF
  const officeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ];
  return officeTypes.includes(mimeType);
};

/**
 * Check if document is an Office document
 * 
 * @param {string} mimeType - The document's MIME type
 * @returns {boolean}
 */
export const isOfficeDocument = (mimeType) => {
  const officeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ];
  return officeTypes.includes(mimeType);
};

export default {
  downloadOriginal,
  downloadAsPdf,
  getViewUrl,
  getPreviewPdfUrl,
  canExportAsPdf,
  isOfficeDocument
};
