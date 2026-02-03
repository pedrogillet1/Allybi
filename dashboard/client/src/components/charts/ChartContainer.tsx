import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  title: string;
  subtitle?: React.ReactNode;
  children: ReactNode;
  className?: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  error?: string | null;
  onRetry?: () => void;
}

export function ChartContainer({
  title,
  subtitle,
  children,
  className,
  height = 300,
  loading = false,
  empty = false,
  emptyMessage = "No data available",
  error = null,
  onRetry,
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#e5e5e5] rounded-lg p-6",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#181818]">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[#737373] mt-1">{subtitle}</p>
        )}
      </div>

      <div style={{ height }} className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <ChartSkeleton height={height - 40} />
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-sm text-[#525252] mb-2">Failed to load chart</p>
            <p className="text-xs text-[#737373] mb-4">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 text-sm font-medium text-white bg-[#181818] rounded-md hover:bg-[#262626] transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {empty && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#f5f5f5] flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-[#a3a3a3]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <p className="text-sm text-[#737373]">{emptyMessage}</p>
            </div>
          </div>
        )}

        {!loading && !error && !empty && children}
      </div>
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-end justify-between h-full gap-2 px-4">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="flex-1 skeleton rounded-t"
            style={{
              height: `${Math.random() * 60 + 20}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default ChartContainer;
