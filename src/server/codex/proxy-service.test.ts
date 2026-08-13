import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateCodexProxyKey: vi.fn(),
  fetchChatGptWithCloudflareCookies: vi.fn(),
  getValidCodexAccessToken: vi.fn(),
  markCodexAccountReconnectRequired: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/codex/account-service", () => ({
  getValidCodexAccessToken: mocks.getValidCodexAccessToken,
  markCodexAccountReconnectRequired: mocks.markCodexAccountReconnectRequired,
}));

vi.mock("@/server/codex/chatgpt-cloudflare-fetch", () => ({
  fetchChatGptWithCloudflareCookies:
    mocks.fetchChatGptWithCloudflareCookies,
}));

vi.mock("@/server/codex/key-service", () => ({
  authenticateCodexProxyKey: mocks.authenticateCodexProxyKey,
}));

vi.mock("@/server/config", () => ({
  getConfig: () => ({ sessionSecret: "test-session-secret" }),
}));

import {
  codexOptionsResponse,
  handleCodexModelsRequest,
  handleCodexResponsesRequest,
} from "@/server/codex/proxy-service";

const completedStream =
  'data: {"type":"response.completed","response":{"id":"resp_test"}}\n\n';

let accountSequence = 0;

function modelFixture(overrides: Record<string, unknown> = {}) {
  return {
    slug: "gpt-test",
    visibility: "list",
    supported_in_api: true,
    supports_parallel_tool_calls: true,
    supports_reasoning_summary_parameter: true,
    use_responses_lite: false,
    service_tiers: [],
    ...overrides,
  };
}

function modelCatalogResponse(
  models: Array<Record<string, unknown>> = [modelFixture()],
): Response {
  return Response.json({
    models,
  });
}

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://relay.example/api/codex/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer proxy-key",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function codexRequest(
  stream: boolean,
  overrides: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Request {
  return jsonRequest(
    {
      model: "gpt-test",
      input: "hello",
      stream,
      store: false,
      ...overrides,
    },
    headers,
  );
}

function modelsRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://relay.example/api/codex/v1/models", {
    headers: {
      Authorization: "Bearer proxy-key",
      ...headers,
    },
  });
}

function completedSseResponse(
  response: Record<string, unknown> = { id: "resp_test" },
  headers: HeadersInit = { "Content-Type": "text/event-stream" },
): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", response })}\n\n`,
    { status: 200, headers },
  );
}

function mockedUpstreamRequest(index = 1): {
  body: Record<string, unknown>;
  headers: Headers;
  init: RequestInit;
  url: URL;
} {
  const [rawUrl, init] = mocks.fetchChatGptWithCloudflareCookies.mock.calls[
    index
  ] as [URL, RequestInit];
  return {
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
    headers: new Headers(init.headers),
    init,
    url: rawUrl,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  accountSequence += 1;
  mocks.authenticateCodexProxyKey.mockResolvedValue(true);
  mocks.getValidCodexAccessToken.mockResolvedValue({
    accessToken: "upstream-access-token",
    accountId: `account-${accountSequence}`,
    refreshVersion: 1,
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleCodexResponsesRequest", () => {
  it("streams a successful upstream response when the SSE content type is missing", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(new TextEncoder().encode(completedStream), {
          status: 200,
          headers: { "x-request-id": "upstream-request-id" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(true));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(await response.text()).toBe(completedStream);
  });

  it("passes tool-call and terminal events through without altering the stream", async () => {
    const toolStream = [
      'data: {"type":"response.output_item.added","item":{"type":"function_call","name":"run_task","call_id":"call_1"}}\n\n',
      'data: {"type":"response.function_call_arguments.delta","delta":"{\\"path\\":\\"/tmp\\"}"}\n\n',
      'data: {"type":"response.output_item.done","item":{"type":"function_call","name":"run_task","call_id":"call_1","arguments":"{\\"path\\":\\"/tmp\\"}"}}\n\n',
      completedStream,
    ].join("");
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(toolStream, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(true));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(toolStream);
  });

  it("supports sequential calls while reusing the short-lived model catalog cache", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(completedSseResponse({ id: "resp_first" }))
      .mockResolvedValueOnce(completedSseResponse({ id: "resp_second" }));

    const first = await handleCodexResponsesRequest(codexRequest(false));
    const second = await handleCodexResponsesRequest(codexRequest(false));

    expect(await first.json()).toEqual({ id: "resp_first" });
    expect(await second.json()).toEqual({ id: "resp_second" });
    expect(mocks.fetchChatGptWithCloudflareCookies).toHaveBeenCalledTimes(3);
    const firstUpstream = mockedUpstreamRequest(1);
    const secondUpstream = mockedUpstreamRequest(2);
    expect(firstUpstream.url.pathname).toBe("/backend-api/codex/responses");
    expect(secondUpstream.url.pathname).toBe("/backend-api/codex/responses");
    expect(firstUpstream.headers.get("session-id")).not.toBe(
      secondUpstream.headers.get("session-id"),
    );
  });

  it("keeps concurrent calls isolated with unique request contexts", async () => {
    let responseSequence = 0;
    mocks.fetchChatGptWithCloudflareCookies.mockImplementation(
      async (url: URL) => {
        if (url.pathname.endsWith("/models")) return modelCatalogResponse();
        responseSequence += 1;
        return completedSseResponse({ id: `resp_concurrent_${responseSequence}` });
      },
    );

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        handleCodexResponsesRequest(codexRequest(false)),
      ),
    );
    const payloads = await Promise.all(responses.map((response) => response.json()));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(payloads.map((payload) => payload.id)).size).toBe(10);
    const responseCalls = mocks.fetchChatGptWithCloudflareCookies.mock.calls
      .filter(([url]) => (url as URL).pathname.endsWith("/responses"));
    const sessionIds = responseCalls.map(([, init]) =>
      new Headers((init as RequestInit).headers).get("session-id"),
    );
    expect(new Set(sessionIds).size).toBe(10);
  });

  it("propagates downstream stream cancellation to the upstream reader", async () => {
    const cancel = vi.fn();
    const upstreamBody = new ReadableStream<Uint8Array>({ cancel });
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(upstreamBody, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(true));
    await response.body!.cancel("client stopped reading");

    expect(cancel).toHaveBeenCalledWith("client stopped reading");
  });

  it("rejects a successful upstream response with an explicit non-SSE content type", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><title>Cloudflare challenge</title>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=UTF-8" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(true));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Invalid response from Codex upstream" },
    });
  });

  it("rejects a successful upstream response without a body", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await handleCodexResponsesRequest(codexRequest(true));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Invalid response from Codex upstream" },
    });
  });

  it("reads a non-streaming response when the SSE content type is missing", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(new TextEncoder().encode(completedStream), {
          status: 200,
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ id: "resp_test" });
  });

  it("assembles completed output items for non-streaming clients", async () => {
    const output = [
      {
        id: "rs_test",
        type: "reasoning",
        summary: [],
        encrypted_content: "encrypted-reasoning",
      },
      {
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "OK",
            annotations: [],
          },
        ],
      },
    ];
    const stream = [
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: output[0] })}\n\n`,
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 1, item: output[1] })}\n\n`,
      `data: ${JSON.stringify({ type: "response.completed", response: { id: "resp_assembled", status: "completed", output: [] } })}\n\n`,
    ].join("");
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "resp_assembled",
      status: "completed",
      output,
    });
  });

  it("rejects a request without a bearer proxy key", async () => {
    const request = new Request(
      "https://relay.example/api/codex/v1/responses",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-test", input: "hello" }),
      },
    );

    const response = await handleCodexResponsesRequest(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 401, message: "Invalid or missing Codex proxy API key" },
    });
    expect(mocks.authenticateCodexProxyKey).not.toHaveBeenCalled();
    expect(mocks.fetchChatGptWithCloudflareCookies).not.toHaveBeenCalled();
  });

  it("rejects x-api-key authentication even when a bearer header is present", async () => {
    const response = await handleCodexResponsesRequest(
      codexRequest(false, {}, { "X-Api-Key": "legacy-key" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 401, message: "Invalid or missing Codex proxy API key" },
    });
    expect(mocks.authenticateCodexProxyKey).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer proxy key", async () => {
    mocks.authenticateCodexProxyKey.mockResolvedValue(false);

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 401, message: "Invalid Codex proxy API key" },
    });
    expect(mocks.fetchChatGptWithCloudflareCookies).not.toHaveBeenCalled();
  });

  it("returns 503 when proxy key authentication storage is unavailable", async () => {
    mocks.authenticateCodexProxyKey.mockRejectedValue(new Error("database down"));

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 503,
        message: "Codex proxy authentication database is unavailable",
      },
    });
  });

  it("rejects malformed JSON before loading the Codex account", async () => {
    const request = new Request(
      "https://relay.example/api/codex/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer proxy-key",
          "Content-Type": "application/json",
        },
        body: "{",
      },
    );

    const response = await handleCodexResponsesRequest(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 400, message: "Request body must be valid JSON" },
    });
    expect(mocks.getValidCodexAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    [
      "stateful conversations",
      { conversation: "conv_123" },
      "Unsupported request field: conversation",
    ],
    ["background mode", { background: true }, "Background responses are not supported"],
    ["stored responses", { store: true }, "Stored responses are not supported"],
    ["empty input", { input: [] }, "Request input must be a non-empty string or array"],
    ["invalid tools", { tools: {} }, "Request tools must be an array"],
    [
      "server object references",
      { input: [{ type: "input_file", file_id: "file_123" }] },
      "Server-side object references are not supported",
    ],
    ["invalid reasoning", { reasoning: "high" }, "Request reasoning must be an object"],
    [
      "non-string client metadata",
      { client_metadata: { source: 123 } },
      "Request client_metadata values must all be strings",
    ],
  ])("rejects unsupported %s", async (_name, overrides, message) => {
    const response = await handleCodexResponsesRequest(
      codexRequest(false, overrides),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 400, message },
    });
    expect(mocks.getValidCodexAccessToken).not.toHaveBeenCalled();
  });

  it("returns 503 when the connected Codex account cannot provide credentials", async () => {
    mocks.getValidCodexAccessToken.mockRejectedValue(new Error("refresh failed"));

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 503,
        message: "Codex account is unavailable or must be reconnected",
      },
    });
  });

  it("normalizes a standard model request and sends required Codex headers", async () => {
    const tool = {
      type: "function",
      name: "lookup_file",
      description: "Look up a caller-owned file identifier",
      parameters: {
        type: "object",
        properties: { file_id: { type: "string" } },
      },
    };
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(
        modelCatalogResponse([
          modelFixture({
            service_tiers: [{ id: "priority" }],
          }),
        ]),
      )
      .mockResolvedValueOnce(completedSseResponse());

    const response = await handleCodexResponsesRequest(
      codexRequest(true, {
        input: "你好",
        instructions: "Use the lookup tool when needed.",
        tools: [tool],
        tool_choice: "auto",
        parallel_tool_calls: true,
        reasoning: { effort: "ultra", summary: "none", context: null },
        include: ["message.output_text.logprobs"],
        service_tier: "priority",
        prompt_cache_key: "caller-cache-key",
        client_metadata: {
          source: "integration-test",
          session_id: "caller-controlled-session",
        },
        unsupported_client_field: "drop-me",
      }),
    );
    await response.text();

    expect(response.status).toBe(200);
    const upstream = mockedUpstreamRequest();
    expect(upstream.url.toString()).toBe(
      "https://chatgpt.com/backend-api/codex/responses",
    );
    expect(upstream.init.method).toBe("POST");
    expect(upstream.headers.get("accept")).toBe("text/event-stream");
    expect(upstream.headers.get("accept-encoding")).toBe("identity");
    expect(upstream.headers.get("authorization")).toBe(
      "Bearer upstream-access-token",
    );
    expect(upstream.headers.get("chatgpt-account-id")).toBe(
      `account-${accountSequence}`,
    );
    expect(upstream.headers.get("originator")).toBe("vectaix_llmrouter");
    expect(upstream.headers.get("version")).toBe("0.147.0");
    expect(upstream.headers.get("x-openai-internal-codex-responses-lite"))
      .toBeNull();
    expect(upstream.headers.get("session-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(upstream.headers.get("thread-id")).toBe(
      upstream.headers.get("session-id"),
    );
    expect(upstream.body).toMatchObject({
      model: "gpt-test",
      instructions: "Use the lookup tool when needed.",
      tools: [tool],
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: "max" },
      stream: true,
      store: false,
      include: [
        "message.output_text.logprobs",
        "reasoning.encrypted_content",
      ],
      service_tier: "priority",
      prompt_cache_key: "caller-cache-key",
    });
    expect(upstream.body.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "你好" }],
      },
    ]);
    expect(upstream.body).not.toHaveProperty("unsupported_client_field");
    expect(upstream.body.client_metadata).toMatchObject({
      source: "integration-test",
      session_id: upstream.headers.get("session-id"),
      thread_id: upstream.headers.get("thread-id"),
      "x-codex-window-id": upstream.headers.get("x-codex-window-id"),
    });
  });

  it("uses Responses Lite framing for models that require it", async () => {
    const originalInput = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "run the tool" }],
    };
    const tool = {
      type: "function",
      name: "run_task",
      parameters: { type: "object", properties: {} },
    };
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(
        modelCatalogResponse([
          modelFixture({
            use_responses_lite: true,
            supports_parallel_tool_calls: false,
          }),
        ]),
      )
      .mockResolvedValueOnce(completedSseResponse());

    const response = await handleCodexResponsesRequest(
      codexRequest(true, {
        input: [originalInput],
        instructions: "Follow the task instructions.",
        tools: [tool],
        parallel_tool_calls: true,
        reasoning: { effort: "high" },
      }),
    );
    await response.text();

    expect(response.status).toBe(200);
    const upstream = mockedUpstreamRequest();
    expect(upstream.headers.get("x-openai-internal-codex-responses-lite"))
      .toBe("true");
    expect(upstream.body.instructions).toBe("");
    expect(upstream.body).not.toHaveProperty("tools");
    expect(upstream.body.parallel_tool_calls).toBe(false);
    expect(upstream.body.reasoning).toEqual({
      effort: "high",
      context: "all_turns",
    });
    expect(upstream.body.input).toEqual([
      { type: "additional_tools", role: "developer", tools: [tool] },
      {
        type: "message",
        role: "developer",
        content: [
          { type: "input_text", text: "Follow the task instructions." },
        ],
      },
      originalInput,
    ]);
  });

  it.each([
    [
      "parallel tool calls",
      { supports_parallel_tool_calls: false },
      { parallel_tool_calls: true },
      "Parallel tool calls are not supported by model gpt-test",
    ],
    [
      "reasoning summaries",
      { supports_reasoning_summary_parameter: false },
      { reasoning: { summary: "auto" } },
      "Reasoning summary is not supported by model gpt-test",
    ],
    [
      "service tiers",
      { service_tiers: [] },
      { service_tier: "priority" },
      "Service tier is not supported by model gpt-test",
    ],
  ])(
    "rejects unsupported model capability: %s",
    async (_name, modelOverrides, requestOverrides, message) => {
      mocks.fetchChatGptWithCloudflareCookies.mockResolvedValueOnce(
        modelCatalogResponse([modelFixture(modelOverrides)]),
      );

      const response = await handleCodexResponsesRequest(
        codexRequest(false, requestOverrides),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 400, message },
      });
      expect(mocks.fetchChatGptWithCloudflareCookies).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a model that is not in the current Codex catalog", async () => {
    mocks.fetchChatGptWithCloudflareCookies.mockResolvedValueOnce(
      modelCatalogResponse([modelFixture({ slug: "different-model" })]),
    );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 400, message: "Requested Codex model is not available" },
    });
  });

  it("returns 502 when the responses upstream connection fails", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockRejectedValueOnce(new Error("network failure"));

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Unable to connect to Codex upstream" },
    });
  });

  it("returns 499 when the client aborts before the model catalog request completes", async () => {
    const controller = new AbortController();
    const request = new Request(codexRequest(false), {
      signal: controller.signal,
    });
    controller.abort("client disconnected");
    mocks.fetchChatGptWithCloudflareCookies.mockRejectedValueOnce(
      new Error("aborted"),
    );

    const response = await handleCodexResponsesRequest(request);

    expect(response.status).toBe(499);
    expect(await response.json()).toEqual({
      error: { code: 499, message: "Client closed the request" },
    });
  });

  it("marks the Codex account for reconnection after an upstream 401", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "expired" } },
          { status: 401, headers: { "x-request-id": "request-401" } },
        ),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 503,
        message: "Codex account authorization expired; reconnect is required",
      },
    });
    expect(mocks.markCodexAccountReconnectRequired).toHaveBeenCalledWith(
      "upstream_unauthorized",
      1,
    );
    expect(response.headers.get("x-request-id")).toBe("request-401");
  });

  it("sanitizes JSON upstream errors and preserves safe retry headers", async () => {
    const accountId = `account-${accountSequence}`;
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message:
                `Bearer external-token upstream-access-token ${accountId}`,
              code: "rate_limit",
              accessToken: "secret-access-token",
              accountId: "secret-account-id",
              nested: { email: "user@example.com", safe: "keep-me" },
            },
          },
          {
            status: 429,
            headers: {
              "retry-after": "12",
              "x-oai-request-id": "request-429",
            },
          },
        ),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        message: "Bearer [redacted] [redacted] [redacted]",
        code: "rate_limit",
        nested: { safe: "keep-me" },
      },
    });
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("x-request-id")).toBe("request-429");
  });

  it("replaces a non-JSON upstream failure with a safe proxy error", async () => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response("<html>private infrastructure details</html>", {
          status: 503,
          headers: {
            "Content-Type": "text/html",
            "retry-after": "30",
          },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 503, message: "Codex upstream request failed" },
    });
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it.each(["response.failed", "response.incomplete"])(
    "returns the terminal %s response for non-streaming clients",
    async (type) => {
      const terminalResponse = {
        id: `resp_${type}`,
        status: type.slice("response.".length),
      };
      mocks.fetchChatGptWithCloudflareCookies
        .mockResolvedValueOnce(modelCatalogResponse())
        .mockResolvedValueOnce(
          new Response(
            `data: ${JSON.stringify({ type, response: terminalResponse })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );

      const response = await handleCodexResponsesRequest(codexRequest(false));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(terminalResponse);
    },
  );

  it("parses chunked CRLF SSE using the event field as the terminal type", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: response.com"));
        controller.enqueue(encoder.encode("pleted\r\n: keep-alive\r\n"));
        controller.enqueue(
          encoder.encode('data: {"response":{"id":"resp_chunked"}}\r\n\r\n'),
        );
        controller.close();
      },
    });
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(body, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "resp_chunked" });
  });

  it.each([
    ["malformed JSON", "data: {not-json}\n\n"],
    [
      "an error event",
      'data: {"type":"error","message":"upstream failed"}\n\n',
    ],
    ["a legacy DONE marker", "data: [DONE]\n\n"],
    [
      "a stream without a terminal event",
      'data: {"type":"response.output_text.delta","delta":"hello"}\n\n',
    ],
  ])("rejects non-streaming SSE containing %s", async (_name, stream) => {
    mocks.fetchChatGptWithCloudflareCookies
      .mockResolvedValueOnce(modelCatalogResponse())
      .mockResolvedValueOnce(
        new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    const response = await handleCodexResponsesRequest(codexRequest(false));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Invalid response from Codex upstream" },
    });
  });
});

describe("handleCodexModelsRequest", () => {
  it("returns OpenAI and Codex catalogs for listed API-supported models", async () => {
    mocks.fetchChatGptWithCloudflareCookies.mockResolvedValueOnce(
      modelCatalogResponse([
        modelFixture({
          slug: "gpt-visible",
          display_name: "GPT Visible",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses" },
          ],
        }),
        modelFixture({ slug: "gpt-hidden", visibility: "hide" }),
        modelFixture({ slug: "gpt-unsupported", supported_in_api: false }),
        modelFixture({ slug: "gpt-visible" }),
        modelFixture({ slug: "gpt-second" }),
      ]),
    );

    const response = await handleCodexModelsRequest(modelsRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      object: "list",
      data: [
        {
          id: "gpt-visible",
          object: "model",
          created: 0,
          owned_by: "openai",
        },
        {
          id: "gpt-second",
          object: "model",
          created: 0,
          owned_by: "openai",
        },
      ],
      models: [
        {
          slug: "gpt-visible",
          visibility: "list",
          supported_in_api: true,
          supports_parallel_tool_calls: true,
          supports_reasoning_summary_parameter: true,
          use_responses_lite: false,
          service_tiers: [],
          display_name: "GPT Visible",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses" },
          ],
        },
        {
          slug: "gpt-second",
          visibility: "list",
          supported_in_api: true,
          supports_parallel_tool_calls: true,
          supports_reasoning_summary_parameter: true,
          use_responses_lite: false,
          service_tiers: [],
        },
      ],
    });
    const [url, init] = mocks.fetchChatGptWithCloudflareCookies.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    const headers = new Headers(init.headers);
    expect(url.toString()).toBe(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.147.0",
    );
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe(
      "Bearer upstream-access-token",
    );
    expect(headers.get("content-type")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 502 for an invalid model catalog", async () => {
    mocks.fetchChatGptWithCloudflareCookies.mockResolvedValueOnce(
      Response.json({ models: [modelFixture({ service_tiers: "priority" })] }),
    );

    const response = await handleCodexModelsRequest(modelsRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Invalid response from Codex upstream" },
    });
  });

  it("returns 502 when the model catalog connection fails", async () => {
    mocks.fetchChatGptWithCloudflareCookies.mockRejectedValue(
      new Error("network failure"),
    );

    const response = await handleCodexModelsRequest(modelsRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 502, message: "Unable to connect to Codex upstream" },
    });
  });
});

describe("codexOptionsResponse", () => {
  it("returns the complete CORS preflight contract", () => {
    const response = codexOptionsResponse();

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
    expect(response.headers.get("access-control-max-age")).toBe("86400");
  });
});
