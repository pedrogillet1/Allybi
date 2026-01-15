import React, { useEffect, useState, useCallback } from 'react';
import { PageLayout } from '../layout/PageLayout';
import { MetricCard } from '../ui/MetricCard';
import { Card } from '../ui/Card';
import { SimpleLineChart } from '../charts/SimpleLineChart';
import { SimpleBarChart } from '../charts/SimpleBarChart';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { dashboardApi as api } from '../../../services/dashboard/api';

/**
 * Intent Analysis dashboard page component
 * @returns {React.ReactElement}
 */
export const IntentAnalysis = () => {
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
      .getIntentAnalysis()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load intent analysis data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Intent Analysis">
        <LoadingSpinner message="Loading intent analysis data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Intent Analysis">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Intent Analysis">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="Classification Accuracy"
          value={`${data.accuracy.current}%`}
          change={data.accuracy.change}
        />
        <MetricCard label="Avg Confidence" value={`${data.avgConfidence}%`} />
        <MetricCard
          label="Fallback Rate"
          value={`${data.fallbackRate.current}%`}
          change={data.fallbackRate.change}
        />
        <MetricCard
          label="Multi-Intent Queries"
          value={data.multiIntentQueries.count}
          changeLabel={`${data.multiIntentQueries.percentage}% of total`}
        />
      </div>

      {/* Classification Over Time */}
      <Card title="Classification Over Time" className="mb-5">
        <SimpleLineChart
          data={data.classificationOverTime}
          xKey="date"
          lines={Object.keys(data.classificationOverTime[0] || {})
            .filter((key) => key !== 'date')
            .map((key, idx) => ({
              key,
              color: ['#181818', '#10B981', '#F59E0B', '#EF4444'][idx % 4],
              name: key,
            }))}
        />
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Top Misclassifications" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-text-secondary font-semibold">Query</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Expected</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Actual</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.topMisclassifications.map((item, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="py-2 text-text">{item.query}</td>
                    <td className="py-2 text-text">{item.expected}</td>
                    <td className="py-2 text-text">{item.actual}</td>
                    <td className="py-2 text-text">{item.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Override Triggers">
          <SimpleBarChart
            data={data.overrideTriggers}
            xKey="name"
            yKey="count"
            layout="vertical"
            height={250}
          />
        </Card>
      </div>
    </PageLayout>
  );
};
