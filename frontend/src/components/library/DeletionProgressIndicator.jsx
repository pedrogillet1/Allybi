import React from 'react';
import ReactDOM from 'react-dom';
import { useDocuments } from '../../context/DocumentsContext';
import { useTranslation } from 'react-i18next';

/**
 * PERFECT DELETE: Deletion Progress Indicator
 * Shows floating progress UI when deletion jobs are running
 * Displays: status, document count progress, retry button for failed jobs
 */
const DeletionProgressIndicator = () => {
  const { t } = useTranslation();
  const { deletionJobs } = useDocuments();

  // Convert Map to array and filter for active/recent jobs
  const activeJobs = Array.from(deletionJobs?.values() || []).filter(
    job => job.status === 'running' || job.status === 'queued' ||
           (job.status === 'failed' && Date.now() - (job.lastUpdate || job.createdAt) < 30000)
  );

  // Don't render if no active jobs
  if (activeJobs.length === 0) return null;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 340,
    }}>
      {activeJobs.map((job) => (
        <DeletionJobCard key={job.targetId} job={job} t={t} />
      ))}
    </div>,
    document.body
  );
};

/**
 * Individual deletion job card
 */
const DeletionJobCard = ({ job, t }) => {
  const isRunning = job.status === 'running';
  const isQueued = job.status === 'queued';
  const isFailed = job.status === 'failed';

  // Calculate progress percentage
  const docsTotal = job.docsTotal || 0;
  const docsDone = job.docsDone || 0;
  const progress = docsTotal > 0 ? Math.round((docsDone / docsTotal) * 100) : 0;

  // Get status icon and color
  const getStatusIcon = () => {
    if (isFailed) return '❌';
    if (isRunning) return '🗑️';
    if (isQueued) return '⏳';
    return '✅';
  };

  const getStatusColor = () => {
    if (isFailed) return '#D92D20';
    if (isRunning) return '#3B82F6';
    if (isQueued) return '#F59E0B';
    return '#10B981';
  };

  const getStatusText = () => {
    if (isFailed) return t('deletion.failed', 'Deletion failed');
    if (isRunning) return t('deletion.deleting', 'Deleting...');
    if (isQueued) return t('deletion.queued', 'Queued');
    return t('deletion.complete', 'Deleted');
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      border: `1px solid ${isFailed ? '#FEE2E2' : '#E6E6EC'}`,
      animation: 'slideIn 0.3s ease-out',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 20 }}>{getStatusIcon()}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 200,
          }}>
            {job.targetName || (job.targetType === 'folder' ? t('deletion.folder', 'Folder') : t('deletion.document', 'Document'))}
          </div>
          <div style={{
            color: getStatusColor(),
            fontSize: 12,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '500',
          }}>
            {getStatusText()}
          </div>
        </div>
      </div>

      {/* Progress bar for running jobs */}
      {(isRunning || isQueued) && docsTotal > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <span style={{
              color: '#6B7280',
              fontSize: 12,
              fontFamily: 'Plus Jakarta Sans',
            }}>
              {t('deletion.progress', 'Progress')}
            </span>
            <span style={{
              color: '#32302C',
              fontSize: 12,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
            }}>
              {docsDone}/{docsTotal} {t('deletion.documents', 'docs')}
            </span>
          </div>
          <div style={{
            position: 'relative',
            height: 6,
            background: '#F3F4F6',
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${progress}%`,
              background: isRunning
                ? 'linear-gradient(90deg, #3B82F6 0%, #2563EB 100%)'
                : '#F59E0B',
              borderRadius: 3,
              transition: 'width 0.3s ease-out',
            }} />
          </div>
        </div>
      )}

      {/* Error message for failed jobs */}
      {isFailed && job.lastError && (
        <div style={{
          background: '#FEF2F2',
          padding: '8px 12px',
          borderRadius: 6,
          marginTop: 8,
        }}>
          <div style={{
            color: '#991B1B',
            fontSize: 12,
            fontFamily: 'Plus Jakarta Sans',
          }}>
            {job.lastError}
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default DeletionProgressIndicator;
