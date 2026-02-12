import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ComposedChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import Modal from "../../ui/Modal";
import "./ChartCard.css";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value, currency = "USD") {
  const v = Number(value);
  if (!Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${Math.round(v).toLocaleString()}`;
  }
}

function normalizeSeries(chart) {
  const list = Array.isArray(chart?.series) ? chart.series : [];
  if (list.length) {
    return list
      .map((s) => ({
        yKey: String(s?.yKey || s?.key || "").trim(),
        label: String(s?.label || s?.name || s?.yKey || "").trim(),
        color: typeof s?.color === "string" ? s.color : undefined,
        role: typeof s?.role === "string" ? String(s.role).toLowerCase() : undefined,
      }))
      .filter((s) => s.yKey);
  }
  const keys = Array.isArray(chart?.yKeys) ? chart.yKeys : [];
  if (keys.length) return keys.map((k) => ({ yKey: String(k), label: String(k) }));
  if (chart?.yKey) return [{ yKey: String(chart.yKey), label: String(chart.yLabel || chart.yKey) }];
  return [{ yKey: "amount", label: "Amount" }];
}

function buildChartType(chart) {
  return String(chart?.chartType || chart?.type || "bar").trim().toLowerCase();
}

function ChartSurface({ chart, height = 240 }) {
  const data = Array.isArray(chart?.data) ? chart.data : [];
  if (!data.length) return null;

  const xKey = String(chart?.xKey || "category");
  const currency = String(chart?.valueFormat?.currency || "USD");
  const series = normalizeSeries(chart);
  const type = buildChartType(chart);
  const palette = ["#111827", "#2563EB", "#10B981", "#F59E0B", "#DC2626", "#7C3AED", "#0891B2"];

  const pieSeriesKey = series[0]?.yKey || "amount";
  const pieData = data.map((d) => ({
    name: String(d?.[xKey] ?? d?.category ?? ""),
    value: safeNum(d?.[pieSeriesKey]),
  }));

  const tooltipFormatter = (value) => formatMoney(value, currency);

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 12, fill: "#6B7280" }}
        interval={0}
        angle={-30}
        textAnchor="end"
        height={58}
      />
      <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={(v) => formatMoney(v, currency)} width={78} />
      <Tooltip
        formatter={tooltipFormatter}
        labelStyle={{ color: "#111827", fontWeight: 700 }}
        contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB" }}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ paddingTop: 6 }} /> : null}
    </>
  );

  if (type.includes("pie") || type.includes("donut") || type.includes("doughnut")) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={Math.max(72, Math.floor(height * 0.32))}>
            {pieData.map((_, idx) => (
              <Cell key={idx} fill={palette[idx % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("line")) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Line key={s.yKey} dataKey={s.yKey} name={s.label || s.yKey} stroke={s.color || palette[idx % palette.length]} strokeWidth={2.25} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("area")) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Area key={s.yKey} dataKey={s.yKey} name={s.label || s.yKey} stroke={s.color || palette[idx % palette.length]} fill={s.color || palette[idx % palette.length]} fillOpacity={0.22} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("scatter")) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Scatter key={s.yKey} data={data} dataKey={s.yKey} name={s.label || s.yKey} fill={s.color || palette[idx % palette.length]} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("radar")) {
    const domain = data.map((d) => ({ ...d, __name: String(d?.[xKey] ?? "") }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={domain}>
          <PolarGrid />
          <PolarAngleAxis dataKey="__name" />
          <PolarRadiusAxis />
          <Tooltip formatter={tooltipFormatter} />
          {series.map((s, idx) => (
            <Radar key={s.yKey} dataKey={s.yKey} name={s.label || s.yKey} stroke={s.color || palette[idx % palette.length]} fill={s.color || palette[idx % palette.length]} fillOpacity={0.2} />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("combo")) {
    const lineKey = series.find((s) => s.role === "line")?.yKey || series[series.length - 1]?.yKey;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            s.yKey === lineKey
              ? <Line key={s.yKey} dataKey={s.yKey} name={s.label || s.yKey} stroke={s.color || palette[idx % palette.length]} strokeWidth={2.4} dot={false} />
              : <Bar key={s.yKey} dataKey={s.yKey} name={s.label || s.yKey} fill={s.color || palette[idx % palette.length]} radius={[5, 5, 0, 0]} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  const stacked = type.includes("stacked");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
        {common}
        {series.map((s, idx) => (
          <Bar
            key={s.yKey}
            dataKey={s.yKey}
            name={s.label || s.yKey}
            fill={s.color || palette[idx % palette.length]}
            radius={stacked ? [0, 0, 0, 0] : [5, 5, 0, 0]}
            stackId={stacked ? "a" : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ChartCard({ chart }) {
  const [expanded, setExpanded] = useState(false);
  if (!chart || chart.type !== "chart") return null;
  const data = Array.isArray(chart.data) ? chart.data : [];
  if (!data.length) return null;

  const chartTypeLabel = String(chart?.chartType || chart?.type || "chart").toUpperCase();
  const sourceRange = String(chart?.sourceRange || chart?.range || chart?.meta?.range || "").trim();

  return (
    <div className="koda-chart-card">
      <div className="koda-chart-card__header">
        <div className="koda-chart-card__heading">
          <div className="koda-chart-card__title">{chart.title || "Chart preview"}</div>
          <div className="koda-chart-card__meta">
            <span>{chartTypeLabel}</span>
            {sourceRange ? <span>• {sourceRange}</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="koda-chart-card__expandBtn"
          onClick={() => setExpanded(true)}
          title="Expand chart"
        >
          Expand
        </button>
      </div>

      <div className="koda-chart-card__body" onClick={() => setExpanded(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setExpanded(true); }}>
        <ChartSurface chart={chart} height={240} />
      </div>

      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        title={chart.title || "Chart preview"}
        maxWidth={980}
      >
        <div className="koda-chart-card__expandedMeta">
          <span className="koda-chart-card__typePill">{chartTypeLabel}</span>
          {sourceRange ? <span className="koda-chart-card__range">{sourceRange}</span> : null}
        </div>
        <ChartSurface chart={chart} height={520} />
      </Modal>
    </div>
  );
}
