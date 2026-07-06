import { cn } from "../lib/cn";

/**
 * Pill-shaped button with Kumo styling.
 *
 * Variants:
 * - `primary` — accent background, white text (default call-to-action).
 * - `secondary` — elevated surface with a hairline border.
 * - `ghost` — transparent background, no border; shows a subtle hover wash.
 * - `danger` — red background for destructive actions (e.g. "Stop Call").
 *
 * Sizes:
 * - `sm` — compact, `6px 12px` padding.
 * - `md` — default, `10px 20px` padding.
 * - `lg` — prominent, `12px 24px` padding.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary:
      "bg-kumo-accent text-kumo-accent-contrast hover:bg-kumo-accent-hover border-transparent",
    secondary:
      "bg-kumo-elevated text-kumo-text border-kumo-line hover:border-kumo-line-hover",
    ghost:
      "bg-transparent text-kumo-text border-transparent hover:bg-kumo-recessed",
    danger: "bg-kumo-danger text-white hover:brightness-110 border-transparent",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-kumo-pill border font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kumo-canvas disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
