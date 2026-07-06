import { cn } from "../lib/cn";

/**
 * A small mono-style label prefixed with `//` — a signature Kumo design
 * touch used above panel headers and section titles.
 *
 * @example
 * <Eyebrow>Live Transcript</Eyebrow>
 * // renders: <span class="...">// LIVE TRANSCRIPT</span>
 */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-wider text-kumo-text-subtle",
        className
      )}
    >
      <span className="text-kumo-accent">//</span> {children}
    </span>
  );
}
