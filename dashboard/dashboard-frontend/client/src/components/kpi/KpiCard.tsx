import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  loading = false,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#e5e5e5] rounded-lg p-5",
        className
      )}
    >
      <p className="text-xs font-medium text-[#737373] uppercase tracking-wide mb-2">
        {title}
      </p>

      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 skeleton rounded" />
          {subtitle !== undefined && <div className="h-4 w-16 skeleton rounded" />}
        </div>
      ) : (
        <>
          <p className="text-2xl font-semibold text-[#181818] tabular-nums">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-[#a3a3a3] mt-1">{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}

export function KpiCardRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export default KpiCard;
