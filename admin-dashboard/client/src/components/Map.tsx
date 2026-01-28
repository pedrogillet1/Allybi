/**
 * Map component — placeholder for a geographic visualization
 * of user activity or request origins on the Security / Users pages.
 *
 * TODO: integrate Google Maps or Mapbox when API keys are configured.
 */

interface MapProps {
  className?: string;
  /** Latitude / longitude markers */
  markers?: Array<{ lat: number; lng: number; label?: string }>;
}

export default function Map({ className, markers = [] }: MapProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 ${className ?? ""}`}
      style={{ minHeight: 200 }}
    >
      <div className="text-center space-y-2 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          Map Visualization
        </p>
        <p className="text-xs text-muted-foreground">
          {markers.length > 0
            ? `${markers.length} marker(s) — connect a maps provider to render.`
            : "No location data available."}
        </p>
      </div>
    </div>
  );
}
