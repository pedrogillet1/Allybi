import React, { useEffect, useState, useCallback } from 'react';
import { PageLayout } from '../layout/PageLayout';
import { MetricCard } from '../ui/MetricCard';
import { Card } from '../ui/Card';
import { CheckCircle } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { dashboardApi as api } from '../../../services/dashboard/api';

/**
 * Database dashboard page component
 * @returns {React.ReactElement}
 */
export const Database = () => {
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
      .getDatabase()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load database data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <PageLayout breadcrumb="Dashboard / Database & Security">
        <LoadingSpinner message="Loading database data..." />
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout breadcrumb="Dashboard / Database & Security">
        <ErrorMessage message={error || 'Failed to load data'} onRetry={fetchData} />
      </PageLayout>
    );
  }

  return (
    <PageLayout breadcrumb="Dashboard / Database & Security">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <MetricCard
          label="Total Records"
          value={data.totalRecords}
          changeLabel="Documents, Vectors, Logs"
        />
        <Card>
          <p className="text-text-secondary text-sm mb-2">Encryption Status</p>
          <div className="flex items-center gap-2">
            <CheckCircle className="text-success" size={32} />
            <div>
              <p className="text-success text-2xl font-bold">{data.encryptionStatus}</p>
              <p className="text-text-secondary text-xs">Zero Knowledge Active</p>
            </div>
          </div>
        </Card>
        <MetricCard
          label="Storage Used"
          value={`${data.storageUsed.value} ${data.storageUsed.unit}`}
          changeLabel={`${data.storageUsed.quotaPercentage}% of quota`}
        />
        <MetricCard
          label="Client Keys Active"
          value={data.clientKeysActive}
          changeLabel="All users verified"
        />
      </div>

      {/* Data Explorer */}
      <Card title="Data Explorer - Documents Table" className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-secondary font-semibold">ID</th>
                <th className="text-left py-2 text-text-secondary font-semibold">User ID</th>
                <th className="text-left py-2 text-text-secondary font-semibold">Title</th>
                <th className="text-left py-2 text-text-secondary font-semibold">
                  Content (Encrypted)
                </th>
                <th className="text-left py-2 text-text-secondary font-semibold">Status</th>
                <th className="text-left py-2 text-text-secondary font-semibold">Created At</th>
              </tr>
            </thead>
            <tbody>
              {data.documents.map((doc) => (
                <tr key={doc.id} className="border-b border-border">
                  <td className="py-2 text-text font-mono text-xs">{doc.id}</td>
                  <td className="py-2 text-text">{doc.userId}</td>
                  <td className="py-2 text-text">{doc.title}</td>
                  <td className="py-2 text-text font-mono text-xs">{doc.content}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-1 text-success text-xs font-semibold">
                      <div className="w-2 h-2 bg-success rounded-full"></div>
                      {doc.status}
                    </span>
                  </td>
                  <td className="py-2 text-text text-xs">{doc.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Zero Knowledge Verification">
          <div className="space-y-3">
            {data.zkVerification.map((check, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-text">{check.check}</span>
                <span className="text-success font-semibold flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  {check.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Database Performance">
          <div className="space-y-3">
            {data.dbPerformance.map((metric, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">{metric.metric}</span>
                <span className="text-text font-semibold">{metric.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent DB Operations">
          <div className="space-y-2">
            {data.recentDbOperations.map((op, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="text-text">{op.operation}</span>
                <span className="text-text-secondary">{op.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
