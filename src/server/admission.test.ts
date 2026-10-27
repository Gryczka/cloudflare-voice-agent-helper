// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("agents", () => ({ routeAgentRequest: vi.fn() }));
vi.mock("./HelperAgent", () => ({ HelperAgent: class {} }));
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown
    ) {}
  },
}));
import worker from "./index";
import { routeAgentRequest } from "agents";
import { CallAdmission } from "./CallAdmission";

function store() {
  const data = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    },
    getAlarm: async () => 1,
    setAlarm: async () => {},
    transaction: async <T>(fn: (s: unknown) => Promise<T>) => fn(storage),
  };
  return { storage, data };
}

describe("voice admission", () => {
  it("headers unexpected failures without leaking details or dispatching providers", async () => {
    const env = {
      ASSETS: {
        fetch: vi
          .fn()
          .mockRejectedValue(new Error("synthetic internal detail")),
      },
    } as unknown as Env;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await worker.fetch(
        new Request("https://voice.test/") as Parameters<
          typeof worker.fetch
        >[0],
        env
      );
      expect(response.status).toBe(500);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("Internal server error");
      expect(routeAgentRequest).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("precharges leases durably, never refunds lost leases, and bounds global/room PCM before forwarding", async () => {
    const { storage, data } = store();
    const ctx = { storage } as unknown as DurableObjectState;
    const admission = new CallAdmission(ctx, {} as Env);
    const call = (await admission.issue("synthetic-budget-ip"))!;
    const key = `${new Date().toISOString().slice(0, 10)}:audio`;
    data.set(key, 72000 * 32000 - 3200);
    const lease = await admission.reserveAudio(call.room);
    expect(lease?.bytes).toBe(3200);
    expect(lease!.expires).toBeLessThanOrEqual(call.expires);
    expect(data.get(key)).toBe(72000 * 32000);
    expect(
      await new CallAdmission(ctx, {} as Env).reserveAudio(call.room)
    ).toBeNull();
    data.set(key, 0);
    const stored = data.get(`call:${call.room}`) as { audio: number };
    stored.audio = 3600 * 32000 - 2;
    expect((await admission.reserveAudio(call.room))?.bytes).toBe(2);
    expect(await admission.reserveAudio(call.room)).toBeNull();
  });
  beforeEach(() => vi.clearAllMocks());
  it("rejects forged/named requests without dispatching an agent", async () => {
    const authorize = vi.fn().mockResolvedValue(false);
    const env = {
      CALL_ADMISSION: { getByName: () => ({ authorize }) },
      WS_RATE_LIMITER: {},
      AI: {},
    } as unknown as Env;
    for (const path of [
      "/agents/helper-agent/default",
      `/agents/helper-agent/${crypto.randomUUID()}`,
      "/agents/other/room",
    ]) {
      const response = await worker.fetch(
        new Request(`https://voice.test${path}`) as Parameters<
          typeof worker.fetch
        >[0],
        env
      );
      expect(response.status).toBe(
        path.endsWith("default") || path.includes("/other/") ? 403 : 426
      );
    }
    expect(routeAgentRequest).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
  it("validates method, upgrade and origin before creating any admission stub", async () => {
    const room = crypto.randomUUID();
    const cookie = `voice_call=${room}.${crypto.randomUUID()}${crypto.randomUUID()}`;
    const getByName = vi.fn();
    const limit = vi.fn();
    const env = {
      CALL_ADMISSION: { getByName },
      WS_RATE_LIMITER: { limit },
      AI: {},
    } as unknown as Env;
    for (const [path, method, upgrade, origin, expected] of [
      [
        `/agents/helper-agent/${room}`,
        "POST",
        "websocket",
        "https://voice.test",
        426,
      ],
      [`/agents/helper-agent/${room}`, "GET", "", "https://voice.test", 426],
      [
        `/agents/helper-agent/${room}`,
        "GET",
        "websocket",
        "https://other.test",
        403,
      ],
      ["/api/call", "GET", "", "https://voice.test", 405],
      ["/api/call", "POST", "", "https://other.test", 403],
    ] as const) {
      const response = await worker.fetch(
        new Request(`https://voice.test${path}`, {
          method,
          headers: { upgrade, origin, cookie },
        }) as Parameters<typeof worker.fetch>[0],
        env
      );
      expect(response.status).toBe(expected);
    }
    expect(limit).not.toHaveBeenCalled();
    expect(getByName).not.toHaveBeenCalled();
    expect(routeAgentRequest).not.toHaveBeenCalled();
  });
  it("checks the cheap limiter for wrong tokens, but skips RPC for malformed or exhausted requests", async () => {
    const room = crypto.randomUUID();
    const authorize = vi.fn().mockResolvedValue(false);
    const getByName = vi.fn().mockReturnValue({ authorize });
    const limit = vi.fn().mockResolvedValue({ success: true });
    const env = {
      CALL_ADMISSION: { getByName },
      WS_RATE_LIMITER: { limit },
      AI: {},
    } as unknown as Env;
    const request = (cookie: string) =>
      new Request(`https://voice.test/agents/helper-agent/${room}`, {
        headers: {
          upgrade: "websocket",
          origin: "https://voice.test",
          cookie,
          "cf-connecting-ip": "192.0.2.1",
        },
      }) as Parameters<typeof worker.fetch>[0];
    expect(
      (await worker.fetch(request(`voice_call=${room}.wrong`), env)).status
    ).toBe(403);
    expect(limit).toHaveBeenCalledWith({ key: "192.0.2.1" });
    expect(getByName).not.toHaveBeenCalled();
    const wrong = `voice_call=${room}.${crypto.randomUUID()}${crypto.randomUUID()}`;
    limit.mockResolvedValueOnce({ success: false });
    expect((await worker.fetch(request(wrong), env)).status).toBe(429);
    limit.mockRejectedValueOnce(new Error("limiter unavailable"));
    expect((await worker.fetch(request(wrong), env)).status).toBe(503);
    expect(getByName).not.toHaveBeenCalled();
    // A well-formed capability needs stored-digest verification, after the limiter.
    expect((await worker.fetch(request(wrong), env)).status).toBe(403);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(limit.mock.invocationCallOrder[3]).toBeLessThan(
      authorize.mock.invocationCallOrder[0]
    );
    expect(routeAgentRequest).not.toHaveBeenCalled();
  });
  it("keeps exhausted allowances after a coordinator restart and authenticates capabilities", async () => {
    const ctx = store() as unknown as DurableObjectState;
    const first = new CallAdmission(ctx, {} as Env);
    const call = (await first.issue("test-ip"))!;
    expect(await first.authorize(call.room, call.token)).toBe(true);
    expect(
      await first.authorize(
        call.room,
        crypto.randomUUID() + crypto.randomUUID()
      )
    ).toBe(false);
    for (let i = 0; i < 3; i++)
      expect(await first.consume(call.room, "starts")).toBe(true);
    const restarted = new CallAdmission(ctx, {} as Env);
    expect(await restarted.consume(call.room, "starts")).toBe(false);
    for (let i = 0; i < 500; i++)
      expect(await restarted.consume(call.room, "llm")).toBe(true);
    expect(await first.consume(call.room, "llm")).toBe(false);
    expect(await first.consume(call.room, "audio", 64001)).toBe(false);
  });
});
