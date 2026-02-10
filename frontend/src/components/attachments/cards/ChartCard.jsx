// frontend/src/components/attachments/cards/ChartCard.jsx
import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import "./ChartCard.css";

function formatCurrency(n, currency = "USD") {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    // Fallback: keep it simple
    return `$${Math.round(v).toLocaleString()}`;
  }
}

export default function ChartCard({ chart }) {
  if (!chart || chart.type !== "chart") return null;
  const data = Array.isArray(chart.data) ? chart.data : [];
  if (!data.length) return null;

  const xKey = chart.xKey || "category";
  const currency = chart?.valueFormat?.currency || "USD";

  const palette = ["#111827", "#2563EB", "#DC2626", "#059669", "#7C3AED"];
  const series = Array.isArray(chart.series) && chart.series.length
    ? chart.series
    : Array.isArray(chart.yKeys) && chart.yKeys.length
      ? chart.yKeys.map((k) => ({ yKey: k, label: k }))
      : [{ yKey: chart.yKey || "amount", label: chart.yLabel || (chart.yKey || "amount") }];

  return (
    <div className="koda-chart-card">
      <div className="koda-chart-card__header">
        <div className="koda-chart-card__title">{chart.title || "Chart"}</div>
      </div>

      <div className="koda-chart-card__body">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 60, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 12, fill: "#4B5563" }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#4B5563" }}
              tickFormatter={(v) => formatCurrency(v, currency)}
              width={72}
            />
            <Tooltip
              formatter={(value) => formatCurrency(value, currency)}
              labelStyle={{ color: "#111827" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB" }}
            />
            {series.length > 1 ? <Legend wrapperStyle={{ paddingTop: 6 }} /> : null}
            {series.map((s, idx) => (
              <Bar
                key={s.yKey || idx}
                dataKey={s.yKey}
                name={s.label || s.yKey}
                fill={s.color || palette[idx % palette.length]}
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
