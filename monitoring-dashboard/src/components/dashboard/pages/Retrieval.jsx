import React, { useEffect, useState, useCallback } from 'react';
import { PageLayout } from '../layout/PageLayout';
import { MetricCard } from '../ui/MetricCard';
import { Card } from '../ui/Card';
import { SimpleLineChart } from '../charts/SimpleLineChart';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { dashboardApi as api } from '../../../services/api';

/**
 * Retrieval dashboard page component
 * @returns {React.ReactElement}
 */
export const Retrieval = () => {
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
      .getRetrieval()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load retrieval data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Retrieval">
        <LoadingSpinner message="Loading retrieval data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Retrieval">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Retrieval">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="Avg Retrieval Time"
          value={`${data.avgRetrievalTime.current}ms`}
          change={data.avgRetrievalTime.change}
        />
        <MetricCard label="Avg Chunks Retrieved" value={data.avgChunksRetrieved} />
        <MetricCard
          label="Vector Search Accuracy"
          value={`${data.vectorSearchAccuracy.current}%`}
          change={data.vectorSearchAccuracy.change}
        />
        <MetricCard
          label="Documents Indexed"
          value={data.documentsIndexed.total}
          changeLabel={`${data.documentsIndexed.pending} pending`}
        />
      </div>

      {/* Retrieval Performance Chart */}
      <Card title="Retrieval Performance Over Time" className="mb-5">
        <SimpleLineChart
          data={data.retrievalPerformance}
          xKey="time"
          lines={[
            { key: 'retrievalTime', color: '#181818', name: 'Retrieval Time (ms)' },
            { key: 'chunksRetrieved', color: '#10B981', name: 'Chunks Retrieved' },
          ]}
        />
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Top Retrieved Documents" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-text-secondary font-semibold">Document</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Count</th>
                  <th className="text-left py-2 text-text-secondary font-semibold">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {data.topRetrievedDocs.map((doc, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="py-2 text-text">{doc.name}</td>
                    <td className="py-2 text-text">{doc.count}</td>
                    <td className="py-2 text-text">{doc.avgScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Hybrid Search Performance">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-text-secondary text-sm">Vector</span>
                <span className="text-text font-semibold">{data.hybridSearchPerformance.vector}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-text h-2 rounded-full"
                  style={{ width: `${data.hybridSearchPerformance.vector}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-text-secondary text-sm">Keyword</span>
                <span className="text-text font-semibold">{data.hybridSearchPerformance.keyword}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-text h-2 rounded-full"
                  style={{ width: `${data.hybridSearchPerformance.keyword}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-text-secondary text-sm">Combined</span>
                <span className="text-text font-semibold">{data.hybridSearchPerformance.combined}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-success h-2 rounded-full"
                  style={{ width: `${data.hybridSearchPerformance.combined}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
