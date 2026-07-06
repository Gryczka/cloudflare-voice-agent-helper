/**
 * Joins conditional Tailwind class names, dropping any falsy values.
 *
 * @example
 * cn("px-2", isActive && "bg-kumo-accent", null) // "px-2 bg-kumo-accent"
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
