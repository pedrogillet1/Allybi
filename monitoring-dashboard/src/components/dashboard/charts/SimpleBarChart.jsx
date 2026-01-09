import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * Simple bar chart component for categorical data
 * @param {Object} props
 * @param {Array} props.data - Chart data array
 * @param {string} props.xKey - Key for X-axis data
 * @param {string} props.yKey - Key for Y-axis data
 * @param {'horizontal' | 'vertical'} [props.layout='horizontal'] - Chart orientation
 * @param {number} [props.height=300] - Chart height in pixels
 */
export const SimpleBarChart = ({ data, xKey, yKey, layout = 'horizontal', height = 300 }) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
        <XAxis
          dataKey={layout === 'horizontal' ? xKey : yKey}
          type={layout === 'horizontal' ? 'category' : 'number'}
          tick={{ fill: '#666666', fontSize: 12 }}
        />
        <YAxis
          dataKey={layout === 'horizontal' ? yKey : xKey}
          type={layout === 'horizontal' ? 'number' : 'category'}
          tick={{ fill: '#666666', fontSize: 12 }}
        />
        <Tooltip />
        <Bar dataKey={yKey} fill="#181818" />
      </BarChart>
    </ResponsiveContainer>
  );
};
