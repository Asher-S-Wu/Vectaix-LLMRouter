import "server-only";

import {
  getValidCodexAccessToken,
  markCodexAccountReconnectRequired,
} from "@/server/codex/account-service";
import { authenticateCodexProxyKey } from "@/server/codex/key-service";

const CODEX_ORIGIN = "https://chatgpt.com";
const CODEX_BASE_PATH = "/backend-api/codex";
const CODEX_CLIENT_VERSION = "0.147.0";
const CODEX_ORIGINATOR = "vectaix_llmrouter";
const CODEX_USER_AGENT = "Vectaix-LLMRouter/1.0.0";

const RESPONSE_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning",
  "stream",
  "store",
  "stream_options",
  "include",
  "service_tier",
  "prompt_cache_key",
  "text",
  "client_metadata",
]);

const STATEFUL_RESPONSE_FIELDS = new Set([
  "conversation",
  "previous_response_id",
  "prompt",
]);

const SERVER_REFERENCE_FIELDS = new Set([
  "file_id",
  "vector_store_ids",
  "container_id",
  "conversation_id",
  "prompt_id",
  "response_id",
]);

const SENSITIVE_ERROR_FIELDS = new Set([
  "accesstoken",
  "accountid",
  "authorization",
  "cookie",
  "email",
  "organizationid",
  "refreshtoken",
  "token",
  "userid",
]);

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

interface CodexCredentials {
  accessToken: string;
  accountId: string;
  refreshVersion: number;
}

interface TerminalResponse {
  response: Record<string, unknown>;
  type: "response.completed" | "response.failed" | "response.incomplete";
}

class InvalidUpstreamResponseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function corsHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

function proxyError(
  status: number,
  message: string,
  upstream?: Response,
): Response {
  const headers = corsHeaders({ "Cache-Control": "no-store" });
  if (upstream) copySafeUpstreamHeaders(upstream, headers);

  return Response.json(
    { error: { code: status, message } },
    {
      status,
      headers,
    },
  );
}

function extractBearerToken(request: Request): string | null {
  if (request.headers.has("x-api-key")) return null;

  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function authenticateRequest(request: Request): Promise<Response | true> {
  const token = extractBearerToken(request);
  if (!token) {
    return proxyError(401, "Invalid or missing Codex proxy API key");
  }

  try {
    if (!(await authenticateCodexProxyKey(token))) {
      return proxyError(401, "Invalid Codex proxy API key");
    }
  } catch {
    return proxyError(503, "Codex proxy authentication database is unavailable");
  }

  return true;
}

async function loadCredentials(): Promise<CodexCredentials | Response> {
  let credentials: CodexCredentials;
  try {
    credentials = await getValidCodexAccessToken();
  } catch {
    return proxyError(503, "Codex account is unavailable or must be reconnected");
  }

  if (!credentials.accessToken.trim() || !credentials.accountId.trim()) {
    return proxyError(503, "Codex account is unavailable or must be reconnected");
  }

  return credentials;
}

function upstreamHeaders(
  credentials: CodexCredentials,
  accept: "application/json" | "text/event-stream",
): Headers {
  const headers = new Headers({
    Accept: accept,
    Authorization: `Bearer ${credentials.accessToken}`,
    "ChatGPT-Account-ID": credentials.accountId,
    originator: CODEX_ORIGINATOR,
    version: CODEX_CLIENT_VERSION,
    "User-Agent": CODEX_USER_AGENT,
  });
  if (accept === "text/event-stream") {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function copySafeUpstreamHeaders(upstream: Response, headers: Headers): void {
  for (const name of ["x-request-id", "retry-after"] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
}

async function markReconnectRequired(
  refreshVersion: number,
): Promise<Response | null> {
  try {
    await markCodexAccountReconnectRequired(
      "upstream_unauthorized",
      refreshVersion,
    );
    return null;
  } catch {
    return proxyError(503, "Codex account state could not be updated");
  }
}

function redactErrorString(value: string, secrets: readonly string[]): string {
  let redacted = value.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function sanitizeErrorPayload(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redactErrorString(value, secrets);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorPayload(item, secrets));
  }
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [name, child] of Object.entries(value)) {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      SENSITIVE_ERROR_FIELDS.has(normalizedName) ||
      normalizedName.endsWith("accesstoken") ||
      normalizedName.endsWith("refreshtoken")
    ) {
      continue;
    }
    sanitized[name] = sanitizeErrorPayload(child, secrets);
  }
  return sanitized;
}

async function sanitizedUpstreamError(
  upstream: Response,
  credentials: CodexCredentials,
): Promise<Response> {
  if (upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    const markError = await markReconnectRequired(credentials.refreshVersion);
    if (markError) return markError;
    return proxyError(
      503,
      "Codex account authorization expired; reconnect is required",
      upstream,
    );
  }

  const status = upstream.status >= 400 && upstream.status <= 599
    ? upstream.status
    : 502;
  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    await upstream.body?.cancel().catch(() => undefined);
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  const sanitized = sanitizeErrorPayload(payload, [
    credentials.accessToken,
    credentials.accountId,
  ]);
  if (!isRecord(sanitized)) {
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  const headers = corsHeaders({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  copySafeUpstreamHeaders(upstream, headers);
  return new Response(JSON.stringify(sanitized), { status, headers });
}

function containsServerObjectReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsServerObjectReference);
  }
  if (!isRecord(value)) return false;

  if (value.type === "item_reference") return true;

  for (const [name, child] of Object.entries(value)) {
    if (SERVER_REFERENCE_FIELDS.has(name)) return true;
    if (name === "container" && typeof child === "string" && child !== "auto") {
      return true;
    }
    if (containsServerObjectReference(child)) return true;
  }
  return false;
}

function containsToolServerObjectReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsToolServerObjectReference(item));
  }
  if (!isRecord(value)) return false;

  const functionTool = value.type === "function";

  for (const [name, child] of Object.entries(value)) {
    // Function parameters are caller-owned JSON Schema. Names such as "file_id"
    // in that schema are ordinary argument names, not hosted object references.
    if (functionTool && name === "parameters") continue;
    if (SERVER_REFERENCE_FIELDS.has(name)) return true;
    if (name === "container" && typeof child === "string" && child !== "auto") {
      return true;
    }
    if (containsToolServerObjectReference(child)) return true;
  }
  return false;
}

function normalizeRequestBody(
  value: unknown,
): { body: Record<string, unknown>; downstreamStream: boolean } | Response {
  if (!isRecord(value)) {
    return proxyError(400, "Request body must be a JSON object");
  }

  for (const field of [...STATEFUL_RESPONSE_FIELDS, ...SERVER_REFERENCE_FIELDS]) {
    if (field in value) {
      return proxyError(400, `Unsupported request field: ${field}`);
    }
  }

  if (
    "container" in value &&
    typeof value.container === "string" &&
    value.container !== "auto"
  ) {
    return proxyError(400, "Server-side object references are not supported");
  }

  if (value.background === true) {
    return proxyError(400, "Background responses are not supported");
  }

  const supportedFields = Object.fromEntries(
    Object.entries(value).filter(([field]) => RESPONSE_FIELDS.has(field)),
  );

  if (typeof value.model !== "string" || !value.model.trim()) {
    return proxyError(400, "Request body must include a model");
  }

  if (!("input" in value)) {
    return proxyError(400, "Request body must include input");
  }

  let input: unknown;
  if (typeof value.input === "string") {
    if (!value.input) {
      return proxyError(400, "Request input must not be empty");
    }
    input = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: value.input }],
      },
    ];
  } else if (Array.isArray(value.input) && value.input.length > 0) {
    input = value.input;
  } else {
    return proxyError(400, "Request input must be a non-empty string or array");
  }

  if (
    "instructions" in value &&
    typeof value.instructions !== "string"
  ) {
    return proxyError(400, "Request instructions must be a string");
  }

  if ("stream" in value && typeof value.stream !== "boolean") {
    return proxyError(400, "Request stream must be a boolean");
  }

  if ("store" in value && value.store !== false) {
    return proxyError(400, "Stored responses are not supported");
  }

  if (
    containsServerObjectReference(input) ||
    containsToolServerObjectReference(value.tools)
  ) {
    return proxyError(400, "Server-side object references are not supported");
  }

  const downstreamStream = value.stream === true;
  return {
    downstreamStream,
    body: {
      ...supportedFields,
      input,
      instructions: value.instructions ?? "",
      stream: true,
      store: false,
    },
  };
}

function attachClientAbort(request: Request): {
  controller: AbortController;
  detach: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason);
  const detach = () => request.signal.removeEventListener("abort", abort);

  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });

  return { controller, detach };
}

function passthroughBody(
  body: ReadableStream<Uint8Array>,
  abortController: AbortController,
  detachAbortListener: () => void,
): ReadableStream<Uint8Array> {
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
        abortController.abort(error);
        await reader.cancel(error).catch(() => undefined);
        controller.error(error);
      }
    },
    async cancel(reason) {
      detachAbortListener();
      abortController.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

function parseSseEvent(eventName: string, dataLines: string[]): TerminalResponse | null {
  if (dataLines.length === 0) return null;

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    throw new InvalidUpstreamResponseError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new InvalidUpstreamResponseError();
  }
  if (!isRecord(payload)) throw new InvalidUpstreamResponseError();

  const type = typeof payload.type === "string" ? payload.type : eventName;
  if (type === "error") throw new InvalidUpstreamResponseError();
  if (
    type !== "response.completed" &&
    type !== "response.failed" &&
    type !== "response.incomplete"
  ) {
    return null;
  }

  if (!isRecord(payload.response)) {
    throw new InvalidUpstreamResponseError();
  }
  return { type, response: payload.response };
}

async function readTerminalResponse(
  body: ReadableStream<Uint8Array>,
): Promise<TerminalResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  const dispatch = (): TerminalResponse | null => {
    const terminal = parseSseEvent(eventName, dataLines);
    eventName = "";
    dataLines = [];
    return terminal;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);

        if (!line) {
          const terminal = dispatch();
          if (terminal) {
            await reader.cancel().catch(() => undefined);
            return terminal;
          }
        } else if (!line.startsWith(":")) {
          const separator = line.indexOf(":");
          const field = separator === -1 ? line : line.slice(0, separator);
          let fieldValue = separator === -1 ? "" : line.slice(separator + 1);
          if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1);

          if (field === "event") eventName = fieldValue;
          else if (field === "data") dataLines.push(fieldValue);
        }

        newline = buffer.indexOf("\n");
      }

      if (done) {
        if (buffer) {
          let line = buffer;
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).replace(/^ /, "");
          }
        }

        const terminal = dispatch();
        if (terminal) return terminal;
        throw new InvalidUpstreamResponseError();
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

function streamingResponse(
  upstream: Response,
  abortController: AbortController,
  detachAbortListener: () => void,
): Response {
  const headers = corsHeaders({
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  });
  copySafeUpstreamHeaders(upstream, headers);

  return new Response(
    passthroughBody(upstream.body!, abortController, detachAbortListener),
    { status: upstream.status, headers },
  );
}

export function codexOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function handleCodexResponsesRequest(request: Request): Promise<Response> {
  const authentication = await authenticateRequest(request);
  if (authentication instanceof Response) return authentication;

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return proxyError(400, "Request body must be valid JSON");
  }

  const normalized = normalizeRequestBody(value);
  if (normalized instanceof Response) return normalized;

  const credentials = await loadCredentials();
  if (credentials instanceof Response) return credentials;

  const { controller, detach } = attachClientAbort(request);
  let upstream: Response;
  try {
    upstream = await fetch(new URL(`${CODEX_BASE_PATH}/responses`, CODEX_ORIGIN), {
      method: "POST",
      headers: upstreamHeaders(credentials, "text/event-stream"),
      body: JSON.stringify(normalized.body),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    detach();
    if (request.signal.aborted) {
      return proxyError(499, "Client closed the request");
    }
    return proxyError(502, "Unable to connect to Codex upstream");
  }

  if (!upstream.ok) {
    try {
      return await sanitizedUpstreamError(upstream, credentials);
    } finally {
      detach();
    }
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!upstream.body || !contentType.includes("text/event-stream")) {
    detach();
    await upstream.body?.cancel().catch(() => undefined);
    return proxyError(502, "Invalid response from Codex upstream");
  }

  if (normalized.downstreamStream) {
    return streamingResponse(upstream, controller, detach);
  }

  try {
    const terminal = await readTerminalResponse(upstream.body);
    detach();
    const headers = corsHeaders({
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });
    copySafeUpstreamHeaders(upstream, headers);
    return new Response(JSON.stringify(terminal.response), { status: 200, headers });
  } catch {
    detach();
    if (request.signal.aborted) {
      return proxyError(499, "Client closed the request");
    }
    return proxyError(502, "Invalid response from Codex upstream");
  }
}

export async function handleCodexModelsRequest(request: Request): Promise<Response> {
  const authentication = await authenticateRequest(request);
  if (authentication instanceof Response) return authentication;

  const credentials = await loadCredentials();
  if (credentials instanceof Response) return credentials;

  const { controller, detach } = attachClientAbort(request);
  let upstream: Response;
  try {
    const url = new URL(`${CODEX_BASE_PATH}/models`, CODEX_ORIGIN);
    url.searchParams.set("client_version", CODEX_CLIENT_VERSION);
    upstream = await fetch(url, {
      method: "GET",
      headers: upstreamHeaders(credentials, "application/json"),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    detach();
    if (request.signal.aborted) {
      return proxyError(499, "Client closed the request");
    }
    return proxyError(502, "Unable to connect to Codex upstream");
  }

  if (!upstream.ok) {
    try {
      return await sanitizedUpstreamError(upstream, credentials);
    } finally {
      detach();
    }
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    detach();
    if (request.signal.aborted) {
      return proxyError(499, "Client closed the request");
    }
    return proxyError(502, "Invalid response from Codex upstream");
  }
  detach();
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return proxyError(502, "Invalid response from Codex upstream");
  }

  const seen = new Set<string>();
  const data = payload.models.flatMap((model) => {
    if (
      !isRecord(model) ||
      typeof model.slug !== "string" ||
      !model.slug ||
      model.visibility !== "list" ||
      model.supported_in_api !== true ||
      seen.has(model.slug)
    ) {
      return [];
    }

    seen.add(model.slug);
    return [{ id: model.slug, object: "model", created: 0, owned_by: "openai" }];
  });

  const headers = corsHeaders({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  copySafeUpstreamHeaders(upstream, headers);
  return new Response(JSON.stringify({ object: "list", data }), {
    status: 200,
    headers,
  });
}
