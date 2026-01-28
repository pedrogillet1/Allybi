import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import DataTable from './DataTable';
import { useTelemetryQuality } from '../../hooks/useTelemetry';

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

const columns = [
  {
    key: 'query',
    label: 'Query',
    render: (value) => {
      const text = String(value || '');
      return text.length > 50 ? text.slice(0, 50) + '...' : text;
    },
  },
  { key: 'topScore', label: 'Top Score', format: 'number', align: 'right' },
  { key: 'avgScore', label: 'Avg Score', format: 'number', align: 'right' },
  {
    key: 'adequate',
    label: 'Adequate',
    render: (value) => (value ? 'Yes' : 'No'),
    align: 'center',
  },
  {
    key: 'hadFallback',
    label: 'Fallback',
    render: (value) => (value ? 'Yes' : 'No'),
    align: 'center',
  },
  { key: 'failureCategory', label: 'Failure Category' },
];

const AdminQuality = () => {
  const [range, setRange] = useState('7d');
  const { data, loading, error } = useTelemetryQuality({ range });

  if (error) {
    return (
      <AdminLayout title="Answer Quality" subtitle="Retrieval accuracy and answer adequacy">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load quality data</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Answer Quality" subtitle="Retrieval accuracy and answer adequacy">
      <RangeSelector range={range} onChange={setRange} />
      <DataTable
        title="Quality Metrics"
        columns={columns}
        data={data?.results || data || []}
        loading={loading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminQuality;
