import React, { useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import AdminLayout from './AdminLayout';
import MetricCard from './MetricCard';
import DataTable from './DataTable';
import { useTelemetryOverview, useTelemetryErrors } from '../../hooks/useTelemetry';

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

const errorColumns = [
  { key: 'service', label: 'Service' },
  { key: 'errorType', label: 'Error Type' },
  { key: 'severity', label: 'Severity' },
  { key: 'statusCode', label: 'Status', format: 'number', align: 'right' },
  { key: 'message', label: 'Message', render: (v) => { const t = String(v || ''); return t.length > 60 ? t.slice(0, 60) + '...' : t; } },
  { key: 'createdAt', label: 'Time', format: 'datetime' },
];

const AdminReliability = () => {
  const [range, setRange] = useState('7d');
  const { data: overview, loading: oLoading } = useTelemetryOverview(range);
  const { data: errors, loading: eLoading, error } = useTelemetryErrors({ range });

  if (error) {
    return (
      <AdminLayout title="Reliability" subtitle="Error rates and system stability">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load reliability data</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Reliability" subtitle="Error rates and system stability">
      <RangeSelector range={range} onChange={setRange} />

      <div className="metrics-grid">
        <MetricCard
          title="Error Rate"
          value={overview?.errorRate}
          format="percent"
          icon={AlertCircle}
          loading={oLoading}
        />
        <MetricCard
          title="Total Errors"
          value={overview?.errorCount ?? overview?.totalErrors}
          icon={ShieldCheck}
          loading={oLoading}
        />
      </div>

      <DataTable
        title="Error Log"
        columns={errorColumns}
        data={errors?.errors || errors || []}
        loading={eLoading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminReliability;
