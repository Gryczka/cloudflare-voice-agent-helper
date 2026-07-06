import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the heading and eyebrow label", () => {
    render(<App />);
    expect(screen.getByText("Voice Agent Helper")).toBeInTheDocument();
    expect(screen.getByText(/Real-time Coaching/i)).toBeInTheDocument();
  });

  it("renders a dark-mode toggle button", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Toggle dark mode" })
    ).toBeInTheDocument();
  });

  it("switches to the Architecture view and back", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Coach view is the default.
    expect(screen.getByText("Live Transcript")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Architecture" }));
    expect(screen.getByText("How audio becomes coaching")).toBeInTheDocument();
    expect(screen.queryByText("Live Transcript")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coach" }));
    expect(screen.getByText("Live Transcript")).toBeInTheDocument();
  });

  it("switches to the Detail view and shows the live configuration", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Detail" }));
    expect(
      screen.getByText("Configuration & live latency")
    ).toBeInTheDocument();
    expect(screen.queryByText("Live Transcript")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coach" }));
    expect(screen.getByText("Live Transcript")).toBeInTheDocument();
  });
});
