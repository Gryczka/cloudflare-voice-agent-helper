/**
 * Voice Agent Helper — root application component.
 *
 * Renders the full single-page UI: a persona selector, live transcript panel,
 * real-time coaching feedback panel, and call controls. All voice pipeline
 * state is managed by the {@link useVoiceHelper} hook.
 *
 * @module client/App
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArchitecturePanel,
  Badge,
  Banner,
  Button,
  Card,
  DetailPanel,
  Eyebrow,
  Tabs,
} from "./components";
import { PERSONA_OPTIONS, type PersonaId } from "./lib/personas";
import { useVoiceHelper } from "./lib/useVoiceHelper";

/** Top-level page views: the live coaching UI, the architecture explainer,
 * and the configuration/latency detail view. */
const VIEW_OPTIONS = [
  { value: "coach", label: "Coach" },
  { value: "architecture", label: "Architecture" },
  { value: "detail", label: "Detail" },
] as const;
type ViewId = (typeof VIEW_OPTIONS)[number]["value"];

function App() {
  const [view, setView] = useState<ViewId>("coach");
  const [persona, setPersona] = useState<PersonaId>("support");
  const {
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
  } = useVoiceHelper(persona);

  const [streaming, setStreaming] = useState(true);
  const isListening = status === "listening" || status === "connected";

  // --- Dark mode toggle -------------------------------------------------
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }, []);

  // Keep state in sync if the system theme changes while no manual
  // preference has been stored.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem("theme")) {
          const next = e.matches;
          document.documentElement.classList.toggle("dark", next);
          setIsDark(next);
        }
      } catch {
        /* ignore */
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen bg-kumo-canvas p-6 text-kumo-text">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>Real-time Coaching</Eyebrow>
            <h1 className="mt-1 text-2xl font-semibold text-kumo-text">
              Voice Agent Helper
            </h1>
            <p className="mt-1 text-sm text-kumo-text-muted">
              Live transcription and AI coaching for support and sales calls.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Tabs options={VIEW_OPTIONS} value={view} onChange={setView} />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="flex h-9 w-9 items-center justify-center rounded-kumo-pill border border-kumo-line bg-kumo-elevated text-kumo-text-muted transition-colors hover:text-kumo-text"
            >
              {isDark ? "\u2600\uFE0F" : "\u263D\uFE0F"}
            </button>
          </div>
        </header>

        {view === "coach" && (
          <>
            <div className="flex justify-end">
              <Tabs
                options={PERSONA_OPTIONS}
                value={persona}
                onChange={setPersona}
              />
            </div>

            {error && <Banner tone="danger">Error: {error}</Banner>}
            {notice && <Banner tone="warning">{notice.message}</Banner>}

            <Banner tone={isListening ? "success" : "info"}>
              {status === "connecting" && "Connecting to voice pipeline..."}
              {status === "listening" &&
                "Listening... Speak into your microphone."}
              {status === "connected" && "Connected. Waiting for audio..."}
              {status === "idle" &&
                "Start a call to begin live transcription and coaching."}
              {status === "error" &&
                "Something went wrong. Check the error above."}
            </Banner>

            {/* Main panels */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Live Transcript */}
              <Card corners className="flex min-h-[24rem] flex-col">
                <div className="flex items-center justify-between border-b border-kumo-line px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Eyebrow>Live Transcript</Eyebrow>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStreaming((s) => !s)}
                    className="text-xs text-kumo-text-muted transition-colors hover:text-kumo-text"
                  >
                    {streaming ? "Streaming \u2713" : "Final only"}
                  </button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {transcripts.length === 0 && !interimTranscript ? (
                    <p className="text-sm italic text-kumo-text-muted">
                      Transcript will appear here once the call starts.
                    </p>
                  ) : (
                    <>
                      {transcripts.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-kumo-md bg-kumo-recessed p-3 text-sm"
                        >
                          <p className="text-kumo-text">{t.text}</p>
                          <Badge tone="neutral" className="mt-2">
                            {t.role === "user" ? "Speaker" : "Agent"}
                          </Badge>
                        </div>
                      ))}
                      {streaming && interimTranscript && (
                        <div className="rounded-kumo-md border border-kumo-accent/30 bg-kumo-accent-tint p-3 text-sm">
                          <p className="italic text-kumo-text-muted">
                            {interimTranscript}
                            <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-kumo-accent align-middle" />
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>

              {/* Coach Feedback */}
              <Card corners className="flex min-h-[24rem] flex-col">
                <div className="border-b border-kumo-line px-5 py-4">
                  <Eyebrow>Coach Feedback</Eyebrow>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {feedback.length === 0 ? (
                    <p className="text-sm italic text-kumo-text-muted">
                      Feedback cards will appear here in real time.
                    </p>
                  ) : (
                    feedback.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-kumo-md border border-kumo-line bg-kumo-recessed p-4"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={item.kind === "insight" ? "info" : "brand"}
                          >
                            {item.kind === "insight" ? "Insight" : "Suggestion"}
                          </Badge>
                          <span className="text-xs text-kumo-text-subtle">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-kumo-text-muted">
                          {item.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Call controls */}
            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                variant={isListening ? "danger" : "primary"}
                onClick={isListening ? stop : start}
                disabled={status === "connecting"}
              >
                {status === "connecting"
                  ? "Connecting..."
                  : isListening
                    ? "Stop Call"
                    : "Start Call"}
              </Button>

              {isListening && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-kumo-text-muted">
                    Mic level
                  </span>
                  <div className="h-2 w-32 overflow-hidden rounded-kumo-pill bg-kumo-recessed">
                    <div
                      className="h-full bg-kumo-accent transition-all"
                      style={{ width: `${Math.min(audioLevel * 200, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {view === "architecture" && <ArchitecturePanel />}
        {view === "detail" && <DetailPanel metrics={metrics} />}
      </div>
    </div>
  );
}

export default App;
