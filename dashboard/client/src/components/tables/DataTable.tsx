import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available",
  className,
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn("bg-white border border-[#e5e5e5] rounded-lg overflow-hidden", className)}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-[#525252] uppercase tracking-wide"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="border-b border-[#e5e5e5] last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 skeleton rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("bg-white border border-[#e5e5e5] rounded-lg p-12 text-center", className)}>
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-sm text-[#737373]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-white border border-[#e5e5e5] rounded-lg overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-[#525252] uppercase tracking-wide whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-[#e5e5e5] last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-[#fafafa]"
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-sm text-[#181818]"
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
