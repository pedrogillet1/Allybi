import { cn } from "@/lib/utils";
import type { TimeRange } from "@/types/telemetry";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  children?: React.ReactNode;
}

const rangeOptions: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export function PageHeader({
  title,
  subtitle,
  range,
  onRangeChange,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-[#181818]">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[#737373] mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {children}

        {/* Time Range Selector */}
        <div className="flex items-center bg-[#f5f5f5] rounded-md p-1">
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onRangeChange(option.value)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                range === option.value
                  ? "bg-[#181818] text-white"
                  : "text-[#525252] hover:text-[#181818]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PageHeader;
