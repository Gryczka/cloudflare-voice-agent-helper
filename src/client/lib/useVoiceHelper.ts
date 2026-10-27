/**
 * React hook that manages the full voice-client lifecycle: WebSocket
 * connection, microphone streaming, transcript state, and coaching
 * feedback.
 *
 * ## Lifecycle
 *
 * 1. `start()` creates a {@link VoiceClient} targeting the `HelperAgent`
 *    Durable Object, passing the selected persona as a query param.
 * 2. The client calls `connect()` to open the WebSocket. We then
 *    **await the `connectionchange` event** before calling `startCall()`
 *    — this ensures the DO is ready to receive audio. A 10s timeout
 *    guards against hung connections.
 * 3. Once the call starts, the `@cloudflare/voice` library streams mic
 *    audio to the server and emits:
 *    - `transcriptchange` — finalized transcript segments.
 *    - `interimtranscript` — partial (in-flight) text for live display.
 *    - `audiolevelchange` — mic input level for the VU meter.
 *    - `custommessage` — our coaching feedback, status, latency metrics,
 *      and quota-notice JSON (see `src/shared/messages.ts`).
 * 4. `stop()` ends the call, disconnects, and resets local state. It is
 *    also called automatically if the server sends a `session_limit`
 *    notice (the max call duration quota was reached).
 *
 * @module client/lib/useVoiceHelper
 */
import { VoiceClient } from "@cloudflare/voice/client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isFeedbackMessage,
  isMetricsMessage,
  isNoticeMessage,
  isStatusMessage,
  NoticeCode,
  StatusValue,
  type FeedbackKindValue,
  type LatencyStats,
  type NoticeCodeValue,
} from "../../shared/messages";
import type { PersonaId } from "./personas";

/** A single coaching feedback item rendered in the feedback panel. */
export type FeedbackItem = {
  id: string;
  text: string;
  kind: FeedbackKindValue;
  timestamp: number;
};

/** A finalized transcript segment rendered in the transcript panel. */
export type TranscriptItem = {
  id: string;
  text: string;
  role: "user" | "assistant";
  timestamp: number;
};

/** High-level connection / call lifecycle state. */
export type CallStatus =
  "idle" | "connecting" | "connected" | "listening" | "error";

/** Live latency stats for both pipeline stages, as shown in the Detail panel. */
export type PipelineMetrics = {
  stt: LatencyStats | null;
  llm: LatencyStats | null;
};

/** A one-time quota notice from the server. */
export type NoticeItem = {
  code: NoticeCodeValue;
  message: string;
};

export function useVoiceHelper(persona: PersonaId) {
  const clientRef = useRef<VoiceClient | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState<string | null>(
    null
  );
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [notice, setNotice] = useState<NoticeItem | null>(null);

  const stop = useCallback(() => {
    clientRef.current?.endCall();
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("idle");
    setAudioLevel(0);
    setInterimTranscript(null);
  }, []);

  const start = useCallback(async () => {
    if (clientRef.current) return;

    setError(null);
    setNotice(null);
    setMetrics(null);
    setStatus("connecting");

    const admission = await fetch("/api/call", { method: "POST" });
    if (!admission.ok) {
      setError(
        "The public demo's call allowance is unavailable. Please try later."
      );
      setStatus("error");
      return;
    }
    const { room } = (await admission.json()) as { room: string };
    const client = new VoiceClient({
      agent: "HelperAgent",
      name: room,
      query: { persona },
    });

    // --- Voice-client event listeners ---

    client.addEventListener("statuschange", (newStatus) => {
      if (newStatus === "listening") {
        setStatus("listening");
      } else if (newStatus === "speaking" || newStatus === "thinking") {
        setStatus("connected");
      } else if (newStatus === "idle") {
        setStatus("idle");
      }
    });

    client.addEventListener("connectionchange", (connected) => {
      if (connected) {
        setStatus("connected");
      } else {
        setStatus("idle");
      }
    });

    client.addEventListener("transcriptchange", (messages) => {
      setTranscripts(
        messages.map((m) => ({
          id: `${m.role}-${m.timestamp}`,
          text: m.text,
          role: m.role,
          timestamp: m.timestamp,
        }))
      );
      setInterimTranscript(null);
    });

    client.addEventListener("interimtranscript", (text) => {
      setInterimTranscript(text);
    });

    // Custom messages from HelperAgent — coaching feedback, status,
    // latency metrics, and quota notices.
    client.addEventListener("custommessage", (message) => {
      if (isFeedbackMessage(message)) {
        setFeedback((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            text: message.text,
            kind: message.kind,
            timestamp: Date.now(),
          },
        ]);
      } else if (
        isStatusMessage(message) &&
        message.status === StatusValue.LISTENING
      ) {
        setStatus("listening");
      } else if (isMetricsMessage(message)) {
        setMetrics({ stt: message.stt, llm: message.llm });
      } else if (isNoticeMessage(message)) {
        setNotice({ code: message.code, message: message.message });
        if (message.code === NoticeCode.SESSION_LIMIT) {
          stop();
        }
      }
    });

    client.addEventListener("audiolevelchange", setAudioLevel);

    client.addEventListener("error", (err) => {
      if (err === null || err === undefined || err === "") return;
      const message =
        typeof err === "string" ? err : "Unknown voice client error";
      console.error("[VoiceClient] error:", err);
      setError(message);
      setStatus("error");
    });

    clientRef.current = client;
    client.connect();

    // Wait for the WebSocket to connect before starting the call.
    await new Promise<void>((resolve, reject) => {
      if (client.connected) {
        resolve();
        return;
      }
      const onConnectionChange = (connected: boolean) => {
        if (connected) {
          client.removeEventListener("connectionchange", onConnectionChange);
          resolve();
        }
      };
      client.addEventListener("connectionchange", onConnectionChange);
      setTimeout(() => {
        client.removeEventListener("connectionchange", onConnectionChange);
        reject(new Error("Voice client connection timeout"));
      }, 10000);
    });

    await client.startCall();
  }, [persona, stop]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    status,
    error,
    transcripts,
    interimTranscript,
    feedback,
    audioLevel,
    metrics,
    notice,
    start,
    stop,
  };
}
