// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { withSecurityHeaders } from "./security-headers";

it("keeps asset-first and Worker response policies identical without consuming streams", async () => {
  const request = new Request(
    "https://voice-agent-helper.dwarven.workers.dev/"
  );
  const upstream = new Response("streamed", {
    headers: { "set-cookie": "example=1; HttpOnly", etag: '"existing"' },
  });
  const secured = withSecurityHeaders(upstream, request);
  expect(upstream.bodyUsed).toBe(false);
  expect(secured.headers.get("set-cookie")).toBe("example=1; HttpOnly");
  expect(secured.headers.get("etag")).toBe('"existing"');
  for (const line of readFileSync("public/_headers", "utf8").split("\n")) {
    const match = /^ {2}([^:]+): (.+)$/.exec(line);
    if (match) expect(secured.headers.get(match[1])).toBe(match[2]);
  }
  expect(await secured.text()).toBe("streamed");
});

it("does not add HSTS to HTTP or reconstruct attached WebSocket upgrades", () => {
  expect(
    withSecurityHeaders(
      new Response(null),
      new Request("http://localhost/")
    ).headers.has("strict-transport-security")
  ).toBe(false);
  const upgrade = { status: 101 } as Response;
  expect(withSecurityHeaders(upgrade, new Request("https://voice.test/"))).toBe(
    upgrade
  );
});
