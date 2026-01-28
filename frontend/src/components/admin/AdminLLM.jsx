import React, { useState } from 'react';
import { AlertCircle, Cpu } from 'lucide-react';
import AdminLayout from './AdminLayout';
import MetricCard from './MetricCard';
import DataTable from './DataTable';
import { useTelemetryLLM, useTelemetryLLMProviders } from '../../hooks/useTelemetry';

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

const callColumns = [
  { key: 'model', label: 'Model' },
  { key: 'inputTokens', label: 'Input Tokens', format: 'number', align: 'right' },
  { key: 'outputTokens', label: 'Output Tokens', format: 'number', align: 'right' },
  { key: 'cost', label: 'Cost', format: 'currency', align: 'right' },
  { key: 'latencyMs', label: 'Latency (ms)', format: 'number', align: 'right' },
  {
    key: 'success',
    label: 'Status',
    render: (value) => (value ? 'OK' : 'FAIL'),
    align: 'center',
  },
];

const AdminLLM = () => {
  const [range, setRange] = useState('7d');
  const { data: providers, loading: pLoading } = useTelemetryLLMProviders(range);
  const { data: calls, loading: cLoading, error } = useTelemetryLLM({ range });

  if (error) {
    return (
      <AdminLayout title="LLM / Cost" subtitle="Provider usage, tokens, and cost breakdown">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load LLM data</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  const providerList = providers?.providers || providers || [];

  return (
    <AdminLayout title="LLM / Cost" subtitle="Provider usage, tokens, and cost breakdown">
      <RangeSelector range={range} onChange={setRange} />

      {/* Provider summary cards */}
      {providerList.length > 0 && (
        <div className="metrics-grid" style={{ marginBottom: 24 }}>
          {providerList.map((p) => (
            <MetricCard
              key={p.provider || p.name}
              title={p.provider || p.name || 'Unknown'}
              value={p.totalCost ?? p.cost}
              format="currency"
              icon={Cpu}
              loading={pLoading}
              subtitle={`${(p.totalTokens ?? p.tokens ?? 0).toLocaleString()} tokens`}
            />
          ))}
        </div>
      )}

      <DataTable
        title="Recent LLM Calls"
        columns={callColumns}
        data={calls?.calls || calls || []}
        loading={cLoading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminLLM;
