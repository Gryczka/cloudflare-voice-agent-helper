export type AudioLease = { bytes: number; expires: number };
export const AUDIO_LEASE_BYTES = 160000; // Five seconds of 16 kHz PCM16.
const QUEUE_BYTES = 64000; // At most two seconds awaiting admission.
const QUEUE_FRAMES = 128;
const RESERVE_TIMEOUT_MS = 2000;

function freshState() {
  return {
    tail: Promise.resolve(),
    count: 0,
    bytes: 0,
    second: 0,
    burst: 0,
    lease: null as AudioLease | null,
    next: null as Promise<AudioLease | null> | null,
    failed: false,
  };
}

/** All bytes are durably prepaid before reaching the voice mixin/provider.
 * Unused, expired or lost leases are never refunded. Local debit is synchronous;
 * one FIFO and one refill promise serve every connection in this room.
 */
export class AudioAllowance {
  private state = freshState();
  constructor(private reserve: () => Promise<AudioLease | null>) {}

  reset() {
    this.state = freshState();
  }

  private refill(state: ReturnType<typeof freshState>) {
    if (!state.next) {
      state.next = new Promise<AudioLease | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), RESERVE_TIMEOUT_MS);
        void Promise.resolve()
          .then(this.reserve)
          .then(resolve, () => resolve(null))
          .finally(() => clearTimeout(timer));
      });
    }
    return state.next;
  }

  async forward(bytes: number, send: () => void | Promise<void>) {
    const state = this.state;
    if (
      state.failed ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > QUEUE_BYTES ||
      bytes % 2
    )
      return false;
    const second = Math.floor(Date.now() / 1000);
    if (state.second !== second) {
      state.second = second;
      state.burst = 0;
    }
    if (
      state.count >= QUEUE_FRAMES ||
      state.bytes + bytes > QUEUE_BYTES ||
      state.burst + bytes > QUEUE_BYTES
    )
      return false;
    state.count++;
    state.bytes += bytes;
    state.burst += bytes;
    let admitted = false;
    const task = state.tail.then(async () => {
      if (this.state !== state) {
        admitted = true; // Canceled call: discard, never forward or close a new call.
        return;
      }
      if (state.failed) return;
      if (
        !state.lease ||
        state.lease.expires <= Date.now() ||
        state.lease.bytes < bytes
      ) {
        state.lease = await this.refill(state);
        state.next = null;
      }
      if (this.state !== state) {
        admitted = true;
        return;
      }
      if (
        !state.lease ||
        !Number.isSafeInteger(state.lease.bytes) ||
        state.lease.bytes < bytes ||
        state.lease.bytes > AUDIO_LEASE_BYTES ||
        !Number.isFinite(state.lease.expires) ||
        state.lease.expires <= Date.now()
      ) {
        state.failed = true;
        return;
      }
      state.lease.bytes -= bytes;
      if (state.lease.bytes <= QUEUE_BYTES) void this.refill(state);
      await send();
      admitted = true;
    });
    state.tail = task.catch(() => {});
    try {
      await task;
      return admitted;
    } finally {
      state.count--;
      state.bytes -= bytes;
    }
  }
}
