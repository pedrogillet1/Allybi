import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../context/DocumentsContext';

const FileBreakdown = () => {
  const { t } = useTranslation();
  const { documents, getFileBreakdown } = useDocuments();
  const breakdown = getFileBreakdown();

  // Map file extensions to categories
  const getCategoryForExt = (ext) => {
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    const spreadsheetExts = ['xls', 'xlsx', 'csv', 'ods'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];

    if (videoExts.includes(ext)) return 'Video';
    if (docExts.includes(ext)) return 'Document';
    if (spreadsheetExts.includes(ext)) return 'Spreadsheet';
    if (imageExts.includes(ext)) return 'Image';
    return 'Other';
  };

  // Group documents by category
  const categoryBreakdown = {};
  let totalSize = 0;

  documents.forEach(doc => {
    const ext = doc.filename.split('.').pop().toLowerCase();
    const category = getCategoryForExt(ext);

    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = { count: 0, size: 0 };
    }

    categoryBreakdown[category].count++;
    categoryBreakdown[category].size += doc.size || 0;
    totalSize += doc.size || 0;
  });

  // Calculate percentages and angles for pie chart
  const categories = Object.keys(categoryBreakdown).sort();
  let currentAngle = 0;
  const pieSegments = categories.map((category, index) => {
    const percentage = totalSize > 0 ? (categoryBreakdown[category].size / totalSize) * 100 : 25;
    const angleSpan = (percentage / 100) * 360;
    const segment = {
      category,
      count: categoryBreakdown[category].count,
      size: categoryBreakdown[category].size,
      startAngle: currentAngle,
      endAngle: currentAngle + angleSpan - 4, // 4 degree gap
      color: ['black', 'rgba(0, 0, 0, 0.80)', 'rgba(0, 0, 0, 0.60)', 'rgba(0, 0, 0, 0.40)'][index % 4]
    };
    currentAngle += angleSpan;
    return segment;
  });
  // Function to create SVG arc path with rounded corners
  const createArcPath = (startAngle, endAngle, innerRadius, outerRadius, cornerRadius = 12) => {
    // Helper to calculate angle offset for corner radius
    const cornerAngleOffset = (cornerRadius / outerRadius) * (180 / Math.PI);

    // Adjust angles to leave room for rounded corners
    const adjustedStart = startAngle + cornerAngleOffset;
    const adjustedEnd = endAngle - cornerAngleOffset;

    // Calculate all corner points
    // Outer arc corners
    const outerStart = polarToCartesian(180, 90, outerRadius, adjustedEnd);
    const outerEnd = polarToCartesian(180, 90, outerRadius, adjustedStart);

    // Inner arc corners
    const innerStart = polarToCartesian(180, 90, innerRadius, adjustedEnd);
    const innerEnd = polarToCartesian(180, 90, innerRadius, adjustedStart);

    // Corner transition points (where rounded corners begin/end)
    const outerCornerStart = polarToCartesian(180, 90, outerRadius, endAngle);
    const outerCornerEnd = polarToCartesian(180, 90, outerRadius, startAngle);
    const innerCornerStart = polarToCartesian(180, 90, innerRadius, endAngle);
    const innerCornerEnd = polarToCartesian(180, 90, innerRadius, startAngle);

    const largeArcFlag = (adjustedEnd - adjustedStart) <= 180 ? "0" : "1";

    // Create path with rounded corners using arcs
    const d = [
      `M ${outerStart.x} ${outerStart.y}`,
      // Outer arc
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
      // Rounded corner (outer to inner, end side)
      `A ${cornerRadius} ${cornerRadius} 0 0 1 ${innerEnd.x} ${innerEnd.y}`,
      // Inner arc
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
      // Rounded corner (inner to outer, start side)
      `A ${cornerRadius} ${cornerRadius} 0 0 1 ${outerStart.x} ${outerStart.y}`,
      'Z'
    ].join(' ');

    return d;
  };

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const innerRadius = 100;
  const outerRadius = 180;

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Get icon for category
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Video':
        return (
          <div style={{width: 20, height: 20, position: 'relative'}}>
            <div style={{width: 11.67, height: 10.83, left: 1.67, top: 5, position: 'absolute', borderRadius: 2.92, outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
            <div style={{width: 5, height: 9.17, left: 13.34, top: 5.83, position: 'absolute', outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
          </div>
        );
      case 'Document':
      case 'Spreadsheet':
        return (
          <div style={{width: 20, height: 20, position: 'relative'}}>
            <div style={{width: 13.33, height: 16.67, left: 3.33, top: 1.67, position: 'absolute', borderRadius: 4, outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
            <div style={{width: 3.75, height: 4.58, left: 12.50, top: 2.08, position: 'absolute', outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
          </div>
        );
      case 'Image':
        return (
          <div style={{width: 20, height: 20, position: 'relative'}}>
            <div style={{width: 16.67, height: 16.67, left: 1.67, top: 1.67, position: 'absolute', borderRadius: 4.17, outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
            <div style={{width: 16.25, height: 5.83, left: 2.08, top: 9.17, position: 'absolute', outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
            <div style={{width: 3.33, height: 3.33, left: 8.33, top: 8.33, position: 'absolute', transform: 'rotate(180deg)', transformOrigin: 'top left', borderRadius: 9999, outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
          </div>
        );
      default:
        return (
          <div style={{width: 20, height: 20, position: 'relative'}}>
            <div style={{width: 16.67, height: 16.67, left: 1.67, top: 1.67, position: 'absolute', borderRadius: 10, outline: '1.25px black solid', outlineOffset: '-0.62px'}} />
          </div>
        );
    }
  };

  return (
    <div style={{width: 527, alignSelf: 'stretch', padding: 16, background: 'white', overflow: 'hidden', borderRadius: 20, outline: '1px #E6E6EC solid', outlineOffset: '-1px', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 16, display: 'inline-flex'}}>
        <div style={{alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 16, display: 'inline-flex'}}>
            <div style={{flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'inline-flex'}}>
                <div style={{alignSelf: 'stretch', justifyContent: 'center', display: 'flex', flexDirection: 'column', color: '#101828', fontSize: 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 26, wordWrap: 'break-word', textShadow: '0px 0px 0px rgba(244, 235, 255, 1.00)'}}>{t('fileBreakdown.title')}</div>
            </div>
        </div>
        <div style={{alignSelf: 'stretch', flex: '1 1 0', position: 'relative', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', display: 'flex'}}>
            <div style={{width: 360, height: 180, position: 'relative', overflow: 'visible'}}>
                <svg width="360" height="180" viewBox="0 0 360 180" style={{overflow: 'visible'}}>
                  {pieSegments.map((segment, index) => (
                    <path
                      key={index}
                      d={createArcPath(segment.startAngle, segment.endAngle, innerRadius, outerRadius, 12)}
                      fill={segment.color}
                      opacity={1}
                      style={{
                        strokeLinejoin: 'round',
                        strokeLinecap: 'round'
                      }}
                    />
                  ))}
                </svg>
            </div>
            <div style={{alignSelf: 'stretch', padding: 14, background: '#F5F5F5', borderRadius: 18, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'inline-flex'}}>
                {categories.length > 0 ? (
                  <>
                    <div style={{flex: '1 1 0', borderRadius: 8, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 12, display: 'inline-flex'}}>
                      {categories.slice(0, Math.ceil(categories.length / 2)).map((category) => (
                        <div key={category} style={{alignSelf: 'stretch', paddingTop: 2, paddingBottom: 2, borderRadius: 8, justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'inline-flex'}}>
                          <div style={{width: 40, height: 40, background: 'white', borderRadius: 100, justifyContent: 'center', alignItems: 'center', display: 'flex'}}>
                            {getCategoryIcon(category)}
                          </div>
                          <div style={{flex: '1 1 0', justifyContent: 'flex-start', alignItems: 'center', gap: 10, display: 'flex'}}>
                            <div style={{flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4, display: 'inline-flex'}}>
                              <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: 19.60, wordWrap: 'break-word'}}>{category}</div>
                              <div style={{justifyContent: 'center', alignItems: 'center', gap: 10, display: 'inline-flex'}}>
                                <div style={{color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 15.40, wordWrap: 'break-word'}}>{t('folderPreview.filesCount', { count: categoryBreakdown[category].count })}</div>
                                <div style={{width: 6, height: 6, opacity: 0.90, background: '#6C6B6E', borderRadius: 9999}} />
                                <div style={{color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 15.40, wordWrap: 'break-word'}}>{formatSize(categoryBreakdown[category].size)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {categories.length > 1 && (
                      <div style={{flex: '1 1 0', borderRadius: 8, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 12, display: 'inline-flex'}}>
                        {categories.slice(Math.ceil(categories.length / 2)).map((category) => (
                          <div key={category} style={{alignSelf: 'stretch', paddingTop: 2, paddingBottom: 2, borderRadius: 8, justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'inline-flex'}}>
                            <div style={{width: 40, height: 40, background: 'white', borderRadius: 100, justifyContent: 'center', alignItems: 'center', display: 'flex'}}>
                              {getCategoryIcon(category)}
                            </div>
                            <div style={{flex: '1 1 0', justifyContent: 'flex-start', alignItems: 'center', gap: 10, display: 'flex'}}>
                              <div style={{flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4, display: 'inline-flex'}}>
                                <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: 19.60, wordWrap: 'break-word'}}>{category}</div>
                                <div style={{justifyContent: 'center', alignItems: 'center', gap: 10, display: 'inline-flex'}}>
                                  <div style={{color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 15.40, wordWrap: 'break-word'}}>{t('folderPreview.filesCount', { count: categoryBreakdown[category].count })}</div>
                                  <div style={{width: 6, height: 6, opacity: 0.90, background: '#6C6B6E', borderRadius: 9999}} />
                                  <div style={{color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 15.40, wordWrap: 'break-word'}}>{formatSize(categoryBreakdown[category].size)}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{flex: '1 1 0', textAlign: 'center', color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{t('fileBreakdown.noFiles')}</div>
                )}
            </div>
            <div style={{left: 196, top: 90, position: 'absolute', borderRadius: 8, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', display: 'flex'}}>
                <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 30, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: 42, wordWrap: 'break-word'}}>{t('folderPreview.filesCount', { count: documents.length })}</div>
                <div style={{alignSelf: 'stretch', textAlign: 'center', color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 22.40, wordWrap: 'break-word'}}>{t('fileBreakdown.total')}</div>
            </div>
        </div>
    </div>
  );
};

export default FileBreakdown;
