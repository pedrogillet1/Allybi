import React, { useEffect, useState, useCallback } from 'react';
import { PageLayout } from '../layout/PageLayout';
import { MetricCard } from '../ui/MetricCard';
import { Card } from '../ui/Card';
import { SimpleLineChart } from '../charts/SimpleLineChart';
import { SimpleBarChart } from '../charts/SimpleBarChart';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { dashboardApi as api } from '../../../services/api';

/**
 * Errors dashboard page component
 * @returns {React.ReactElement}
 */
export const Errors = () => {
  /** @type {[Object|null, Function]} */
  const [data, setData] = useState(null);
  /** @type {[boolean, Function]} */
  const [loading, setLoading] = useState(true);
  /** @type {[string|null, Function]} */
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getErrors()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load errors data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Errors">
        <LoadingSpinner message="Loading errors data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Errors">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Errors">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="Error Rate"
          value={`${data.errorRate.current}%`}
          change={data.errorRate.change}
        />
        <MetricCard
          label="Total Errors (24h)"
          value={data.totalErrors.current}
          changeLabel={`vs ${data.totalErrors.previous} yesterday`}
        />
        <MetricCard label="Critical Errors" value={data.criticalErrors} />
        <MetricCard
          label="Avg Resolution Time"
          value={`${data.avgResolutionTime.current}min`}
          change={data.avgResolutionTime.change}
        />
      </div>

      {/* Error Trends Chart */}
      <Card title="Error Trends (7 Days)" className="mb-5">
        <SimpleLineChart
          data={data.errorTrends}
          xKey="date"
          lines={[
            { key: 'total', color: '#181818', name: 'Total Errors' },
            { key: 'critical', color: '#EF4444', name: 'Critical Errors' },
          ]}
        />
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Recent Errors" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-text-secondary font-semibold">Time</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Service</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Error</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentErrors.map((err, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="py-2 text-text">{err.time}</td>
                    <td className="py-2 text-text">{err.service}</td>
                    <td className="py-2 text-text">{err.error}</td>
                    <td className="py-2">
                      <span
                        className={`text-xs font-semibold ${
                          err.status === 'Resolved' ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {err.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Errors by Service">
          <SimpleBarChart
            data={data.errorsByService}
            xKey="name"
            yKey="count"
            layout="vertical"
            height={250}
          />
        </Card>
      </div>

      {/* Fallback Triggers */}
      <Card title="Fallback Triggers" className="mt-5">
        <div className="space-y-2">
          {data.fallbackTriggers.map((trigger, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <span className="text-text">{trigger.name}</span>
              <span className="text-text font-semibold">{trigger.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </PageLayout>
  );
};
