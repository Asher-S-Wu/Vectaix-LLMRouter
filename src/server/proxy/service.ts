import "server-only";

import { getConfig } from "@/server/config";
import { authenticateProxyKey } from "@/server/keys/service";

const OPENROUTER_ORIGIN = "https://openrouter.ai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Authorization",
    "X-Api-Key",
    "Content-Type",
    "Content-Encoding",
    "Accept",
    "Range",
    "If-None-Match",
    "If-Range",
    "If-Modified-Since",
    "Idempotency-Key",
    "Anthropic-Version",
    "Anthropic-Beta",
    "OpenAI-Beta",
    "X-OpenRouter-Title",
    "X-Stainless-Arch",
    "X-Stainless-Async",
    "X-Stainless-Helper-Method",
    "X-Stainless-Lang",
    "X-Stainless-Os",
    "X-Stainless-Package-Version",
    "X-Stainless-Retry-Count",
    "X-Stainless-Runtime",
    "X-Stainless-Runtime-Version",
    "X-Stainless-Timeout",
  ].join(", "),
  "Access-Control-Expose-Headers":
    "X-Request-Id, X-Generation-Id, Retry-After, Content-Range",
  "Access-Control-Max-Age": "86400",
} as const;

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-encoding",
  "range",
  "if-none-match",
  "if-range",
  "if-modified-since",
  "idempotency-key",
  "anthropic-version",
  "anthropic-beta",
  "openai-beta",
  "x-openrouter-title",
  "x-stainless-arch",
  "x-stainless-async",
  "x-stainless-helper-method",
  "x-stainless-lang",
  "x-stainless-os",
  "x-stainless-package-version",
  "x-stainless-retry-count",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-timeout",
] as const;

const BLOCKED_RESPONSE_HEADERS = new Set([
  "clear-site-data",
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "set-cookie",
  "set-cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

function corsHeaders(base?: HeadersInit) {
  const headers = new Headers(base);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return headers;
}

export function proxyOptionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function proxyError(status: number, message: string) {
  return Response.json(
    { error: { code: status, message } },
    {
      status,
      headers: corsHeaders({ "Cache-Control": "no-store" }),
    },
  );
}

function extractProxyToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const xApiKey = request.headers.get("x-api-key")?.trim() || null;
  let bearer: string | null = null;

  if (authorization) {
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return null;
    bearer = match[1];
  }

  if ((bearer && xApiKey) || (!bearer && !xApiKey)) return null;
  return bearer ?? xApiKey;
}

function buildUpstreamUrl(request: Request, path: string[]) {
  if (
    !path.length ||
    path.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.includes("/") ||
        part.includes("\\") ||
        part.includes("\0"),
    )
  ) {
    return null;
  }

  const incoming = new URL(request.url);
  const encodedPath = path.map((part) => encodeURIComponent(part)).join("/");
  const upstream = new URL(`/api/v1/${encodedPath}`, OPENROUTER_ORIGIN);
  upstream.search = incoming.search;
  return upstream;
}

function buildUpstreamHeaders(request: Request, apiKey: string) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Accept-Encoding", "identity");
  return headers;
}

function buildResponseHeaders(upstream: Response) {
  const headers = new Headers();
  const connectionHeaders = new Set(
    (upstream.headers.get("connection") ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

  upstream.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (BLOCKED_RESPONSE_HEADERS.has(lowerName)) return;
    if (connectionHeaders.has(lowerName)) return;
    if (lowerName.startsWith("access-control-")) return;
    headers.append(name, value);
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("text/event-stream")) {
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("X-Accel-Buffering", "no");
  }
  return corsHeaders(headers);
}

function passthroughBody(
  body: ReadableStream<Uint8Array>,
  abortController: AbortController,
  detachAbortListener: () => void,
) {
  const reader = body.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          detachAbortListener();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        detachAbortListener();
        controller.error(error);
      }
    },
    async cancel(reason) {
      detachAbortListener();
      abortController.abort(reason);
      try {
        await reader.cancel(reason);
      } catch {
        // The client is already gone; there is no response left to alter.
      }
    },
  });
}

export async function handleProxyRequest(request: Request, context: RouteContext) {
  const token = extractProxyToken(request);
  if (!token) return proxyError(401, "Invalid or missing proxy API key");

  let authenticated: Awaited<ReturnType<typeof authenticateProxyKey>>;
  try {
    authenticated = await authenticateProxyKey(token);
  } catch {
    return proxyError(503, "Proxy authentication database is unavailable");
  }
  if (!authenticated) return proxyError(401, "Invalid proxy API key");

  const { path } = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, path);
  if (!upstreamUrl) return proxyError(400, "Invalid OpenRouter API path");

  const abortController = new AbortController();
  const abortFromClient = () => abortController.abort(request.signal.reason);
  const detachAbortListener = () =>
    request.signal.removeEventListener("abort", abortFromClient);

  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });

  const config = getConfig();
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: buildUpstreamHeaders(request, config.openRouterApiKey),
    cache: "no-store",
    redirect: "manual",
    signal: abortController.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch {
    detachAbortListener();
    if (request.signal.aborted) {
      return proxyError(499, "Client closed the request");
    }
    return proxyError(502, "Unable to connect to OpenRouter");
  }

  const responseHeaders = buildResponseHeaders(upstream);
  const contentType = upstream.headers.get("content-type") ?? "";
  const isJsonError =
    upstream.status >= 400 &&
    contentType.toLowerCase().includes("application/json");

  if (isJsonError) {
    const payload = (await upstream.json()) as Record<string, unknown>;
    delete payload.user_id;
    detachAbortListener();

    return new Response(JSON.stringify(payload), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  if (!upstream.body) detachAbortListener();

  return new Response(
    upstream.body
      ? passthroughBody(upstream.body, abortController, detachAbortListener)
      : null,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    },
  );
}
