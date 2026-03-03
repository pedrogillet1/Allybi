import React from 'react';
import { Download, ExternalLink, Folder, FileText } from 'lucide-react';
import SourcePill from '../attachments/pills/SourcePill';
import InlineNavPill from '../attachments/pills/InlineNavPill';
import cleanDocumentName from '../../utils/cleanDocumentName';

const buildSourceKey = (source, index) => {
  const docKey = source.docId || source.documentId || source.id || 'source';
  const locationKey =
    source.locationKey ||
    source.location ||
    source.page ||
    source.sheet ||
    source.slide ||
    source.cell ||
    source.section ||
    '';
  return `${docKey}:${locationKey}:${index}`;
};

const SourcesList = ({ sources = [], variant, navType, introText, onSelect }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

  // Pills variant: compact inline pills using SourcePill
  if (variant === 'pills') {
    return (
      <div>
        {introText && (
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>{introText}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {sources.map((source, index) => (
            <SourcePill
              key={buildSourceKey(source, index)}
              source={source}
              onOpen={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  // Inline variant: source pills with format-specific icons
  if (variant === 'inline') {
    return (
      <div>
        {introText && (
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>{introText}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {sources.map((source, index) => (
            <SourcePill
              key={buildSourceKey(source, index)}
              source={source}
              onOpen={onSelect}
            />
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
              key={buildSourceKey(source, index)}
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
                    [{index + 1}] {cleanDocumentName(source.filename || source.title)}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {source.folderPath.split('/').filter(Boolean).map((segment, i, arr) => (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M6 3.5L10.5 8L6 12.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        <InlineNavPill
                          label={segment}
                          icon={<Folder style={{ width: 16, height: 16, color: '#9CA3AF' }} />}
                          style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                        />
                      </React.Fragment>
                    ))}
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
