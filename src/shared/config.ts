/**
 * Shared configuration constants for the voice coaching pipeline.
 *
 * These values are the single source of truth for both the server (which
 * uses them to configure the STT transcriber, the LLM, and quota
 * enforcement) and the client (which displays them, unmodified, in the
 * Detail panel). Keeping them in one place guarantees the panel never
 * drifts from what is actually running.
 *
 * @module shared/config
 */

/** Speech-to-text configuration, passed directly to `WorkersAINova3STT`. */
export const STT_CONFIG = {
  /** Provider label — Workers AI does not expose an underlying model slug. */
  provider: "Workers AI Nova-3 (streaming STT)",
  language: "en",
  endpointingMs: 300,
  utteranceEndMs: 1000,
  sampleRate: 16000,
  smartFormat: true,
  punctuate: true,
} as const;

/** LLM coaching configuration. */
export const LLM_CONFIG = {
  model: "@cf/meta/llama-3.1-8b-instruct-fast",
  /** How often the rolling-analysis insight timer fires, in seconds. */
  rollingAnalysisIntervalSeconds: 20,
} as const;

/**
 * Abuse-protection quotas for the public demo. These are intentionally
 * generous — the goal is to bound worst-case Workers AI spend from a
 * single caller, not to constrain normal usage.
 */
export const QUOTA_CONFIG = {
  /** Maximum call duration before the server auto-ends the session. */
  maxSessionSeconds: 3600,
  /** Maximum LLM coaching calls (suggestions + insights) per session. */
  maxLlmCallsPerSession: 500,
  /** New WebSocket connections allowed per IP within `periodSeconds`. */
  connectionRateLimit: {
    limit: 5,
    periodSeconds: 60,
  },
} as const;
