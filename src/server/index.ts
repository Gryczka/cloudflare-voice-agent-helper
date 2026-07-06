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

export { HelperAgent };

export default {
  async fetch(request, env) {
    if (request.headers.get("Upgrade") === "websocket") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.WS_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(
          "429 Too Many Connections — this demo limits new voice sessions per IP. Please wait a minute and try again.",
          { status: 429 }
        );
      }
    }

    const response = await routeAgentRequest(request, env);
    if (response) return response;
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
