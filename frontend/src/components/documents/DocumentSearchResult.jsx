/**
 * Document Search Result Component
 *
 * Displays file buttons with perfect UX for semantic document search results.
 * Supports single and multiple document displays with comforting messages.
 */

import React from 'react';
import { getFileIcon } from '../utils/iconMapper';

/**
 * Format file size to human readable
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Get confidence color class
 */
const getConfidenceColor = (confidence) => {
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-gray-600';
};

/**
 * Get file type display name from mime type
 */
const getFileTypeDisplay = (mimeType) => {
  if (!mimeType) return 'File';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Excel';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PowerPoint';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Word';
  if (mimeType.includes('image')) return 'Image';
  if (mimeType.includes('text')) return 'Text';
  if (mimeType.includes('csv')) return 'CSV';
  return 'File';
};

/**
 * Single Document Card Component
 */
const SingleDocumentCard = ({ document, matchedCriteria, preview, onDocumentClick }) => {
  const FileIcon = getFileIcon(document.mimeType);

  return (
    <button
      onClick={() => onDocumentClick(document.id)}
      className="w-full p-4 bg-white border-2 border-blue-200 hover:border-blue-400 rounded-lg transition-all duration-200 hover:shadow-md group text-left"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1 text-blue-600 group-hover:text-blue-700">
          {FileIcon && <FileIcon className="w-6 h-6" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Filename */}
          <div className="font-semibold text-gray-900 group-hover:text-blue-700 mb-1 truncate">
            {document.filename}
          </div>

          {/* Matched criteria tags */}
          {matchedCriteria && matchedCriteria.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {matchedCriteria.map((criterion, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {criterion}
                </span>
              ))}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {preview.substring(0, 150)}...
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{formatFileSize(document.fileSize)}</span>
            <span className="text-gray-300">|</span>
            <span>{getFileTypeDisplay(document.mimeType)}</span>
          </div>
        </div>

        {/* Arrow icon */}
        <div className="flex-shrink-0 text-gray-400 group-hover:text-blue-600 transition-colors self-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
};

/**
 * Multiple Documents List Component
 */
const MultipleDocumentsList = ({ documents, note, onDocumentClick }) => {
  return (
    <div className="space-y-2">
      {/* Note (if partial matches) */}
      {note && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3">
          <p className="text-sm text-yellow-800">{note}</p>
        </div>
      )}

      {/* Document list */}
      {documents.map((doc, idx) => {
        const FileIcon = getFileIcon(doc.mimeType);

        return (
          <button
            key={doc.id}
            onClick={() => onDocumentClick(doc.id)}
            className="w-full p-3 bg-white border border-gray-200 hover:border-blue-400 rounded-lg transition-all duration-200 hover:shadow-sm group text-left"
          >
            <div className="flex items-start gap-3">
              {/* Number badge */}
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center text-xs font-semibold text-gray-600 group-hover:text-blue-700">
                  {idx + 1}
                </div>
              </div>

              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5 text-gray-600 group-hover:text-blue-600">
                {FileIcon && <FileIcon className="w-5 h-5" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Filename */}
                <div className="font-medium text-gray-900 group-hover:text-blue-700 mb-1 truncate">
                  {doc.filename}
                </div>

                {/* Matched criteria */}
                {doc.matchedCriteria && doc.matchedCriteria.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {doc.matchedCriteria.slice(0, 3).map((criterion, cidx) => (
                      <span
                        key={cidx}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-800"
                      >
                        {criterion}
                      </span>
                    ))}
                    {doc.matchedCriteria.length > 3 && (
                      <span className="text-xs text-gray-500">
                        +{doc.matchedCriteria.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  {doc.confidence !== undefined && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className={getConfidenceColor(doc.confidence)}>
                        {(doc.confidence * 100).toFixed(0)}% match
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Arrow icon */}
              <div className="flex-shrink-0 text-gray-400 group-hover:text-blue-600 transition-colors self-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Not Found State Component
 */
const NotFoundState = ({ message }) => {
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-gray-700">{message}</p>
          <p className="text-sm text-gray-500 mt-2">
            Try broadening your search or check if the document has been uploaded.
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Main DocumentSearchResult Component
 */
const DocumentSearchResult = ({ result, onDocumentClick }) => {
  if (!result) return null;

  const { action, message, uiData } = result;

  // Render not found state
  if (action === 'not_found') {
    return (
      <div className="my-4">
        <NotFoundState message={message} />
      </div>
    );
  }

  // Render single document result
  if (action === 'show_single' && uiData?.document) {
    return (
      <div className="my-4">
        {/* Comforting message is rendered by parent as markdown */}
        <SingleDocumentCard
          document={uiData.document}
          matchedCriteria={uiData.matchedCriteria}
          preview={uiData.preview}
          onDocumentClick={onDocumentClick}
        />
        <p className="text-xs text-gray-500 mt-2 text-center">
          Click to open document
        </p>
      </div>
    );
  }

  // Render multiple documents result
  if (action === 'show_multiple' && uiData?.documents) {
    return (
      <div className="my-4">
        {/* Comforting message is rendered by parent as markdown */}
        <MultipleDocumentsList
          documents={uiData.documents}
          note={uiData.note}
          onDocumentClick={onDocumentClick}
        />
        <p className="text-xs text-gray-500 mt-3 text-center">
          Click any document to open it
        </p>
      </div>
    );
  }

  return null;
};

export default DocumentSearchResult;
