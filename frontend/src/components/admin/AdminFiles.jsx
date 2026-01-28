import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import DataTable from './DataTable';
import { useTelemetryFiles } from '../../hooks/useTelemetry';

const RANGES = ['24h', '7d', '30d', '90d'];

const RangeSelector = ({ range, onChange }) => (
  <div className="range-selector">
    {RANGES.map((r) => (
      <button key={r} className={r === range ? 'active' : ''} onClick={() => onChange(r)}>
        {r}
      </button>
    ))}
  </div>
);

const formatMimeType = (mimeType) => {
  if (!mimeType) return '-';
  const ext = mimeType.split('/').pop()?.toUpperCase() || mimeType;
  const map = {
    'VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT': 'DOCX',
    'VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET': 'XLSX',
    'VND.OPENXMLFORMATS-OFFICEDOCUMENT.PRESENTATIONML.PRESENTATION': 'PPTX',
    'VND.MS-EXCEL': 'XLS',
    'VND.MS-POWERPOINT': 'PPT',
    'MSWORD': 'DOC',
  };
  return map[ext] || ext;
};

const StatusBadge = ({ status }) => {
  const styles = {
    processed: { bg: '#dcfce7', color: '#166534' },
    uploaded: { bg: '#fef3c7', color: '#92400e' },
    processing: { bg: '#dbeafe', color: '#1e40af' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    pending: { bg: '#f3f4f6', color: '#374151' },
  };
  const style = styles[status] || styles.pending;
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      backgroundColor: style.bg,
      color: style.color,
    }}>
      {status || 'unknown'}
    </span>
  );
};

const columns = [
  { key: 'filename', label: 'Filename' },
  { key: 'mimeType', label: 'Format', render: (val) => formatMimeType(val) },
  { key: 'size', label: 'Size', align: 'right' },
  { key: 'createdAt', label: 'Uploaded', format: 'datetime' },
  { key: 'chunksCount', label: 'Chunks', format: 'number', align: 'right' },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  { key: 'userId', label: 'User' },
];

const AdminFiles = () => {
  const [range, setRange] = useState('7d');
  const { data, loading, error } = useTelemetryFiles({ range });

  if (error) {
    return (
      <AdminLayout title="Files" subtitle="Uploaded files and processing status">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load files</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Files" subtitle="Uploaded files and processing status">
      <RangeSelector range={range} onChange={setRange} />
      <DataTable
        title="File List"
        columns={columns}
        data={data?.items || []}
        loading={loading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminFiles;
