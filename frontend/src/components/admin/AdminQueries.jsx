import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import DataTable from './DataTable';
import { useTelemetryQueries } from '../../hooks/useTelemetry';

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
      return text.length > 60 ? text.slice(0, 60) + '...' : text;
    },
  },
  { key: 'intent', label: 'Intent' },
  { key: 'domain', label: 'Domain' },
  { key: 'topScore', label: 'Top Score', format: 'number', align: 'right' },
  {
    key: 'adequate',
    label: 'Adequate',
    render: (value) => (value ? 'Yes' : 'No'),
    align: 'center',
  },
  { key: 'totalMs', label: 'Latency (ms)', format: 'number', align: 'right' },
  { key: 'timestamp', label: 'Time', format: 'datetime' },
];

const AdminQueries = () => {
  const [range, setRange] = useState('7d');
  const { data, loading, error } = useTelemetryQueries({ range });

  if (error) {
    return (
      <AdminLayout title="Queries" subtitle="Search query log and performance">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load queries</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Queries" subtitle="Search query log and performance">
      <RangeSelector range={range} onChange={setRange} />
      <DataTable
        title="Query Log"
        columns={columns}
        data={data?.queries || data || []}
        loading={loading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminQueries;
