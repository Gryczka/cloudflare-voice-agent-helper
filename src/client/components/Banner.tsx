import { cn } from "../lib/cn";

/**
 * Inline notification banner with a colored tint background and matching
 * text. Used for status messages and error display.
 *
 * Tones: `info`, `success`, `warning`, `danger`.
 */
export function Banner({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const tones = {
    info: "bg-kumo-info-tint text-kumo-info",
    success: "bg-kumo-success-tint text-kumo-success",
    warning: "bg-kumo-warning-tint text-kumo-warning",
    danger: "bg-kumo-danger-tint text-kumo-danger",
  };

  return (
    <div
      className={cn(
        "rounded-kumo-md px-4 py-3 text-sm font-medium",
        tones[tone]
      )}
    >
      {children}
    </div>
  );
}
