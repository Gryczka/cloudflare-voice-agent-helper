import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LLM_CONFIG, QUOTA_CONFIG } from "../../shared/config";
import { DetailPanel } from "./DetailPanel";

describe("DetailPanel", () => {
  it("renders the exact shared configuration values", () => {
    render(<DetailPanel metrics={null} />);

    expect(screen.getByText(LLM_CONFIG.model)).toBeInTheDocument();
    expect(
      screen.getByText(`${QUOTA_CONFIG.maxLlmCallsPerSession}`)
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${Math.round(QUOTA_CONFIG.maxSessionSeconds / 60)} min`)
    ).toBeInTheDocument();
  });

  it("shows 'No data yet' badges before any call has run", () => {
    render(<DetailPanel metrics={null} />);
    const badges = screen.getAllByText("No data yet");
    expect(badges).toHaveLength(2);
  });

  it("renders live latency numbers once metrics arrive", () => {
    render(
      <DetailPanel
        metrics={{
          stt: { lastMs: 250, avgMs: 300, count: 4 },
          llm: { lastMs: 900, avgMs: 850, count: 2 },
        }}
      />
    );

    expect(screen.getAllByText("Live")).toHaveLength(2);
    expect(screen.getByText("250ms")).toBeInTheDocument();
    expect(screen.getByText("900ms")).toBeInTheDocument();
  });
});
