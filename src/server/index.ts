/**
 * Worker entry point — routes incoming requests to the Agents SDK, which
 * handles WebSocket upgrades to the {@link HelperAgent} Durable Object and
 * serves static assets (the built React SPA) for all other paths.
 *
 * ## Rate limiting
 *
 * WebSocket upgrade requests are gated by the `WS_RATE_LIMITER` binding
 * (see `wrangler.jsonc` / `src/shared/config.ts`) before they reach the
 * Durable Object, so a single caller can't spin up unbounded voice
 * sessions. The rate limit key is `cf-connecting-ip` — the docs advise
 * against IP-based keys for precise per-user limits (NATs/proxies share
 * IPs), but for an unauthenticated public demo it's the only actor
 * signal available and is only meant as a coarse abuse backstop, not a
 * fairness guarantee.
 *
 * @module server/index
 */
import { routeAgentRequest } from "agents";
import { HelperAgent } from "./HelperAgent";
import { CallAdmission } from "./CallAdmission";
import { withSecurityHeaders } from "./security-headers";

export { HelperAgent, CallAdmission };

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await handleRequest(request, env), request);
    } catch {
      console.error("Voice request failed");
      return withSecurityHeaders(
        new Response("Internal server error", {
          status: 500,
          headers: { "cache-control": "no-store" },
        }),
        request
      );
    }
  },
} satisfies ExportedHandler<Env>;

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const agentPath = url.pathname.startsWith("/agents/");
  if (url.pathname === "/api/call" || agentPath) {
    if (url.pathname === "/api/call") {
      if (request.method !== "POST")
        return new Response("Method not allowed", { status: 405 });
      if (request.headers.get("origin") !== url.origin)
        return new Response("Forbidden", { status: 403 });
      if (!env.CALL_ADMISSION || !env.WS_RATE_LIMITER || !env.AI)
        return new Response("Voice admission unavailable", { status: 503 });
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const limited = await rateLimit(env, `issue:${ip}`);
      if (limited) return limited;
      const admission = env.CALL_ADMISSION.getByName("global-v1");
      const call = await admission.issue(ip);
      if (!call)
        return new Response("Call allowance exhausted", { status: 429 });
      return Response.json(
        { room: call.room, expires: call.expires },
        {
          headers: {
            "cache-control": "no-store",
            "set-cookie": `voice_call=${call.room}.${call.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
          },
        }
      );
    }
    const match = /^\/agents\/helper-agent\/([0-9a-f-]{36})$/.exec(
      url.pathname
    );
    if (!match) return new Response("Unauthorized call", { status: 403 });
    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    )
      return new Response("WebSocket required", { status: 426 });
    if (request.headers.get("origin") !== url.origin)
      return new Response("Forbidden", { status: 403 });
    if (!env.CALL_ADMISSION || !env.WS_RATE_LIMITER || !env.AI)
      return new Response("Voice admission unavailable", { status: 503 });
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    // Even forged cookies consume the cheap IP gate before storage/RPC work.
    const limited = await rateLimit(env, ip);
    if (limited) return limited;
    const cookie = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)voice_call=([^;]+)/)?.[1];
    const capability = /^([0-9a-f-]{36})\.([0-9a-f-]{72})$/.exec(cookie ?? "");
    if (!capability || capability[1] !== match[1])
      return new Response("Unauthorized call", { status: 403 });
    const admission = env.CALL_ADMISSION.getByName("global-v1");
    if (!(await admission.authorize(capability[1], capability[2])))
      return new Response("Unauthorized call", { status: 403 });
    const response = await routeAgentRequest(request, env);
    return response ?? new Response("Not Found", { status: 404 });
  }
  return env.ASSETS.fetch(request);
}

async function rateLimit(env: Env, key: string): Promise<Response | null> {
  try {
    if ((await env.WS_RATE_LIMITER.limit({ key })).success === true)
      return null;
    return new Response("Call connection limit reached", { status: 429 });
  } catch {
    return new Response("Voice rate limiter unavailable", { status: 503 });
  }
}
