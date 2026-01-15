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
 * Users dashboard page component
 * @returns {React.ReactElement}
 */
export const Users = () => {
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
      .getUsers()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load users data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Users">
        <LoadingSpinner message="Loading users data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Users">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Users">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="Active Users (24h)"
          value={data.activeUsers.current}
          change={data.activeUsers.change}
        />
        <MetricCard
          label="Total Queries"
          value={data.totalQueries.count}
          changeLabel={`${data.totalQueries.perUserAvg} per user avg`}
        />
        <MetricCard
          label="New Users (7d)"
          value={data.newUsers.count}
          change={data.newUsers.change}
        />
        <MetricCard
          label="Avg Session Duration"
          value={`${data.avgSessionDuration.current}min`}
          change={data.avgSessionDuration.change}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card title="User Activity (Last 7 Days)">
          <SimpleLineChart
            data={data.userActivity}
            xKey="date"
            lines={[
              { key: 'active', color: '#181818', name: 'Active Users' },
              { key: 'new', color: '#10B981', name: 'New Users' },
            ]}
          />
        </Card>
        <Card title="Query Volume by Hour">
          <SimpleBarChart data={data.queryVolumeByHour} xKey="hour" yKey="count" />
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Top Users by Activity">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-text-secondary font-semibold">User</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Queries</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Docs</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((user, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="py-2 text-text">{user.user}</td>
                    <td className="py-2 text-text">{user.queries}</td>
                    <td className="py-2 text-text">{user.docsUploaded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Feature Usage">
          <SimpleBarChart
            data={data.featureUsage}
            xKey="name"
            yKey="count"
            layout="vertical"
            height={250}
          />
        </Card>
        <Card title="Engagement Metrics">
          <div className="space-y-3">
            {data.engagementMetrics.map((metric, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">{metric.name}</span>
                <span className="text-text font-semibold">{metric.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
