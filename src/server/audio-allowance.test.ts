// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioAllowance, AUDIO_LEASE_BYTES } from "./audio-allowance";

afterEach(() => vi.useRealTimers());

describe("prepaid PCM admission", () => {
  for (const [fps, size] of [
    [10, 3200],
    [50, 640],
  ]) {
    it(`forwards ${fps} frames/s with 1.5s coordinator latency and batched reservations`, async () => {
      vi.useFakeTimers();
      const reserve = vi.fn(
        () =>
          new Promise<{ bytes: number; expires: number }>((resolve) => {
            setTimeout(
              () =>
                resolve({
                  bytes: AUDIO_LEASE_BYTES,
                  expires: Date.now() + 10000,
                }),
              1500
            );
          })
      );
      const allowance = new AudioAllowance(reserve);
      const send = vi.fn();
      const pending: Array<Promise<boolean>> = [];
      for (let i = 0; i < fps * 12; i++) {
        pending.push(allowance.forward(size, send));
        await vi.advanceTimersByTimeAsync(1000 / fps);
      }
      expect((await Promise.all(pending)).every(Boolean)).toBe(true);
      expect(send).toHaveBeenCalledTimes(fps * 12);
      expect(reserve.mock.calls.length).toBeLessThanOrEqual(4);
      expect(
        reserve.mock.calls.length * AUDIO_LEASE_BYTES
      ).toBeGreaterThanOrEqual(fps * 12 * size);
    });
  }

  it("never forwards bytes before a delayed reservation, and bounds pending queue memory", async () => {
    vi.useFakeTimers();
    const reserve = vi.fn(() => new Promise<null>(() => {}));
    const allowance = new AudioAllowance(reserve);
    const send = vi.fn();
    const pending = Array.from({ length: 100 }, () =>
      allowance.forward(640, send)
    );
    await expect(allowance.forward(640, send)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await Promise.all(pending)).every((value) => !value)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("fails closed on denied, malformed or expired leases and invalid frames", async () => {
    for (const lease of [
      null,
      { bytes: 160002, expires: Date.now() + 10000 },
      { bytes: 160000, expires: Date.now() - 1 },
      { bytes: 160000, expires: NaN },
    ]) {
      const reserve = vi.fn().mockResolvedValue(lease);
      const send = vi.fn();
      const allowance = new AudioAllowance(reserve);
      expect(await allowance.forward(640, send)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
    const reserve = vi.fn();
    const allowance = new AudioAllowance(reserve);
    for (const size of [0, -2, NaN, 641, 64002])
      expect(await allowance.forward(size, vi.fn())).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("cancels queued audio on end/reconnect without forwarding or closing a new call", async () => {
    let release!: (lease: { bytes: number; expires: number }) => void;
    const reserve = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValue({
        bytes: AUDIO_LEASE_BYTES,
        expires: Date.now() + 10000,
      });
    const allowance = new AudioAllowance(reserve);
    const oldSend = vi.fn(),
      newSend = vi.fn();
    const pending = allowance.forward(640, oldSend);
    await Promise.resolve();
    await Promise.resolve();
    allowance.reset();
    expect(await allowance.forward(640, newSend)).toBe(true);
    release({ bytes: AUDIO_LEASE_BYTES, expires: Date.now() + 10000 });
    expect(await pending).toBe(true);
    expect(oldSend).not.toHaveBeenCalled();
    expect(newSend).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(2); // Old unused lease is conservatively spent.
  });
});
