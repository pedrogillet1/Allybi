import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from './Card';

/**
 * Metric card component displaying a key metric with optional change indicator
 * @param {Object} props
 * @param {string} props.label - Metric label
 * @param {string|number} props.value - Metric value
 * @param {number} [props.change] - Percentage change (positive or negative)
 * @param {string} [props.changeLabel] - Additional label for change context
 */
export const MetricCard = ({ label, value, change, changeLabel }) => {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card>
      <p className="text-gray-600 text-sm mb-2">{label}</p>
      <p className="text-gray-900 text-3xl font-bold mb-2">{value}</p>
      {change !== undefined && (
        <div
          className={`flex items-center gap-1 text-sm ${
            isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-600'
          }`}
        >
          {isPositive && <ArrowUp size={16} />}
          {isNegative && <ArrowDown size={16} />}
          <span>{Math.abs(change)}%</span>
        </div>
      )}
      {changeLabel && <p className="text-gray-500 text-xs mt-1">{changeLabel}</p>}
    </Card>
  );
};
