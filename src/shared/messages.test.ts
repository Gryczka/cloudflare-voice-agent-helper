import { describe, expect, it } from "vitest";
import {
  isFeedbackMessage,
  isMetricsMessage,
  isNoticeMessage,
  isStatusMessage,
  MessageType,
  NoticeCode,
} from "./messages";

describe("isMetricsMessage", () => {
  it("accepts a well-formed metrics message", () => {
    expect(
      isMetricsMessage({
        type: MessageType.METRICS,
        stt: { lastMs: 100, avgMs: 120, count: 3 },
        llm: null,
      })
    ).toBe(true);
  });

  it("rejects messages of a different type", () => {
    expect(isMetricsMessage({ type: MessageType.STATUS })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isMetricsMessage(null)).toBe(false);
    expect(isMetricsMessage("metrics")).toBe(false);
  });
});

describe("isNoticeMessage", () => {
  it("accepts a well-formed notice message", () => {
    expect(
      isNoticeMessage({
        type: MessageType.NOTICE,
        code: NoticeCode.SESSION_LIMIT,
        message: "Session ended.",
      })
    ).toBe(true);
  });

  it("rejects a notice missing required fields", () => {
    expect(isNoticeMessage({ type: MessageType.NOTICE })).toBe(false);
  });

  it("rejects messages of a different type", () => {
    expect(
      isNoticeMessage({
        type: MessageType.FEEDBACK,
        code: NoticeCode.LLM_LIMIT,
        message: "x",
      })
    ).toBe(false);
  });
});

describe("existing guards still pass regression", () => {
  it("isStatusMessage / isFeedbackMessage are unaffected", () => {
    expect(
      isStatusMessage({
        type: MessageType.STATUS,
        status: "connected",
        persona: "support",
      })
    ).toBe(true);
    expect(
      isFeedbackMessage({
        type: MessageType.FEEDBACK,
        text: "Nice work.",
        kind: "suggestion",
        persona: "support",
      })
    ).toBe(true);
  });
});
