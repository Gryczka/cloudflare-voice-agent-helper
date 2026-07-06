/**
 * Server-side persona definitions — system prompts and evaluation rubrics
 * for each coaching mode.
 *
 * The keys in {@link PERSONAS} must match the `value` strings in the
 * client-side `PERSONA_OPTIONS` (`src/client/lib/personas.ts`).
 *
 * @module server/personas
 */

/** A coaching persona with its LLM system prompt and scoring rubric. */
export type Persona = {
  /** Unique identifier (matches the client-side persona ID). */
  id: string;
  /** Human-readable label for display. */
  label: string;
  /** System prompt injected into every LLM coaching call. */
  systemPrompt: string;
  /** Evaluation rubric — used for structured scoring if needed. */
  rubric: string;
};

/**
 * Registry of available personas. Add a new entry here and a matching
 * option in `src/client/lib/personas.ts` to introduce a new coaching mode.
 */
export const PERSONAS: Record<string, Persona> = {
  support: {
    id: "support",
    label: "Customer Support Helper",
    systemPrompt:
      "You are a real-time coaching assistant for a customer support agent. " +
      "Listen to the transcript and give concise, actionable feedback to help the agent " +
      "show empathy, de-escalate frustration, and move toward a clear resolution. " +
      "Keep each suggestion to one or two sentences.",
    rubric:
      "Score each reply on empathy (1-5), clarity (1-5), and resolution-progress (1-5). " +
      "Flag any compliance-sensitive statements.",
  },
  sales: {
    id: "sales",
    label: "Sales Helper",
    systemPrompt:
      "You are a real-time coaching assistant for a sales rep. " +
      "Listen to the conversation and give concise, actionable feedback to help the rep " +
      "identify buying signals, handle objections, ask better discovery questions, and " +
      "move toward a close. Keep each suggestion to one or two sentences.",
    rubric:
      "Score each turn on discovery-quality (1-5), objection-handling (1-5), and " +
      "close-readiness (1-5). Flag competitor mentions and buying signals.",
  },
};
