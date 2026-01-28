import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  MessageSquare,
  FileText,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import MetricCard from './MetricCard';
import { useTelemetryOverview, useTelemetryTimeseries } from '../../hooks/useTelemetry';

const RANGES = ['24h', '7d', '30d', '90d'];

const RangeSelector = ({ range, onChange }) => (
  <div className="range-selector">
    {RANGES.map((r) => (
      <button
        key={r}
        className={r === range ? 'active' : ''}
        onClick={() => onChange(r)}
      >
        {r}
      </button>
    ))}
  </div>
);

const AdminOverview = () => {
  const [range, setRange] = useState('7d');
  const { data: overview, loading: oLoading, error: oError } = useTelemetryOverview(range);
  const { data: timeseries, loading: tsLoading } = useTelemetryTimeseries('messages', range);

  const loading = oLoading;

  if (oError) {
    return (
      <AdminLayout title="Overview" subtitle="System-wide metrics">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load overview</h3>
          <p>{oError}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Overview" subtitle="System-wide metrics">
      <RangeSelector range={range} onChange={setRange} />

      <div className="metrics-grid">
        <MetricCard
          title="Total Users"
          value={overview?.totalUsers}
          icon={Users}
          loading={loading}
        />
        <MetricCard
          title="Active Users"
          value={overview?.activeUsers}
          icon={UserCheck}
          loading={loading}
        />
        <MetricCard
          title="Total Messages"
          value={overview?.totalMessages}
          icon={MessageSquare}
          loading={loading}
        />
        <MetricCard
          title="Total Documents"
          value={overview?.totalDocuments}
          icon={FileText}
          loading={loading}
        />
        <MetricCard
          title="Total Cost"
          value={overview?.totalCost}
          format="currency"
          icon={DollarSign}
          loading={loading}
        />
        <MetricCard
          title="Error Rate"
          value={overview?.errorRate}
          format="percent"
          icon={AlertCircle}
          loading={loading}
        />
      </div>

      {/* Timeseries area */}
      <div className="chart-container">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Messages Trend</h3>
            <p className="chart-subtitle">Message volume over time</p>
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

export default AdminOverview;
