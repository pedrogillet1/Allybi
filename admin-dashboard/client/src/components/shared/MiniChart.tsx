/**
 * MiniChart - Sparkline/Mini Chart Component
 * Swiss Brutalist Tech Design
 * Small inline charts for trend visualization
 */

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

interface MiniChartProps {
  data: { value: number; label?: string }[];
  type?: "line" | "area" | "bar";
  color?: string;
  height?: number;
  showTooltip?: boolean;
  className?: string;
}

export function MiniChart({
  data,
  type = "area",
  color = "oklch(0.15 0 0)",
  height = 60,
  showTooltip = false,
  className,
}: MiniChartProps) {
  const chartData = data.map((d, i) => ({
    ...d,
    index: i,
  }));

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 2, right: 2, bottom: 2, left: 2 },
    };

    switch (type) {
      case "line":
        return (
          <LineChart {...commonProps}>
            {showTooltip && (
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e5e5e5",
                  fontSize: "12px",
                }}
                labelStyle={{ display: "none" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        );
      case "bar":
        return (
          <BarChart {...commonProps}>
            {showTooltip && (
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e5e5e5",
                  fontSize: "12px",
                }}
                labelStyle={{ display: "none" }}
              />
            )}
            <Bar dataKey="value" fill={color} />
          </BarChart>
        );
      case "area":
      default:
        return (
          <AreaChart {...commonProps}>
            {showTooltip && (
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e5e5e5",
                  fontSize: "12px",
                }}
                labelStyle={{ display: "none" }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={color}
              fillOpacity={0.1}
            />
          </AreaChart>
        );
    }
  };

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
