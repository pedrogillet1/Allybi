import React, { useState } from 'react';
import { AlertCircle, Activity, Cpu } from 'lucide-react';
import AdminLayout from './AdminLayout';
import MetricCard from './MetricCard';
import { useTelemetryOverview, useTelemetryTimeseries } from '../../hooks/useTelemetry';

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

const AdminApiMetrics = () => {
  const [range, setRange] = useState('7d');
  const { data: overview, loading: oLoading, error: oError } = useTelemetryOverview(range);
  const { data: timeseries, loading: tsLoading } = useTelemetryTimeseries('responseTime', range);

  if (oError) {
    return (
      <AdminLayout title="API Metrics" subtitle="Request latency, throughput, and token usage">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load API metrics</h3>
          <p>{oError}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="API Metrics" subtitle="Request latency, throughput, and token usage">
      <RangeSelector range={range} onChange={setRange} />

      <div className="metrics-grid">
        <MetricCard
          title="Avg Latency"
          value={overview?.avgLatencyMs}
          icon={Activity}
          loading={oLoading}
          subtitle="ms"
        />
        <MetricCard
          title="Total Tokens"
          value={overview?.totalTokens}
          icon={Cpu}
          loading={oLoading}
        />
        <MetricCard
          title="Error Rate"
          value={overview?.errorRate}
          format="percent"
          icon={AlertCircle}
          loading={oLoading}
        />
      </div>

      {/* Response time timeseries */}
      <div className="chart-container">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Response Time</h3>
            <p className="chart-subtitle">API response latency over time</p>
          </div>
        </div>
        {tsLoading ? (
          <div className="chart-placeholder">Loading timeseries...</div>
        ) : timeseries && timeseries.length > 0 ? (
          <div className="chart-placeholder">
            {timeseries.length} data points &mdash; {timeseries[0]?.date} to {timeseries[timeseries.length - 1]?.date}
          </div>
        ) : (
          <div className="chart-placeholder">No timeseries data available</div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminApiMetrics;
