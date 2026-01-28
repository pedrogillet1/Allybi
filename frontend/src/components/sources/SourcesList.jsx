import React from 'react';
import { Download, ExternalLink, Folder, FileText } from 'lucide-react';
import SourcePill from '../attachments/pills/SourcePill';

const SourcesList = ({ sources = [], variant, navType, introText, onSelect }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

  // Pills variant: compact inline pills using SourcePill
  if (variant === 'pills') {
    return (
      <div>
        {introText && (
          <p className="text-sm text-gray-600 mb-2">{introText}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {sources.map((source, index) => (
            <SourcePill
              key={`${source.docId || source.documentId || index}`}
              source={source}
              onOpen={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  // Inline variant: lighter rendering with click support
  if (variant === 'inline') {
    return (
      <div>
        {introText && (
          <p className="text-sm text-gray-600 mb-2">{introText}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {sources.map((source, index) => (
            <button
              key={`${source.docId || source.documentId || index}`}
              type="button"
              onClick={() => onSelect?.(source)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded-lg border border-gray-200 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="truncate max-w-[200px]">{source.filename || source.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default: full card layout (original behavior)
  const getRelevanceColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-300';
    if (score >= 60) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const getRelevanceLabel = (score) => {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  };

  return (
    <div className="mt-4 border-t border-gray-200 pt-3">
      {introText ? (
        <p className="text-sm text-gray-600 mb-2">{introText}</p>
      ) : (
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Sources ({sources.length})
        </h3>
      )}

      <div className="space-y-2">
        {sources.map((source, index) => {
          const card = (
            <div
              key={`${source.docId || source.documentId || index}`}
              className={`bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors${onSelect ? ' cursor-pointer' : ''}`}
              onClick={onSelect ? () => onSelect(source) : undefined}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(source); } } : undefined}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">
                    [{index + 1}] {source.filename || source.title}
                  </h4>
                  {source.location && (
                    <p className="text-sm text-gray-600 mt-1">
                      {source.location}
                    </p>
                  )}
                </div>

                {/* Relevance Badge */}
                {source.relevanceScore !== undefined && (
                  <div
                    className={`px-2 py-1 rounded-md text-xs font-medium border ${getRelevanceColor(
                      source.relevanceScore
                    )}`}
                  >
                    {getRelevanceLabel(source.relevanceScore)}: {source.relevanceScore.toFixed(0)}%
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                {source.folderPath && (
                  <div className="flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    <span>{source.folderPath}</span>
                  </div>
                )}

                {source.categoryName && (
                  <div className="flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    <span>{source.categoryName}</span>
                  </div>
                )}

                {source.relevanceExplanation && (
                  <div className="text-xs text-gray-500 italic mt-1">
                    {source.relevanceExplanation}
                  </div>
                )}
              </div>

              {/* Actions — only show when no onSelect handler (avoid double navigation) */}
              {!onSelect && (
                <div className="flex gap-2">
                  {source.viewUrl && (
                    <a
                      href={source.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </a>
                  )}

                  {source.downloadUrl && (
                    <a
                      href={source.downloadUrl}
                      download
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  )}
                </div>
              )}
            </div>
          );
          return card;
        })}
      </div>
    </div>
  );
};

export default SourcesList;
