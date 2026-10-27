// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { Connection } from "agents";

const mocks = vi.hoisted(() => ({
  forward: vi.fn(),
  schedules: [] as Array<{ id: string; callback: string }>,
}));
vi.mock("agents", () => ({
  Agent: class {
    name = "issued-room";
    constructor(
      public ctx: unknown,
      public env: unknown
    ) {}
    onMessage = mocks.forward;
    getConnections() {
      return [];
    }
    getSchedules() {
      return [...mocks.schedules];
    }
    async cancelSchedule(id: string) {
      mocks.schedules = mocks.schedules.filter((s) => s.id !== id);
    }
    async scheduleEvery(_seconds: number, callback: string) {
      const item = { id: crypto.randomUUID(), callback };
      mocks.schedules.push(item);
      return item;
    }
    async schedule(seconds: number, callback: string) {
      const item = { id: crypto.randomUUID(), callback, seconds };
      mocks.schedules.push(item);
      return item;
    }
  },
}));
vi.mock("@cloudflare/voice", () => ({
  withVoiceInput: (base: unknown) => base,
  WorkersAINova3STT: class {},
}));
import { HelperAgent } from "./HelperAgent";

function setup() {
  mocks.forward.mockClear();
  mocks.schedules = [];
  const consume = vi.fn().mockResolvedValue(true);
  const reserveAudio = vi.fn().mockResolvedValue({
    bytes: 160000,
    expires: Date.now() + 10000,
  });
  const ai = vi
    .fn()
    .mockResolvedValue({ response: "Ask a clarifying question." });
  const env = {
    CALL_ADMISSION: {
      getByName: () => ({
        consume,
        reserveAudio,
        deadline: async () => Date.now() + 90000,
      }),
    },
    AI: { run: ai },
  } as unknown as Env;
  const agent = new HelperAgent({} as DurableObjectState, env);
  const connection = {
    id: "socket",
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as Connection;
  return { agent, connection, consume, reserveAudio, ai };
}

describe("voice provider boundaries", () => {
  it("acknowledges status-less Close frames without echoing reserved codes", async () => {
    const { agent, connection } = setup();
    await agent.onCallStart(connection);
    const cleanup = vi.spyOn(agent, "onCallEnd");
    await agent.onClose(connection, 1005);
    expect(connection.close).toHaveBeenCalledWith(1000, "");
    const closeOrder = vi.mocked(connection.close).mock.invocationCallOrder[0];
    const cleanupOrder = cleanup.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(cleanupOrder);
    expect(mocks.schedules).toHaveLength(0);
    vi.mocked(connection.close).mockClear();
    await agent.onClose(connection, 1006);
    expect(connection.close).not.toHaveBeenCalled();
  });
  it("reserves audio before the mixin buffers or forwards it", async () => {
    const { agent, connection, consume, reserveAudio } = setup();
    await agent.onCallStart(connection);
    reserveAudio.mockResolvedValue(null);
    consume.mockResolvedValue(false);
    await agent.onMessage(connection, new ArrayBuffer(32000));
    expect(reserveAudio).toHaveBeenCalledTimes(1);
    expect(consume).not.toHaveBeenCalledWith("issued-room", "audio", 32000);
    expect(mocks.forward).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
    expect(await agent.beforeCallStart(connection)).toBe(false);
  });
  it("cancels recurring and duration schedules on end, disconnect, and missing-connection expiration", async () => {
    const { agent, connection } = setup();
    await agent.onCallStart(connection);
    await agent.onCallStart(connection);
    expect(mocks.schedules).toHaveLength(2);
    await agent.onCallEnd(connection);
    expect(mocks.schedules).toHaveLength(0);
    await agent.onCallStart(connection);
    await agent.onClose(connection);
    expect(mocks.schedules).toHaveLength(0);
    await agent.onCallStart(connection);
    await agent.endSession("disconnected-socket");
    expect(mocks.schedules).toHaveLength(0);
  });
  it("reserves LLM calls and bounds model output and transcript input", async () => {
    const { agent, connection, consume, ai } = setup();
    await agent.onCallStart(connection);
    await agent.onTranscript("x".repeat(3000), connection);
    expect(consume).toHaveBeenCalledWith("issued-room", "llm");
    expect(ai.mock.calls[0][1].max_tokens).toBe(256);
    expect(ai.mock.calls[0][1].messages[1].content).not.toContain(
      "x".repeat(2001)
    );
    consume.mockResolvedValue(false);
    await agent.onTranscript("Another turn", connection);
    expect(ai).toHaveBeenCalledTimes(1);
  });
  it("removes stale recurring schedules after an inactive object wakes", async () => {
    const { agent, ai } = setup();
    mocks.schedules.push({ id: "legacy-orphan", callback: "rollingAnalysis" });
    await agent.rollingAnalysis("old-socket");
    expect(mocks.schedules).toHaveLength(0);
    expect(ai).not.toHaveBeenCalled();
  });
});
