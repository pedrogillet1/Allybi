/**
 * DataTable - Reusable Table Component
 * Swiss Brutalist Tech Design
 * Clean horizontal rules, monospace data, hover states
 */

import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-left py-3 px-4 label-uppercase font-medium",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-muted-foreground text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr
                key={item.id ?? index}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  "border-b border-border table-row-hover",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("py-3 px-4 text-sm", col.className)}
                  >
                    {col.render
                      ? col.render(item)
                      : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
