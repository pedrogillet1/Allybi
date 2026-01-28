import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import DataTable from './DataTable';
import { useTelemetryUsers } from '../../hooks/useTelemetry';

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

const columns = [
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Name' },
  { key: 'tier', label: 'Tier' },
  { key: 'documents', label: 'Documents', format: 'number', align: 'right' },
  { key: 'conversations', label: 'Conversations', format: 'number', align: 'right' },
  { key: 'lastActive', label: 'Last Active', format: 'datetime' },
];

const AdminUsers = () => {
  const [range, setRange] = useState('7d');
  const { data, loading, error } = useTelemetryUsers({ range });

  if (error) {
    return (
      <AdminLayout title="Users" subtitle="User activity and engagement">
        <div className="admin-error">
          <div className="admin-error-icon"><AlertCircle size={20} /></div>
          <h3>Failed to load users</h3>
          <p>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Users" subtitle="User activity and engagement">
      <RangeSelector range={range} onChange={setRange} />
      <DataTable
        title="User List"
        columns={columns}
        data={data?.users || data || []}
        loading={loading}
        pageSize={20}
      />
    </AdminLayout>
  );
};

export default AdminUsers;
