import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, Clock3, TimerReset } from 'lucide-react';
import AdminLayout from './AdminLayout';
import DataTable from './DataTable';
import MetricCard from './MetricCard';
import { useTelemetryLatency, useTelemetryQueries } from '../../hooks/useTelemetry';

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

const formatMs = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${Math.round(Number(value)).toLocaleString()} ms`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(1)}%`;
};

const queryColumns = [
  {
    key: 'query',
    label: 'Query',
    render: (value) => {
      const text = String(value || '');
      return text.length > 72 ? `${text.slice(0, 72)}...` : text;
    },
  },
  { key: 'intent', label: 'Intent' },
  { key: 'domain', label: 'Domain' },
  { key: 'latencyBucket', label: 'Bucket' },
  {
    key: 'ttftMs',
    label: 'TTFT',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'firstUsefulContentMs',
    label: 'TTFUC',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'totalLatencyMs',
    label: 'Total',
    render: (value) => formatMs(value),
    align: 'right',
  },
  { key: 'createdAt', label: 'Time', format: 'datetime' },
];

const slowestColumns = [
  {
    key: 'query',
    label: 'Slow Query',
    render: (value) => {
      const text = String(value || '');
      return text.length > 84 ? `${text.slice(0, 84)}...` : text;
    },
  },
  { key: 'answerMode', label: 'Mode' },
  { key: 'latencyBucket', label: 'Bucket' },
  {
    key: 'ackMs',
    label: 'Ack',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'ttftMs',
    label: 'TTFT',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'retrievalMs',
    label: 'Retrieval',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'llmMs',
    label: 'LLM',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'formattingMs',
    label: 'Formatting',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'totalMs',
    label: 'Total',
    render: (value) => formatMs(value),
    align: 'right',
  },
];

const bucketColumns = [
  { key: 'bucket', label: 'Bucket' },
  { key: 'grade', label: 'Grade', align: 'center' },
  {
    key: 'score',
    label: 'Score',
    render: (value) => (value === null || value === undefined ? '-' : Math.round(value)),
    align: 'right',
  },
  {
    key: 'sampleCount',
    label: 'Queries',
    format: 'number',
    align: 'right',
  },
  {
    key: 'ackMsP95',
    label: 'Ack p95',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'ttftP95',
    label: 'TTFT p95',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'firstUsefulContentMsP95',
    label: 'TTFUC p95',
    render: (value) => formatMs(value),
    align: 'right',
  },
  {
    key: 'totalMsP95',
    label: 'Total p95',
    render: (value) => formatMs(value),
    align: 'right',
  },
];

const toBucketRows = (buckets) =>
  Object.entries(buckets || {})
    .filter(([bucket]) => bucket !== 'global')
    .map(([bucket, value]) => ({
      id: bucket,
      bucket,
      grade: value?.grade || '-',
      score: value?.score ?? null,
      sampleCount: value?.count ?? 0,
      ackMsP95: value?.stats?.ackMs?.p95 ?? null,
      ttftP95: value?.stats?.ttftMs?.p95 ?? null,
      firstUsefulContentMsP95: value?.stats?.firstUsefulContentMs?.p95 ?? null,
      totalMsP95: value?.stats?.totalMs?.p95 ?? null,
    }));

const AdminQueries = () => {
  const [range, setRange] = useState('7d');
  const { data: queriesData, loading: queriesLoading, error: queriesError } = useTelemetryQueries({
    range,
    limit: 50,
  });
  const { data: latencyData, loading: latencyLoading, error: latencyError } = useTelemetryLatency({
    range,
    limit: 20,
  });

  const summary = latencyData?.data?.summary || null;
  const summaryStats = summary?.stats || null;
  const bucketRows = useMemo(
    () => toBucketRows(latencyData?.data?.buckets || {}),
    [latencyData],
  );
  const slowestRows = latencyData?.data?.slowest || [];
  const queryRows = queriesData?.items || queriesData?.queries || [];

  const error = queriesError || latencyError;

  if (error) {
    return (
      <AdminLayout title="Queries" subtitle="Latency grading and slow-turn triage">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load query telemetry</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Queries"
      subtitle="Latency grading, stream health, and slow-turn investigation"
    >
      <RangeSelector range={range} onChange={setRange} />

      <div className="metrics-grid">
        <MetricCard
          title="Latency Grade"
          value={summary?.grade || '-'}
          subtitle={`Score ${summary?.score ?? '-'}`}
          icon={Activity}
          loading={latencyLoading}
          color={(summary?.grade || 'F').startsWith('A') ? 'green' : summary?.grade === 'B' ? 'blue' : 'red'}
        />
        <MetricCard
          title="Ack p95"
          value={summaryStats?.ackMs?.p95 ?? null}
          subtitle="Request to chat_start"
          icon={TimerReset}
          loading={latencyLoading}
          color="blue"
        />
        <MetricCard
          title="TTFT p95"
          value={summaryStats?.ttftMs?.p95 ?? null}
          subtitle="Request to first delta"
          icon={Clock3}
          loading={latencyLoading}
          color="yellow"
        />
        <MetricCard
          title="Total p95"
          value={summaryStats?.totalMs?.p95 ?? null}
          subtitle="Request to done"
          icon={AlertCircle}
          loading={latencyLoading}
          color="red"
        />
        <MetricCard
          title="Streams < 1.2s"
          value={formatPercent(summaryStats?.deltaBefore1200Rate ?? null)}
          subtitle="First delta before 1.2s"
          icon={Activity}
          loading={latencyLoading}
          color="green"
        />
        <MetricCard
          title="Abort Rate"
          value={formatPercent(summaryStats?.abortRate ?? null)}
          subtitle="Disconnected or aborted streams"
          icon={AlertCircle}
          loading={latencyLoading}
          color="yellow"
        />
      </div>

      <DataTable
        title="Latency Buckets"
        columns={bucketColumns}
        data={bucketRows}
        loading={latencyLoading}
        pageSize={5}
        searchable={false}
        pagination={false}
        emptyMessage="No latency buckets available"
      />

      <DataTable
        title="Slowest Queries"
        columns={slowestColumns}
        data={slowestRows}
        loading={latencyLoading}
        pageSize={10}
        emptyMessage="No slow queries captured for this range"
      />

      <DataTable
        title="Query Log"
        columns={queryColumns}
        data={queryRows}
        loading={queriesLoading || latencyLoading}
        pageSize={20}
        emptyMessage="No query telemetry available"
      />
    </AdminLayout>
  );
};

export default AdminQueries;
