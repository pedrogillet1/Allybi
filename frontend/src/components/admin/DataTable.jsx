/**
 * DataTable Component
 *
 * PURPOSE: Reusable data table with sorting, pagination, and search
 */

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, Download } from 'lucide-react';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import './AdminStyles.css';

const DataTable = ({
  columns,
  data,
  title,
  searchable = true,
  sortable = true,
  pagination = true,
  pageSize = 10,
  loading = false,
  emptyMessage = 'No data available',
  onExport,
  actions
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm || !data) return data || [];

    return data.filter(row =>
      columns.some(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [data, searchTerm, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !filteredData) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!pagination || !sortedData) return sortedData;

    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil((sortedData?.length || 0) / pageSize);

  const handleSort = (key) => {
    if (!sortable) return;

    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderCellValue = (row, column) => {
    const value = row[column.key];

    if (column.render) {
      return column.render(value, row);
    }

    if (value === null || value === undefined) {
      return '-';
    }

    if (column.format === 'date') {
      return new Date(value).toLocaleDateString();
    }

    if (column.format === 'datetime') {
      return new Date(value).toLocaleString();
    }

    if (column.format === 'number') {
      return typeof value === 'number' ? value.toLocaleString() : value;
    }

    if (column.format === 'currency') {
      return `$${typeof value === 'number' ? value.toFixed(2) : value}`;
    }

    if (column.format === 'percent') {
      return `${typeof value === 'number' ? value.toFixed(1) : value}%`;
    }

    if (column.format === 'bytes') {
      return formatBytes(value);
    }

    return value;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <div className="data-table-container">
        {title && <h3 className="data-table-title">{title}</h3>}
        <div className="data-table-loading">
          <div className="data-table-skeleton" />
          <div className="data-table-skeleton" />
          <div className="data-table-skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="data-table-header">
        {title && <h3 className="data-table-title">{title}</h3>}

        <div className="data-table-actions">
          {searchable && (
            <div className="data-table-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}

          {onExport && (
            <button className="data-table-export-btn" onClick={onExport}>
              <Download size={16} />
              Export
            </button>
          )}

          {actions}
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(column => (
                <th
                  key={column.key}
                  className={`${sortable && column.sortable !== false ? 'sortable' : ''} ${column.align ? `align-${column.align}` : ''}`}
                  onClick={() => column.sortable !== false && handleSort(column.key)}
                  style={{ width: column.width }}
                >
                  <div className="th-content">
                    <span>{column.label}</span>
                    {sortable && column.sortable !== false && sortConfig.key === column.key && (
                      sortConfig.direction === 'asc'
                        ? <ChevronUp size={14} />
                        : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData && paginatedData.length > 0 ? (
              paginatedData.map((row, index) => (
                <tr key={row.id || index}>
                  {columns.map(column => (
                    <td
                      key={column.key}
                      className={column.align ? `align-${column.align}` : ''}
                    >
                      {renderCellValue(row, column)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-row">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="data-table-pagination">
          <span className="pagination-info">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedData?.length || 0)} of {sortedData?.length || 0}
          </span>

          <div className="pagination-controls">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              First
            </button>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <img
                src={chevronLeftIcon}
                alt=""
                style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)', transform: 'rotate(180deg)' }}
              />
            </button>

            <span className="pagination-pages">
              Page {currentPage} of {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <img
                src={chevronLeftIcon}
                alt=""
                style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)' }}
              />
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
