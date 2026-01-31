import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

/**
 * Simple line chart component for time-series data
 * @param {Object} props
 * @param {Array} props.data - Chart data array
 * @param {string} props.xKey - Key for X-axis data
 * @param {Array<{key: string, color: string, name?: string}>} props.lines - Line configurations
 * @param {number} [props.height=300] - Chart height in pixels
 */
export const SimpleLineChart = ({ data, xKey, lines, height = 300 }) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
        <XAxis dataKey={xKey} tick={{ fill: '#666666', fontSize: 12 }} />
        <YAxis tick={{ fill: '#666666', fontSize: 12 }} />
        <Tooltip />
        {lines.length > 1 && <Legend />}
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            name={line.name || line.key}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
