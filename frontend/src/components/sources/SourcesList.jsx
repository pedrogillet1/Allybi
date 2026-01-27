import React from 'react';
import { Download, ExternalLink, Folder, FileText } from 'lucide-react';

const SourcesList = ({ sources = [] }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

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
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Sources ({sources.length})
      </h3>

      <div className="space-y-2">
        {sources.map((source, index) => (
          <div
            key={`${source.documentId}-${index}`}
            className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">
                  [{index + 1}] {source.filename}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  📍 {source.location}
                </p>
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

            {/* Actions */}
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default SourcesList;
