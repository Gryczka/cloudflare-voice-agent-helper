/**
 * Client-side persona definitions for the UI persona selector.
 *
 * The `value` strings here must match the keys in the server-side
 * `PERSONAS` map in `src/server/personas.ts`.
 *
 * @module client/lib/personas
 */

/** Persona option rendered in the {@link Tabs} selector. */
export const PERSONA_OPTIONS = [
  { value: "support", label: "Customer Support Helper" },
  { value: "sales", label: "Sales Helper" },
] as const;

/** Union of valid persona IDs. */
export type PersonaId = (typeof PERSONA_OPTIONS)[number]["value"];
