import { cn } from "../lib/cn";

/**
 * Elevated surface container with a hairline border and soft shadow.
 *
 * Set `corners` to render the signature 14px corner-bracket decorations
 * — a subtle Kumo design accent for prominent panels.
 */
export function Card({
  children,
  className,
  corners = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Render 14px L-shaped corner brackets at each corner. */
  corners?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-kumo-card border border-kumo-line bg-kumo-elevated shadow-[var(--kumo-shadow-card)]",
        className
      )}
    >
      {corners && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-kumo-text-subtle/25" />
          <span className="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-kumo-text-subtle/25" />
          <span className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-kumo-text-subtle/25" />
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-kumo-text-subtle/25" />
        </div>
      )}
      {children}
    </div>
  );
}
