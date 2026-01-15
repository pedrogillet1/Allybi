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
 * Overview dashboard page component
 * @returns {React.ReactElement}
 */
export const Overview = () => {
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
      .getOverview()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load overview data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Overview">
        <LoadingSpinner message="Loading overview data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Overview">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Overview">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="System Health"
          value={data.systemHealth.status}
          changeLabel={`${data.systemHealth.uptime}% uptime`}
        />
        <MetricCard
          label="Active Users"
          value={data.activeUsers.current}
          change={data.activeUsers.change}
        />
        <MetricCard label="Requests/Min" value={data.requestsPerMin.current} />
        <MetricCard
          label="Avg Response"
          value={`${data.avgResponseTime.current}s`}
          change={data.avgResponseTime.change}
        />
      </div>

      {/* Request Volume Chart */}
      <Card title="Request Volume - Last 24 Hours" className="mb-5">
        <SimpleLineChart
          data={data.requestVolume}
          xKey="time"
          lines={[{ key: 'count', color: '#181818', name: 'Requests' }]}
        />
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Intent Distribution" className="lg:col-span-2">
          <SimpleBarChart
            data={data.intentDistribution}
            xKey="name"
            yKey="value"
            layout="vertical"
          />
        </Card>
        <Card title="Service Status">
          <div className="space-y-3">
            {data.serviceStatus.map((service) => (
              <div key={service.name} className="flex items-center justify-between">
                <span className="text-text">{service.name}</span>
                <span
                  className={`text-sm font-semibold ${
                    service.status === 'Healthy' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {service.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
