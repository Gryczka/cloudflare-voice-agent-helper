import { cn } from "../lib/cn";

/**
 * Small pill-shaped status label.
 *
 * Tones map to semantic colors: `neutral`, `info`, `success`, `warning`,
 * `danger`, and `brand` (accent).
 */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger" | "brand";
  className?: string;
}) {
  const tones = {
    neutral: "bg-kumo-recessed text-kumo-text-muted",
    info: "bg-kumo-info-tint text-kumo-info",
    success: "bg-kumo-success-tint text-kumo-success",
    warning: "bg-kumo-warning-tint text-kumo-warning",
    danger: "bg-kumo-danger-tint text-kumo-danger",
    brand: "bg-kumo-accent-tint text-kumo-accent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-kumo-pill px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
