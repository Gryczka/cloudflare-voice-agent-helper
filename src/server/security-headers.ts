/** Keep the production static policy in public/_headers aligned with this. */
export function withSecurityHeaders(response: Response, request: Request) {
  // Reconstructing an upgrade would lose its attached WebSocket.
  if (response.status === 101) return response;
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  headers.set(
    "Content-Security-Policy",
    // The voice SDK loads its AudioWorklet from a blob URL. React uses inline
    // style attributes; scripts remain same-origin, with no inline/eval grant.
    `default-src 'self'; script-src 'self' blob:; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}; worker-src 'self' blob:; media-src 'self' blob:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'`
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
