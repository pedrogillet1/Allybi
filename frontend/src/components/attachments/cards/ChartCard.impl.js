import React, { useState, useRef, useCallback } from "react";
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

function formatValue(value, valueFormat = {}) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "";
  const style = String(valueFormat?.style || "currency").toLowerCase();
  const currency = String(valueFormat?.currency || "USD");
  if (style === "number") {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(v);
  }
  if (style === "percent") {
    return new Intl.NumberFormat(undefined, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(v);
  }
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

function shortLabel(text, max = 18) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trimEnd()}…`;
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
        axis: typeof s?.axis === "string" ? String(s.axis).toLowerCase() : undefined,
        format: s?.format && typeof s.format === "object" ? s.format : undefined,
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

const ChartSurface = React.memo(function ChartSurface({ chart, height = 240 }) {
  const data = Array.isArray(chart?.data) ? chart.data : [];
  if (!data.length) return null;

  const xKey = String(chart?.xKey || "category");
  const valueFormat = chart?.valueFormat || {};
  const axisFormats = chart?.axisFormats && typeof chart.axisFormats === "object"
    ? chart.axisFormats
    : {};
  const series = normalizeSeries(chart);
  const type = buildChartType(chart);
  const palette = ["#111827", "#2563EB", "#10B981", "#F59E0B", "#DC2626", "#7C3AED", "#0891B2"];
  const rowCount = data.length;
  const xInterval = rowCount > 24 ? Math.ceil(rowCount / 12) - 1 : (rowCount > 14 ? 1 : 0);
  const tickAngle = rowCount > 12 ? -30 : 0;
  const tickAnchor = tickAngle < 0 ? "end" : "middle";
  const tickHeight = tickAngle < 0 ? 58 : 36;
  const hasDualAxis = series.some((s) => s.axis === "right");
  const formatForSeries = (yKey) => {
    const found = series.find((s) => s.yKey === yKey);
    if (found?.format) return found.format;
    if (found?.axis === "right" && axisFormats?.right) return axisFormats.right;
    if (found?.axis === "left" && axisFormats?.left) return axisFormats.left;
    return valueFormat;
  };

  const pieSeriesKey = series[0]?.yKey || "amount";
  const pieData = data.map((d) => ({
    name: String(d?.[xKey] ?? d?.category ?? ""),
    value: safeNum(d?.[pieSeriesKey]),
  }));

  const tooltipFormatter = (value, name, item) => {
    const dataKey = String(item?.dataKey || "");
    return formatValue(value, formatForSeries(dataKey));
  };

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 12, fill: "#6B7280" }}
        interval={xInterval}
        tickFormatter={(v) => shortLabel(v, 20)}
        minTickGap={16}
        angle={tickAngle}
        textAnchor={tickAnchor}
        height={tickHeight}
      />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 12, fill: "#6B7280" }}
        tickFormatter={(v) => formatValue(v, axisFormats?.left || valueFormat)}
        width={82}
      />
      {hasDualAxis ? (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 12, fill: "#6B7280" }}
          tickFormatter={(v) => formatValue(v, axisFormats?.right || valueFormat)}
          width={72}
        />
      ) : null}
      <Tooltip
        isAnimationActive={false}
        formatter={tooltipFormatter}
        labelFormatter={(v) => String(v ?? "")}
        labelStyle={{ color: "#111827", fontWeight: 700 }}
        contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB" }}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ paddingTop: 6 }} /> : null}
    </>
  );

  if (type.includes("pie") || type.includes("donut") || type.includes("doughnut")) {
    return (
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <PieChart>
          <Tooltip isAnimationActive={false} formatter={tooltipFormatter} />
          <Legend />
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            outerRadius={Math.max(72, Math.floor(height * 0.32))}
            isAnimationActive={false}
          >
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
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Line
              key={s.yKey}
              dataKey={s.yKey}
              name={s.label || s.yKey}
                  stroke={s.color || palette[idx % palette.length]}
                  strokeWidth={2.25}
                  dot={false}
                  yAxisId={s.axis === "right" ? "right" : "left"}
                  isAnimationActive={false}
                />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("area")) {
    return (
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Area
              key={s.yKey}
              dataKey={s.yKey}
              name={s.label || s.yKey}
                  stroke={s.color || palette[idx % palette.length]}
                  fill={s.color || palette[idx % palette.length]}
                  fillOpacity={0.22}
                  yAxisId={s.axis === "right" ? "right" : "left"}
                  isAnimationActive={false}
                />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("scatter") || type.includes("bubble")) {
    return (
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            <Scatter
              key={s.yKey}
              data={data}
              dataKey={s.yKey}
              name={s.label || s.yKey}
              fill={s.color || palette[idx % palette.length]}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("radar")) {
    const domain = data.map((d) => ({ ...d, __name: String(d?.[xKey] ?? "") }));
    return (
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <RadarChart data={domain}>
          <PolarGrid />
          <PolarAngleAxis dataKey="__name" />
          <PolarRadiusAxis />
          <Tooltip isAnimationActive={false} formatter={tooltipFormatter} />
          {series.map((s, idx) => (
            <Radar
              key={s.yKey}
              dataKey={s.yKey}
              name={s.label || s.yKey}
              stroke={s.color || palette[idx % palette.length]}
              fill={s.color || palette[idx % palette.length]}
              fillOpacity={0.2}
              isAnimationActive={false}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (type.includes("combo")) {
    const lineKey = series.find((s) => s.role === "line")?.yKey || series[series.length - 1]?.yKey;
    return (
      <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
          {common}
          {series.map((s, idx) => (
            s.yKey === lineKey
              ? <Line
                  key={s.yKey}
                  dataKey={s.yKey}
                  name={s.label || s.yKey}
                  stroke={s.color || palette[idx % palette.length]}
                  strokeWidth={2.4}
                  dot={false}
                  yAxisId={s.axis === "right" ? "right" : "left"}
                  isAnimationActive={false}
                />
              : <Bar
                  key={s.yKey}
                  dataKey={s.yKey}
                  name={s.label || s.yKey}
                  fill={s.color || palette[idx % palette.length]}
                  yAxisId={s.axis === "right" ? "right" : "left"}
                  radius={[5, 5, 0, 0]}
                  isAnimationActive={false}
                />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  const stacked = type.includes("stacked");
  return (
    <ResponsiveContainer width="100%" height={height} debounce={180} minWidth={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 56, left: 8 }}>
        {common}
        {series.map((s, idx) => (
          <Bar
            key={s.yKey}
            dataKey={s.yKey}
            name={s.label || s.yKey}
            fill={s.color || palette[idx % palette.length]}
            yAxisId={s.axis === "right" ? "right" : "left"}
            radius={stacked ? [0, 0, 0, 0] : [5, 5, 0, 0]}
            stackId={stacked ? "a" : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

function svgToPngBlob(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svgEl.clientWidth * scale;
      canvas.height = svgEl.clientHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG load failed")); };
    img.src = url;
  });
}

export default function ChartCard({ chart }) {
  const [expanded, setExpanded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const expandedChartRef = useRef(null);

  const getSvg = useCallback(() => {
    return expandedChartRef.current?.querySelector?.("svg.recharts-surface");
  }, []);

  const handleDownloadPng = useCallback(async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${String(chart?.title || "chart").replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ChartCard] download failed:", err);
    }
  }, [getSvg, chart?.title]);

  const handleCopyToClipboard = useCallback(async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      console.error("[ChartCard] copy failed:", err);
      setCopyFeedback("Failed");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  }, [getSvg]);

  if (!chart || chart.type !== "chart") return null;
  const data = Array.isArray(chart.data) ? chart.data : [];
  if (!data.length) return null;

  const chartTypeLabel = String(chart?.chartType || chart?.type || "chart").toUpperCase();
  const sourceRange = String(chart?.sourceRange || chart?.range || chart?.meta?.range || "").trim();
  const axisFormats = chart?.axisFormats && typeof chart.axisFormats === "object"
    ? chart.axisFormats
    : null;
  const explainLine = axisFormats
    ? `Left axis: ${String(axisFormats?.left?.style || "value")}. Right axis: ${String(axisFormats?.right?.style || "value")}.`
    : "";
  const chartWarning = String(chart?.warning || "").trim();

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
      {chartWarning ? <div className="koda-chart-card__warning">{chartWarning}</div> : null}

      {expanded ? (
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
          <div className="koda-chart-card__toolbar">
            <button type="button" onClick={handleDownloadPng} title="Download as PNG">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v9m0 0L5 7m3 3l3-3M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Download
            </button>
            <button type="button" onClick={handleCopyToClipboard} title="Copy to clipboard">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {copyFeedback || "Copy"}
            </button>
          </div>
          {explainLine ? <div className="koda-chart-card__axisNote">{explainLine}</div> : null}
          {chartWarning ? <div className="koda-chart-card__warning">{chartWarning}</div> : null}
          <div ref={expandedChartRef}>
            <ChartSurface chart={chart} height={520} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
