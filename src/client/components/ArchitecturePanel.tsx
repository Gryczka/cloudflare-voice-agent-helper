/**
 * Architecture tab — a hand-authored, animated SVG diagram of the voice
 * coaching pipeline, followed by a legend grid explaining each component.
 *
 * The diagram is a single responsive `<svg>` (nodes = rounded rects, edges =
 * bezier/line paths). Motion is layered on with CSS keyframes
 * (`styles/architecture.css`) plus SVG `<animateMotion>` for traveling
 * packet dots:
 *
 * - Orange dots (accent) flow left→right: mic audio and the STT/LLM request.
 * - Green dots (AI accent) flow right→left: transcripts, coaching text, and
 *   feedback delivered back to the browser.
 * - The HelperAgent hub has a heartbeat ring standing in for the real
 *   20-second `rollingAnalysis` timer (compressed to ~7s so the motion
 *   stays visible).
 *
 * All animation is disabled under `prefers-reduced-motion: reduce`, leaving
 * a static but fully legible diagram.
 *
 * @module client/components/ArchitecturePanel
 */
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Eyebrow } from "./Eyebrow";
import "../styles/architecture.css";

/** A rounded-rect diagram node with a title, subtitle, and children content. */
function DiagramNode({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  titleSize = 15,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  titleSize?: number;
  children?: React.ReactNode;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="var(--kumo-elevated)"
        stroke="var(--kumo-line-hover)"
        strokeWidth={1.5}
      />
      {title && (
        <text
          x={x + 16}
          y={y + 28}
          fontSize={titleSize}
          fontWeight={600}
          fill="var(--kumo-text)"
          fontFamily="var(--kumo-font-sans)"
        >
          {title}
        </text>
      )}
      {subtitle && (
        <text
          x={x + 16}
          y={y + 46}
          fontSize={11}
          fill="var(--kumo-text-muted)"
          fontFamily="var(--kumo-font-sans)"
        >
          {subtitle}
        </text>
      )}
      {children}
    </g>
  );
}

/** Small mono edge label, e.g. "audio · 16kHz". */
function EdgeLabel({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={10}
      fontFamily="var(--kumo-font-mono)"
      fill="var(--kumo-text-subtle)"
    >
      {children}
    </text>
  );
}

/** A flowing, arrowed connector path with N traveling packet dots. */
function Wire({
  id,
  d,
  color,
  markerId,
  dots = 2,
  duration = 1.6,
}: {
  id: string;
  d: string;
  color: string;
  markerId: string;
  dots?: number;
  duration?: number;
}) {
  return (
    <>
      <path
        id={id}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        className="arch-wire"
        markerEnd={`url(#${markerId})`}
      />
      {Array.from({ length: dots }).map((_, i) => (
        <circle
          key={i}
          r={4}
          fill={color}
          className="arch-packet"
          style={{ color }}
        >
          <animateMotion
            dur={`${duration}s`}
            begin={`${(i * duration) / dots}s`}
            repeatCount="indefinite"
          >
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}

/** The animated pipeline diagram. */
function PipelineDiagram() {
  const accent = "var(--kumo-accent)";
  const ai = "var(--kumo-accent-ai)";

  return (
    <div className="overflow-x-auto">
      <svg
        className="arch-diagram"
        viewBox="0 0 1040 420"
        style={{ minWidth: 720 }}
        role="img"
        aria-labelledby="arch-title arch-desc"
      >
        <title id="arch-title">Voice Agent Helper architecture diagram</title>
        <desc id="arch-desc">
          The browser streams microphone audio through a Worker entry point to
          the HelperAgent Durable Object, which sends audio to Workers AI Nova-3
          for speech-to-text and coaching prompts to a Llama 3.1 language model,
          then returns transcripts and feedback to the browser.
        </desc>

        <defs>
          <marker
            id="arch-arrow-accent"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={accent} />
          </marker>
          <marker
            id="arch-arrow-ai"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={ai} />
          </marker>
        </defs>

        {/* Workers AI grouping frame */}
        <rect
          x={780}
          y={20}
          width={240}
          height={370}
          rx={20}
          fill="none"
          stroke="var(--kumo-line-hover)"
          strokeDasharray="4 4"
        />
        <text
          x={900}
          y={38}
          textAnchor="middle"
          fontFamily="var(--kumo-font-mono)"
          fontSize={10}
          letterSpacing={1}
          fill="var(--kumo-text-subtle)"
        >
          <tspan fill={accent}>{"// "}</tspan>WORKERS AI
        </text>

        {/* --- Edges --- */}
        <Wire
          id="p-spine-fwd"
          d="M 250,196 L 320,196 L 460,196 L 500,196"
          color={accent}
          markerId="arch-arrow-accent"
          duration={1.4}
        />
        <Wire
          id="p-spine-rev"
          d="M 500,224 L 460,224 L 320,224 L 250,224"
          color={ai}
          markerId="arch-arrow-ai"
          dots={1}
          duration={2}
        />
        <EdgeLabel x={375} y={186}>
          audio · 16kHz
        </EdgeLabel>
        <EdgeLabel x={375} y={246}>
          feedback · status
        </EdgeLabel>

        <Wire
          id="p-stt-fwd"
          d="M 740,150 C 770,150 770,100 800,100"
          color={accent}
          markerId="arch-arrow-accent"
          duration={1.3}
        />
        <Wire
          id="p-stt-rev"
          d="M 800,120 C 770,120 770,170 740,170"
          color={ai}
          markerId="arch-arrow-ai"
          dots={1}
          duration={1.9}
        />
        <EdgeLabel x={772} y={132}>
          transcribe
        </EdgeLabel>
        <EdgeLabel x={772} y={196}>
          transcript
        </EdgeLabel>

        <Wire
          id="p-llm-fwd"
          d="M 740,270 C 770,270 770,290 800,290"
          color={accent}
          markerId="arch-arrow-accent"
          duration={1.7}
        />
        <Wire
          id="p-llm-rev"
          d="M 800,330 C 770,330 770,300 740,300"
          color={ai}
          markerId="arch-arrow-ai"
          dots={1}
          duration={2.2}
        />
        <EdgeLabel x={772} y={262}>
          prompt
        </EdgeLabel>
        <EdgeLabel x={772} y={352}>
          coaching
        </EdgeLabel>

        {/* --- Nodes --- */}
        <DiagramNode
          x={40}
          y={110}
          w={210}
          h={200}
          title="Browser"
          subtitle="React SPA + microphone"
        >
          <text
            x={56}
            y={180}
            fontSize={10}
            fontFamily="var(--kumo-font-mono)"
            fill="var(--kumo-text-subtle)"
          >
            useVoiceHelper()
          </text>
          <g aria-hidden="true">
            {[113, 127, 141, 155, 169].map((barX) => (
              <rect
                key={barX}
                className="arch-bar"
                x={barX}
                y={210}
                width={8}
                height={60}
                rx={4}
                fill={accent}
                style={{ transformOrigin: `${barX + 4}px 240px` }}
              />
            ))}
          </g>
        </DiagramNode>

        <DiagramNode x={320} y={182} w={140} h={56}>
          <text
            x={390}
            y={205}
            textAnchor="middle"
            fontSize={12.5}
            fontWeight={600}
            fill="var(--kumo-text)"
          >
            Worker Entry
          </text>
          <text
            x={390}
            y={221}
            textAnchor="middle"
            fontSize={9.5}
            fontFamily="var(--kumo-font-mono)"
            fill="var(--kumo-text-muted)"
          >
            routeAgentRequest()
          </text>
        </DiagramNode>

        <g>
          <circle
            cx={620}
            cy={210}
            r={95}
            fill="none"
            stroke={accent}
            strokeWidth={2}
            className="arch-pulse-ring"
          />
        </g>
        <DiagramNode
          x={500}
          y={90}
          w={240}
          h={240}
          title="HelperAgent"
          subtitle="Durable Object · Agents SDK"
        >
          <text
            x={516}
            y={116}
            fontSize={10}
            fontFamily="var(--kumo-font-mono)"
            letterSpacing={1}
          >
            <tspan fill={accent}>{"// "}</tspan>
            <tspan fill="var(--kumo-text-subtle)">DURABLE OBJECT</tspan>
          </text>
          {[
            { y: 200, label: "onTranscript() \u2192 coach" },
            { y: 222, label: "rollingAnalysis every 20s" },
            { y: 244, label: "WebSocket hibernation" },
          ].map((line) => (
            <g key={line.label}>
              <circle cx={516} cy={line.y - 4} r={2.5} fill={ai} />
              <text
                x={528}
                y={line.y}
                fontSize={10.5}
                fontFamily="var(--kumo-font-mono)"
                fill="var(--kumo-text-muted)"
              >
                {line.label}
              </text>
            </g>
          ))}
        </DiagramNode>

        <circle
          cx={900}
          cy={100}
          r={64}
          fill={ai}
          className="arch-glow"
          style={{ filter: "blur(18px)" }}
        />
        <DiagramNode
          x={800}
          y={40}
          w={200}
          h={120}
          title="Nova-3 STT"
          titleSize={14}
        >
          <text x={816} y={88} fontSize={10.5} fill="var(--kumo-text-muted)">
            Workers AI
          </text>
          <text x={816} y={104} fontSize={10} fill="var(--kumo-text-subtle)">
            streaming transcription
          </text>
        </DiagramNode>

        <circle
          cx={900}
          cy={310}
          r={64}
          fill={accent}
          className="arch-glow arch-glow--delay"
          style={{ filter: "blur(18px)" }}
        />
        <DiagramNode
          x={800}
          y={250}
          w={200}
          h={120}
          title="Llama 3.1 8B"
          titleSize={14}
        >
          <text x={816} y={298} fontSize={10.5} fill="var(--kumo-text-muted)">
            Workers AI
          </text>
          <text x={816} y={314} fontSize={10} fill="var(--kumo-text-subtle)">
            real-time coaching
          </text>
        </DiagramNode>
      </svg>
    </div>
  );
}

/** Component legend entry. */
type LegendItem = {
  title: string;
  description: string;
  tags: string[];
};

const LEGEND: LegendItem[] = [
  {
    title: "React SPA",
    description:
      "Vite-built client rendering the transcript, coaching, and mic-level UI with the Kumo design system and dark mode.",
    tags: ["React 19", "Vite", "Tailwind v4"],
  },
  {
    title: "useVoiceHelper hook",
    description:
      "Owns the VoiceClient lifecycle: connect, stream mic audio, and translate transcript/feedback events into React state.",
    tags: ["@cloudflare/voice"],
  },
  {
    title: "Shared message contract",
    description:
      "A typed ServerMessage union and type guards used by both the client and the Durable Object to avoid stringly-typed drift.",
    tags: ["TypeScript"],
  },
  {
    title: "Worker entry point",
    description:
      "Routes WebSocket upgrades to the HelperAgent Durable Object and serves the built SPA as static assets.",
    tags: ["Workers"],
  },
  {
    title: "HelperAgent (Durable Object)",
    description:
      "Coordinates the pipeline: forwards audio to STT, runs coaching prompts, and survives WebSocket hibernation between events.",
    tags: ["Agents SDK", "Durable Objects"],
  },
  {
    title: "Nova-3 speech-to-text",
    description:
      "Streaming transcription running on Workers AI, tuned for low-latency endpointing and smart formatting.",
    tags: ["Workers AI", "Nova-3"],
  },
  {
    title: "Llama 3.1 8B coaching",
    description:
      "Generates a concise, actionable suggestion after every finalized utterance, constrained to one or two sentences.",
    tags: ["Workers AI", "Llama 3.1"],
  },
  {
    title: "Rolling analysis",
    description:
      "A 20-second scheduled task that reviews recent exchanges and surfaces a proactive coaching insight.",
    tags: ["scheduleEvery(20s)"],
  },
  {
    title: "Personas",
    description:
      "Support and Sales system prompts shared by ID between client options and server-side coaching logic.",
    tags: ["Prompt config"],
  },
];

export function ArchitecturePanel() {
  return (
    <div className="space-y-6">
      <Card corners className="p-5">
        <Eyebrow>Pipeline</Eyebrow>
        <h2 className="mt-1 text-lg font-semibold text-kumo-text">
          How audio becomes coaching
        </h2>
        <p className="mt-1 text-sm text-kumo-text-muted">
          Mic audio streams through the Worker to the HelperAgent Durable
          Object, which orchestrates Workers AI for transcription and coaching,
          then streams results back in real time.
        </p>

        <div className="mt-5 flex items-center gap-5 text-xs text-kumo-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-kumo-accent" />
            Audio / request path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-kumo-accent-ai" />
            Transcript / feedback path
          </span>
        </div>

        <div className="mt-4">
          <PipelineDiagram />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LEGEND.map((item) => (
          <Card key={item.title} className="flex flex-col p-4">
            <Eyebrow>{item.title}</Eyebrow>
            <p className="mt-2 flex-1 text-sm text-kumo-text-muted">
              {item.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
