/**
 * Detail tab — shows the exact pipeline configuration in effect (sourced
 * directly from `src/shared/config.ts`, so it can never drift from what
 * the server is actually running) alongside live latency measurements
 * for the STT and LLM pipeline stages.
 *
 * @module client/components/DetailPanel
 */
import { LLM_CONFIG, QUOTA_CONFIG, STT_CONFIG } from "../../shared/config";
import type { LatencyStats } from "../../shared/messages";
import type { PipelineMetrics } from "../lib/useVoiceHelper";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Eyebrow } from "./Eyebrow";

/** A single label/value row in the configuration table. */
type ConfigRow = { label: string; value: string };

const PIPELINE_CONFIG_ROWS: ConfigRow[] = [
  { label: "STT provider", value: STT_CONFIG.provider },
  { label: "STT language", value: STT_CONFIG.language },
  { label: "Endpointing silence", value: `${STT_CONFIG.endpointingMs} ms` },
  { label: "Utterance end timeout", value: `${STT_CONFIG.utteranceEndMs} ms` },
  { label: "Audio sample rate", value: `${STT_CONFIG.sampleRate} Hz` },
  { label: "LLM model", value: LLM_CONFIG.model },
  {
    label: "Rolling insight interval",
    value: `${LLM_CONFIG.rollingAnalysisIntervalSeconds}s`,
  },
];

const QUOTA_CONFIG_ROWS: ConfigRow[] = [
  {
    label: "Max session length",
    value: `${Math.round(QUOTA_CONFIG.maxSessionSeconds / 60)} min`,
  },
  {
    label: "Max coaching calls / session",
    value: `${QUOTA_CONFIG.maxLlmCallsPerSession}`,
  },
  {
    label: "New connections / IP",
    value: `${QUOTA_CONFIG.connectionRateLimit.limit} per ${QUOTA_CONFIG.connectionRateLimit.periodSeconds}s`,
  },
];

/** A configuration table: a Card with an Eyebrow title and label/value rows. */
function ConfigTable({ title, rows }: { title: string; rows: ConfigRow[] }) {
  return (
    <Card corners className="p-5">
      <Eyebrow>{title}</Eyebrow>
      <dl className="mt-4 divide-y divide-kumo-line">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-2.5 text-sm"
          >
            <dt className="text-kumo-text-muted">{row.label}</dt>
            <dd className="font-mono text-xs text-kumo-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** A single latency stat card for one pipeline stage (STT or LLM). */
function LatencyCard({
  title,
  description,
  stats,
}: {
  title: string;
  description: string;
  stats: LatencyStats | null;
}) {
  const hasData = stats !== null && stats !== undefined;

  return (
    <Card corners className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        <Badge tone={hasData ? "success" : "neutral"}>
          {hasData ? "Live" : "No data yet"}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-kumo-text-muted">{description}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-semibold text-kumo-text">
            {hasData ? `${stats.lastMs}ms` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-kumo-text-subtle">
            Last
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold text-kumo-text">
            {hasData ? `${stats.avgMs}ms` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-kumo-text-subtle">
            Average
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold text-kumo-text">
            {hasData ? stats.count : "—"}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-kumo-text-subtle">
            Samples
          </p>
        </div>
      </div>
    </Card>
  );
}

export function DetailPanel({ metrics }: { metrics: PipelineMetrics | null }) {
  return (
    <div className="space-y-6">
      <Card corners className="p-5">
        <Eyebrow>Detail</Eyebrow>
        <h2 className="mt-1 text-lg font-semibold text-kumo-text">
          Configuration &amp; live latency
        </h2>
        <p className="mt-1 text-sm text-kumo-text-muted">
          The exact settings this deployment is running, plus real measurements
          from the current call. Start a call on the Coach tab to populate the
          latency numbers below.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigTable
          title="Pipeline configuration"
          rows={PIPELINE_CONFIG_ROWS}
        />
        <ConfigTable title="Abuse-protection quotas" rows={QUOTA_CONFIG_ROWS} />
      </div>

      <div>
        <Eyebrow>Live Latency</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <LatencyCard
            title="Transcription"
            description={
              "Finalization lag: time from the last interim transcript " +
              "update to the finalized utterance. A proxy for perceived " +
              "responsiveness, not a pure model-only benchmark."
            }
            stats={metrics?.stt ?? null}
          />
          <LatencyCard
            title="Coaching LLM"
            description={
              "Wall-clock duration of each Workers AI inference call " +
              "for a suggestion or rolling insight."
            }
            stats={metrics?.llm ?? null}
          />
        </div>
      </div>
    </div>
  );
}
