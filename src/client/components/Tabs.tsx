import { cn } from "../lib/cn";

/**
 * Segmented control for switching between a small set of options.
 * The active option gets an elevated pill with an accent-tinted background.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-kumo-pill bg-kumo-recessed p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-kumo-pill px-4 py-1.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent",
            value === option.value
              ? "bg-kumo-elevated text-kumo-text shadow-[var(--kumo-shadow-sm)]"
              : "text-kumo-text-muted hover:text-kumo-text"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
