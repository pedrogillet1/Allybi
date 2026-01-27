export { getExtension, classifyFile, analyzeFileBatch, determineNotifications, isLikelyEmptyText } from './fileTypeAnalyzer';
export { getFileIcon, pdfIcon, docIcon, txtIcon, xlsIcon, jpgIcon, pngIcon, pptxIcon, movIcon, mp4Icon, mp3Icon } from './iconMapper';
export { getSupportedExports, isExportSupported, hasExportOptions } from './exportUtils';
export { formatDuration, determineCountUnit, getPreviewCountForFile, getFileExtension, getMimeTypeFromExtension } from './previewCount';
export { generateThumbnail, supportsThumbnail } from './thumbnailGenerator';
export { extractText } from './textExtraction';
export { getCategories, getCategory, addDocumentToCategory, removeDocumentFromCategory, getCategoryDocuments, getCategoryDocumentCount, createCategory, getCategoriesWithCounts, deleteCategory } from './categoryManager';
