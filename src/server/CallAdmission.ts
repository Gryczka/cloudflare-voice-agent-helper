import { DurableObject } from "cloudflare:workers";
import { QUOTA_CONFIG } from "../shared/config";
import { AUDIO_LEASE_BYTES, type AudioLease } from "./audio-allowance";

type Call = {
  digest: string;
  expires: number;
  llm: number;
  audio: number;
  starts: number;
  second: number;
  burst: number;
};
export type CallUnit = "llm" | "audio" | "starts";
const BYTES_PER_SECOND = 32000; // Nova-3: 16 kHz mono PCM16
const DAILY = {
  sessions: 200,
  llm: 10000,
  audio: 72000 * BYTES_PER_SECOND,
  starts: 600,
};

async function digest(token: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fixed global coordinator; arbitrary client names never become agent instances. */
export class CallAdmission extends DurableObject<Env> {
  async issue(ip: string) {
    const room = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const hashed = await digest(token);
    const expires = Date.now() + QUOTA_CONFIG.maxSessionSeconds * 1000;
    const day = new Date().toISOString().slice(0, 10);
    const ipKey = await digest(ip);
    const admitted = await this.ctx.storage.transaction(async (storage) => {
      const count = (await storage.get<number>(`${day}:sessions`)) ?? 0;
      const perIp = (await storage.get<number>(`${day}:ip:${ipKey}`)) ?? 0;
      if (count >= DAILY.sessions || perIp >= 10) return false;
      await storage.put(`${day}:sessions`, count + 1);
      await storage.put(`${day}:ip:${ipKey}`, perIp + 1);
      await storage.put<Call>(`call:${room}`, {
        digest: hashed,
        expires,
        llm: 0,
        audio: 0,
        starts: 0,
        second: 0,
        burst: 0,
      });
      return true;
    });
    if (!admitted) return null;
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(Date.now() + 3600000);
    return { room, token, expires };
  }

  async authorize(room: string, token: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/.test(room) || !/^[0-9a-f-]{72}$/.test(token))
      return false;
    const call = await this.ctx.storage.get<Call>(`call:${room}`);
    if (!call || call.expires <= Date.now()) return false;
    // Hashes have fixed length; no capability characters are compared directly.
    const provided = await digest(token);
    let difference = 0;
    for (let i = 0; i < provided.length; i++)
      difference |= provided.charCodeAt(i) ^ call.digest.charCodeAt(i);
    return difference === 0;
  }

  async deadline(room: string): Promise<number> {
    return (await this.ctx.storage.get<Call>(`call:${room}`))?.expires ?? 0;
  }

  async reserveAudio(room: string): Promise<AudioLease | null> {
    return this.ctx.storage.transaction(async (storage) => {
      const now = Date.now();
      const call = await storage.get<Call>(`call:${room}`);
      if (!call || call.expires <= now) return null;
      const day = new Date(now).toISOString().slice(0, 10);
      const key = `${day}:audio`;
      const global = (await storage.get<number>(key)) ?? 0;
      const bytes =
        Math.floor(
          Math.min(
            AUDIO_LEASE_BYTES,
            QUOTA_CONFIG.maxSessionSeconds * BYTES_PER_SECOND - call.audio,
            DAILY.audio - global
          ) / 2
        ) * 2;
      if (bytes < 2) return null;
      call.audio += bytes;
      await storage.put(`call:${room}`, call);
      await storage.put(key, global + bytes);
      return {
        bytes,
        expires: Math.min(
          call.expires,
          now + 10000,
          Date.parse(`${day}T00:00:00Z`) + 86400000
        ),
      };
    });
  }

  async consume(room: string, kind: CallUnit, amount = 1): Promise<boolean> {
    if (
      !Object.hasOwn(DAILY, kind) ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      (kind !== "audio" && amount !== 1)
    )
      return false;
    return this.ctx.storage.transaction(async (storage) => {
      const call = await storage.get<Call>(`call:${room}`);
      if (!call || call.expires <= Date.now()) return false;
      const limit =
        kind === "llm"
          ? QUOTA_CONFIG.maxLlmCallsPerSession
          : kind === "audio"
            ? QUOTA_CONFIG.maxSessionSeconds * BYTES_PER_SECOND
            : 3;
      const key = `${new Date().toISOString().slice(0, 10)}:${kind}`;
      const global = (await storage.get<number>(key)) ?? 0;
      if (call[kind] + amount > limit || global + amount > DAILY[kind])
        return false;
      if (kind === "audio") {
        const second = Math.floor(Date.now() / 1000);
        if (call.second !== second) {
          call.second = second;
          call.burst = 0;
        }
        if (call.burst + amount > 2 * BYTES_PER_SECOND) return false;
        call.burst += amount;
      }
      call[kind] += amount;
      await storage.put(`call:${room}`, call);
      await storage.put(key, global + amount);
      return true;
    });
  }

  async alarm() {
    const entries = await this.ctx.storage.list<Call | number>();
    const today = new Date().toISOString().slice(0, 10);
    const expired = [...entries]
      .filter(([key, value]) =>
        key.startsWith("call:")
          ? typeof value === "object" && value.expires <= Date.now()
          : !key.startsWith(today)
      )
      .map(([key]) => key);
    for (let i = 0; i < expired.length; i += 128)
      await this.ctx.storage.delete(expired.slice(i, i + 128));
    await this.ctx.storage.setAlarm(Date.now() + 3600000);
  }
}
