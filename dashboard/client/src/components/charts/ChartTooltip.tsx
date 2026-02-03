import { TooltipProps } from "recharts";
import { chartConfig } from "./chartTheme";

interface CustomTooltipProps extends TooltipProps<number, string> {
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label as string) : label;

  return (
    <div
      style={chartConfig.tooltip.contentStyle}
      className="min-w-[140px]"
    >
      <p style={chartConfig.tooltip.labelStyle}>{formattedLabel}</p>
      {payload.map((entry, index) => {
        const value = formatter
          ? formatter(entry.value as number, entry.name as string)
          : entry.value;

        return (
          <div
            key={index}
            className="flex items-center justify-between gap-4"
            style={chartConfig.tooltip.itemStyle}
          >
            <span className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[#525252]">{entry.name}</span>
            </span>
            <span className="font-medium text-[#181818]">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ChartTooltip;
