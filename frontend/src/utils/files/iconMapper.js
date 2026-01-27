// Icon imports
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';

/**
 * Unified icon mapper function
 * @param {string} filename - The filename (e.g., "document.pdf")
 * @param {string} mimeType - The MIME type (e.g., "application/pdf")
 * @returns {string} - Path to the appropriate icon
 */
export const getFileIcon = (filename = '', mimeType = '') => {
  // ========== MIME TYPE CHECK (PRIORITY 1) ==========
  if (mimeType) {
    // PDF
    if (mimeType === 'application/pdf') return pdfIcon;

    // Word documents
    if (mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType.includes('word') || mimeType.includes('msword')) {
      return docIcon;
    }

    // Excel spreadsheets
    if (mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType.includes('sheet') || mimeType.includes('excel')) {
      return xlsIcon;
    }

    // PowerPoint presentations
    if (mimeType === 'application/vnd.ms-powerpoint' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      return pptxIcon;
    }

    // Text files
    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      return txtIcon;
    }

    // Images
    if (mimeType.startsWith('image/')) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpgIcon;
      if (mimeType.includes('png')) return pngIcon;
      if (mimeType.includes('gif')) return pngIcon; // Use PNG icon for GIF
      if (mimeType.includes('webp')) return pngIcon; // Use PNG icon for WEBP
      if (mimeType.includes('svg')) return pngIcon; // Use PNG icon for SVG
      return pngIcon; // Default image icon
    }

    // Video files
    if (mimeType.startsWith('video/')) {
      if (mimeType === 'video/quicktime') return movIcon;
      if (mimeType === 'video/mp4') return mp4Icon;
      return mp4Icon; // Default video icon
    }

    // Audio files
    if (mimeType.startsWith('audio/')) {
      if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return mp3Icon;
      if (mimeType === 'audio/wav') return mp3Icon; // Use MP3 icon for WAV
      if (mimeType === 'audio/aac') return mp3Icon; // Use MP3 icon for AAC
      if (mimeType === 'audio/mp4') return mp3Icon; // Use MP3 icon for M4A
      return mp3Icon; // Default audio icon
    }
  }

  // ========== EXTENSION CHECK (PRIORITY 2) ==========
  if (filename) {
    // Decode URL-encoded filenames first
    let decodedFilename = filename;
    try {
      decodedFilename = decodeURIComponent(filename);
    } catch (e) {
      // If decoding fails, use original
    }
    const ext = decodedFilename.toLowerCase().split('.').pop();

    switch (ext) {
      case 'pdf':
        return pdfIcon;
      case 'doc':
      case 'docx':
        return docIcon;
      case 'xls':
      case 'xlsx':
        return xlsIcon;
      case 'ppt':
      case 'pptx':
        return pptxIcon;
      case 'txt':
      case 'csv':
        return txtIcon;
      case 'jpg':
      case 'jpeg':
        return jpgIcon;
      case 'png':
        return pngIcon;
      case 'gif':
      case 'webp':
      case 'svg':
        return pngIcon; // Use PNG icon for other image formats
      case 'mov':
        return movIcon;
      case 'mp4':
        return mp4Icon;
      case 'mp3':
      case 'wav':
      case 'aac':
      case 'm4a':
        return mp3Icon;
      default:
        return txtIcon; // Default to generic file icon
    }
  }

  // ========== FALLBACK (PRIORITY 3) ==========
  return txtIcon; // Most generic default
};

// Export icons for cases where they need to be used directly
export {
  pdfIcon,
  docIcon,
  txtIcon,
  xlsIcon,
  jpgIcon,
  pngIcon,
  pptxIcon,
  movIcon,
  mp4Icon,
  mp3Icon
};
