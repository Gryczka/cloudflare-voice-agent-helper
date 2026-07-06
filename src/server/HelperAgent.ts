/**
 * HelperAgent — a Cloudflare Agents SDK Durable Object that powers the
 * real-time voice coaching pipeline.
 *
 * ## Pipeline overview
 *
 * ```
 *  Browser mic ──► WebSocket ──► HelperAgent (this DO)
 *                                  │
 *                                  ├─► Workers AI Nova-3 STT
 *                                  │     (streaming transcription)
 *                                  │
 *                                  ├─► onTranscript()
 *                                  │     └─► LLM (#coach)  ──► "suggestion" feedback
 *                                  │
 *                                  └─► rollingAnalysis() (every 20s)
 *                                        └─► LLM            ──► "insight" feedback
 * ```
 *
 * 1. The browser captures microphone audio and streams it over a WebSocket
 *    to this Durable Object.
 * 2. The `@cloudflare/voice` `withVoiceInput` mixin feeds the audio into
 *    a {@link WorkersAINova3STT} transcriber running on Workers AI.
 * 3. Each finalized transcript segment triggers {@link onTranscript},
 *    which calls the LLM for a per-utterance coaching suggestion.
 * 4. A 20-second {@link scheduleEvery} timer runs {@link rollingAnalysis},
 *    which asks the LLM for a proactive insight based on the last few
 *    exchanges.
 *
 * All coaching responses are sent to the client as JSON messages conforming
 * to the {@link ServerMessage} contract in `src/shared/messages.ts`.
 *
 * ## Cost guards
 *
 * Three quotas bound worst-case Workers AI spend from a single caller (see
 * `src/shared/config.ts` for the exact numbers):
 *
 * 1. **Connection rate limit** — enforced in `src/server/index.ts` before
 *    the WebSocket upgrade even reaches this Durable Object.
 * 2. **Max session duration** — a one-shot {@link schedule} set in
 *    {@link onCallStart} auto-ends the call via {@link endSession}.
 * 3. **Max LLM calls per session** — `#runLLM` counts calls and stops
 *    invoking the model once the cap is reached, notifying the client.
 *
 * ## Latency instrumentation
 *
 * LLM latency is measured directly around the `env.AI.run()` call in
 * `#runLLM`. STT latency is approximated as *finalization lag* — see
 * {@link createTranscriber} — since Workers AI's streaming transcriber does
 * not expose an internal model-only timing. Both are surfaced to the
 * client as {@link MetricsMessage}s for the Detail panel.
 *
 * ## Hibernation
 *
 * This agent uses WebSocket Hibernation — when the connection is idle the
 * Durable Object can be evicted from memory while keeping the WebSocket
 * alive. The Agents SDK handles rehydration automatically. Per-call state
 * (`#feedbackHistory`, `#isActive`, quota counters) is reset on each new
 * connection via {@link onConnect}.
 *
 * @module server/HelperAgent
 */
import { Agent, type Connection } from "agents";
import {
  WorkersAINova3STT,
  withVoiceInput,
  type Transcriber,
} from "@cloudflare/voice";
import { LLM_CONFIG, QUOTA_CONFIG, STT_CONFIG } from "../shared/config";
import {
  FeedbackKind,
  MessageType,
  NoticeCode,
  StatusValue,
  type FeedbackKindValue,
  type FeedbackMessage,
  type LatencyStats,
  type MetricsMessage,
  type NoticeCodeValue,
  type NoticeMessage,
  type StatusMessage,
} from "../shared/messages";
import { PERSONAS } from "./personas";

/** Base Agent class augmented with voice-input (STT) capabilities. */
const InputAgent = withVoiceInput(Agent);

/** Accumulator for rolling latency stats, kept internally as totals. */
type LatencyAccumulator = { totalMs: number; count: number; lastMs: number };

/** A fresh, empty latency accumulator. */
function newLatencyAccumulator(): LatencyAccumulator {
  return { totalMs: 0, count: 0, lastMs: 0 };
}

/** Converts an internal accumulator into the wire-format {@link LatencyStats}. */
function toLatencyStats(acc: LatencyAccumulator): LatencyStats | null {
  if (acc.count === 0) return null;
  return {
    lastMs: acc.lastMs,
    avgMs: Math.round(acc.totalMs / acc.count),
    count: acc.count,
  };
}

export class HelperAgent extends InputAgent<Env> {
  /** Streaming speech-to-text transcriber backed by Workers AI Nova-3. */
  transcriber = new WorkersAINova3STT(this.env.AI, {
    language: STT_CONFIG.language,
    endpointingMs: STT_CONFIG.endpointingMs,
    utteranceEndMs: STT_CONFIG.utteranceEndMs,
    smartFormat: STT_CONFIG.smartFormat,
    punctuate: STT_CONFIG.punctuate,
    sampleRate: STT_CONFIG.sampleRate,
  });

  /** Active persona ID — determines the system prompt and coaching style. */
  #personaId = "support";

  /** Rolling conversation history used as LLM context for coaching. */
  #feedbackHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  /** Whether a call is currently active (controls rolling-analysis gating). */
  #isActive = false;

  /** Number of LLM coaching calls made so far this session. */
  #llmCalls = 0;

  /** Whether the {@link NoticeCode.LLM_LIMIT} notice has already been sent. */
  #llmLimitNotified = false;

  /** ID of the pending {@link endSession} schedule for the active call. */
  #sessionScheduleId: string | null = null;

  /** Rolling LLM call-duration stats for the current session. */
  #llmLatency = newLatencyAccumulator();

  /** Rolling STT finalization-lag stats for the current session. */
  #sttLatency = newLatencyAccumulator();

  /** Resolved persona object for the current call. */
  get persona() {
    return PERSONAS[this.#personaId] ?? PERSONAS.support;
  }

  /**
   * Called when a new WebSocket connection is established.
   * Reads the persona from the `?persona=` query param and resets per-call
   * state, including quota counters and latency stats.
   */
  async onConnect(connection: Connection, ctx: { request: Request }) {
    const url = new URL(ctx.request.url);
    const personaParam = url.searchParams.get("persona");
    if (personaParam && PERSONAS[personaParam]) {
      this.#personaId = personaParam;
    }

    this.#feedbackHistory = [];
    this.#isActive = true;
    this.#llmCalls = 0;
    this.#llmLimitNotified = false;
    this.#sessionScheduleId = null;
    this.#llmLatency = newLatencyAccumulator();
    this.#sttLatency = newLatencyAccumulator();

    this.#send(connection, {
      type: MessageType.STATUS,
      status: StatusValue.CONNECTED,
      persona: this.persona.id,
    } satisfies StatusMessage);
  }

  /**
   * Wraps {@link transcriber} to measure STT *finalization lag* — the time
   * between the last interim transcript update and the finalized
   * utterance — without modifying the underlying Nova-3 provider.
   *
   * This is a proxy for perceived responsiveness (how long you wait after
   * you stop talking), not a pure model-only benchmark: Workers AI's
   * streaming transcriber does not expose the raw audio-in timestamp.
   */
  createTranscriber(connection: Connection): Transcriber {
    const inner = this.transcriber;
    return {
      createSession: (options) => {
        let lastInterimAt: number | null = null;
        return inner.createSession({
          ...options,
          onInterim: (text) => {
            lastInterimAt = Date.now();
            options?.onInterim?.(text);
          },
          onUtterance: (transcript) => {
            if (lastInterimAt !== null) {
              this.#recordLatency("stt", Date.now() - lastInterimAt);
              lastInterimAt = null;
            }
            options?.onUtterance?.(transcript);
            this.#sendMetrics(connection);
          },
        });
      },
    };
  }

  /**
   * Called when the voice call starts (mic audio begins streaming).
   * Notifies the client, kicks off the rolling-analysis timer, and starts
   * the max-session-duration quota timer.
   */
  async onCallStart(connection: Connection) {
    this.#isActive = true;
    this.#send(connection, {
      type: MessageType.STATUS,
      status: StatusValue.LISTENING,
      persona: this.persona.id,
    } satisfies StatusMessage);

    await this.scheduleEvery(
      LLM_CONFIG.rollingAnalysisIntervalSeconds,
      "rollingAnalysis",
      connection.id
    );

    const sessionSchedule = await this.schedule(
      QUOTA_CONFIG.maxSessionSeconds,
      "endSession",
      connection.id
    );
    this.#sessionScheduleId = sessionSchedule.id;
  }

  /**
   * Called when the voice call ends. Stops coaching and cancels the
   * pending max-session-duration quota timer, if any.
   */
  async onCallEnd(_connection: Connection) {
    this.#isActive = false;
    if (this.#sessionScheduleId) {
      await this.cancelSchedule(this.#sessionScheduleId);
      this.#sessionScheduleId = null;
    }
  }

  /**
   * Quota enforcement: auto-ends a call that has run for
   * `QUOTA_CONFIG.maxSessionSeconds`. Scheduled once in {@link onCallStart}.
   */
  async endSession(connectionId: string) {
    if (!this.#isActive) return;

    const connection = [...this.getConnections()].find(
      (conn) => conn.id === connectionId
    );
    if (!connection) return;

    this.#sendNotice(
      connection,
      NoticeCode.SESSION_LIMIT,
      "This demo session reached its maximum length and has ended."
    );
    this.#isActive = false;
    this.#sessionScheduleId = null;
    connection.close();
  }

  /**
   * Called for each finalized transcript segment.
   * The VoiceInput mixin already emits the transcript to the client; this
   * method generates a per-utterance coaching suggestion via the LLM.
   */
  async onTranscript(text: string, connection: Connection) {
    if (!text.trim()) return;
    await this.#coach(text, connection);
  }

  /**
   * Hook to post-process a transcript before it is sent to the client.
   * Currently a pass-through; could be used to redact PII or filter profanity.
   */
  async afterTranscribe(
    transcript: string,
    _connection: Connection
  ): Promise<string | null> {
    return transcript;
  }

  /**
   * Periodic rolling-window analysis (see `LLM_CONFIG.rollingAnalysisIntervalSeconds`).
   * Sends the last few exchanges to the LLM and emits a proactive insight.
   * Skipped when the call is inactive or there isn't enough context yet.
   */
  async rollingAnalysis(connectionId: string) {
    if (!this.#isActive) return;

    const connection = [...this.getConnections()].find(
      (conn) => conn.id === connectionId
    );
    if (!connection) return;

    const recent = this.#feedbackHistory.slice(-6);
    if (recent.length < 2) return;

    const context = recent.map((m) => m.content).join("\n");
    const prompt =
      `${this.persona.systemPrompt}\n\n` +
      `Based on the recent conversation below, provide one concise coaching insight.\n\n` +
      `Conversation:\n${context}\n\n` +
      `Format your response as a single sentence starting with an action verb.`;

    const feedback = await this.#runLLM(prompt, connection);
    if (feedback) {
      this.#sendFeedback(connection, feedback, FeedbackKind.INSIGHT);
    }
  }

  /**
   * Generate a per-utterance coaching suggestion.
   * @param text — the agent's finalized transcript segment.
   */
  async #coach(text: string, connection: Connection) {
    const prompt =
      `${this.persona.systemPrompt}\n\n` +
      `The agent just said: "${text}"\n\n` +
      `Give one concise, actionable coaching suggestion for the agent. ` +
      `If the statement is already strong, briefly say why. ` +
      `Keep it to one or two sentences.`;

    const feedback = await this.#runLLM(prompt, connection);
    if (!feedback) return;

    this.#sendFeedback(connection, feedback, FeedbackKind.SUGGESTION);
  }

  /**
   * Run the coaching LLM (Llama 3.1 8B Instruct Fast) with a system
   * constraint to keep responses to 1-2 sentences.
   *
   * Enforces `QUOTA_CONFIG.maxLlmCallsPerSession` — once the cap is hit,
   * further calls are skipped (a one-time notice is sent instead) so
   * transcription can keep running without incurring more LLM cost.
   * Returns `null` on failure, on skip, or empty output.
   */
  async #runLLM(
    prompt: string,
    connection: Connection
  ): Promise<string | null> {
    if (this.#llmCalls >= QUOTA_CONFIG.maxLlmCallsPerSession) {
      if (!this.#llmLimitNotified) {
        this.#llmLimitNotified = true;
        this.#sendNotice(
          connection,
          NoticeCode.LLM_LIMIT,
          "This session reached its coaching-response limit. " +
            "Transcription continues, but new suggestions and insights are paused."
        );
      }
      return null;
    }

    this.#llmCalls++;
    const startedAt = Date.now();
    try {
      const response = (await this.env.AI.run(LLM_CONFIG.model, {
        messages: [
          {
            role: "system",
            content:
              "You are a concise real-time coach. Respond in one or two sentences only.",
          },
          { role: "user", content: prompt },
        ],
      })) as { response?: string };

      this.#recordLatency("llm", Date.now() - startedAt);
      this.#sendMetrics(connection);

      const text = response?.response?.trim();
      if (!text) return null;

      this.#feedbackHistory.push({ role: "assistant", content: text });
      return text;
    } catch (err) {
      console.error("LLM coaching error:", err);
      return null;
    }
  }

  /** Record a new latency sample for the given pipeline stage. */
  #recordLatency(stage: "stt" | "llm", ms: number) {
    const acc = stage === "stt" ? this.#sttLatency : this.#llmLatency;
    acc.lastMs = ms;
    acc.totalMs += ms;
    acc.count++;
  }

  /** Send the current rolling latency stats to the client. */
  #sendMetrics(connection: Connection) {
    this.#send(connection, {
      type: MessageType.METRICS,
      stt: toLatencyStats(this.#sttLatency),
      llm: toLatencyStats(this.#llmLatency),
    } satisfies MetricsMessage);
  }

  /** Send a {@link NoticeMessage} to the client. */
  #sendNotice(connection: Connection, code: NoticeCodeValue, message: string) {
    this.#send(connection, {
      type: MessageType.NOTICE,
      code,
      message,
    } satisfies NoticeMessage);
  }

  /** Send a {@link FeedbackMessage} to the client. */
  #sendFeedback(connection: Connection, text: string, kind: FeedbackKindValue) {
    this.#send(connection, {
      type: MessageType.FEEDBACK,
      text,
      kind,
      persona: this.persona.id,
    } satisfies FeedbackMessage);
  }

  /**
   * Safely JSON-stringify and send a {@link ServerMessage} over the
   * WebSocket. Silently ignores errors from already-closed connections.
   */
  #send(connection: Connection, message: object) {
    try {
      connection.send(JSON.stringify(message));
    } catch {
      // Connection may have closed.
    }
  }
}
