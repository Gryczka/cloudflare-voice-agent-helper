/**
 * Shared message contract between the {@link HelperAgent} Durable Object (server)
 * and the {@link useVoiceHelper} React hook (client).
 *
 * These are the *custom* JSON messages sent over the WebSocket connection.
 * Transcript messages are handled internally by the `@cloudflare/voice`
 * `VoiceClient` library via its own event system and are not part of this
 * contract.
 *
 * @module shared/messages
 */

// ---------------------------------------------------------------------------
// Message-type string constants
// ---------------------------------------------------------------------------

/** Discriminator values for {@link ServerMessage}. */
export const MessageType = {
  /** Lifecycle / connection status update. */
  STATUS: "status",
  /** A coaching insight or suggestion produced by the LLM. */
  FEEDBACK: "feedback",
  /** Live latency measurements for the STT and LLM pipeline stages. */
  METRICS: "metrics",
  /** A one-time notice, e.g. a quota limit being reached. */
  NOTICE: "notice",
} as const;

/** Valid `status` field values for {@link StatusMessage}. */
export const StatusValue = {
  /** WebSocket connected; waiting for the call to start. */
  CONNECTED: "connected",
  /** Call started; the agent is actively listening to microphone audio. */
  LISTENING: "listening",
} as const;

/** Coaching feedback categories. */
export const FeedbackKind = {
  /** A reactive suggestion tied to a specific utterance. */
  SUGGESTION: "suggestion",
  /** A proactive insight derived from rolling conversation analysis. */
  INSIGHT: "insight",
} as const;

/** Union type of all valid feedback kinds: `"suggestion" | "insight"`. */
export type FeedbackKindValue =
  (typeof FeedbackKind)[keyof typeof FeedbackKind];

/** Reasons a {@link NoticeMessage} can be sent. */
export const NoticeCode = {
  /** The call hit `QUOTA_CONFIG.maxSessionSeconds` and was ended. */
  SESSION_LIMIT: "session_limit",
  /** The call hit `QUOTA_CONFIG.maxLlmCallsPerSession`; coaching paused. */
  LLM_LIMIT: "llm_limit",
} as const;

/** Union type of all valid notice codes. */
export type NoticeCodeValue = (typeof NoticeCode)[keyof typeof NoticeCode];

// ---------------------------------------------------------------------------
// Message shapes
// ---------------------------------------------------------------------------

/**
 * Sent by the server when the connection lifecycle changes — either the
 * WebSocket just connected or the voice call just started.
 */
export type StatusMessage = {
  type: typeof MessageType.STATUS;
  status: (typeof StatusValue)[keyof typeof StatusValue];
  /** The active persona ID (e.g. `"support"` or `"sales"`). */
  persona: string;
};

/**
 * Sent by the server when the LLM produces a coaching response. The client
 * appends this to the feedback panel.
 */
export type FeedbackMessage = {
  type: typeof MessageType.FEEDBACK;
  /** The coaching text (1-2 sentences). */
  text: string;
  /** Whether this is a per-utterance suggestion or a rolling insight. */
  kind: FeedbackKindValue;
  /** The active persona ID when the feedback was generated. */
  persona: string;
};

/** Rolling latency stats for a single pipeline stage. */
export type LatencyStats = {
  /** Duration of the most recent sample, in milliseconds. */
  lastMs: number;
  /** Running average duration across all samples in the session, in ms. */
  avgMs: number;
  /** Total number of samples recorded this session. */
  count: number;
};

/**
 * Sent by the server whenever a new STT or LLM latency sample is recorded.
 * Powers the "Live Latency" section of the Detail panel.
 *
 * Note on `stt`: Workers AI's streaming transcriber does not expose an
 * internal model-only timing, so this measures *finalization lag* — the
 * time between the last interim transcript update and the finalized
 * utterance. It is a good proxy for perceived responsiveness, not a pure
 * model benchmark.
 */
export type MetricsMessage = {
  type: typeof MessageType.METRICS;
  stt: LatencyStats | null;
  llm: LatencyStats | null;
};

/**
 * Sent once when a quota limit is reached. `session_limit` closes the
 * call; `llm_limit` means coaching responses stop but transcription
 * continues until the session limit or the caller ends the call.
 */
export type NoticeMessage = {
  type: typeof MessageType.NOTICE;
  code: NoticeCodeValue;
  message: string;
};

/**
 * Union of all custom messages the server can send to the client.
 * Use {@link parseServerMessage} to safely narrow an unknown payload.
 */
export type ServerMessage =
  StatusMessage | FeedbackMessage | MetricsMessage | NoticeMessage;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Returns `true` when `msg` is a {@link StatusMessage}. */
export function isStatusMessage(msg: unknown): msg is StatusMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === MessageType.STATUS &&
    typeof (msg as Record<string, unknown>).status === "string" &&
    typeof (msg as Record<string, unknown>).persona === "string"
  );
}

/** Returns `true` when `msg` is a {@link FeedbackMessage}. */
export function isFeedbackMessage(msg: unknown): msg is FeedbackMessage {
  const m = msg as Record<string, unknown> | null;
  return (
    typeof msg === "object" &&
    m !== null &&
    m.type === MessageType.FEEDBACK &&
    typeof m.text === "string" &&
    typeof m.kind === "string" &&
    typeof m.persona === "string"
  );
}

/** Returns `true` when `msg` is a {@link MetricsMessage}. */
export function isMetricsMessage(msg: unknown): msg is MetricsMessage {
  const m = msg as Record<string, unknown> | null;
  return (
    typeof msg === "object" && m !== null && m.type === MessageType.METRICS
  );
}

/** Returns `true` when `msg` is a {@link NoticeMessage}. */
export function isNoticeMessage(msg: unknown): msg is NoticeMessage {
  const m = msg as Record<string, unknown> | null;
  return (
    typeof msg === "object" &&
    m !== null &&
    m.type === MessageType.NOTICE &&
    typeof m.code === "string" &&
    typeof m.message === "string"
  );
}
