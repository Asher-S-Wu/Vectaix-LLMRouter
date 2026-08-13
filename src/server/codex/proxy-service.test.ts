import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { handleCodexResponsesRequest } from "@/server/codex/proxy-service";

const completedStream =
  'data: {"type":"response.completed","response":{"id":"resp_test"}}\n\n';

let accountSequence = 0;

function modelCatalogResponse(): Response {
  return Response.json({
    models: [
      {
        slug: "gpt-test",
        visibility: "list",
        supported_in_api: true,
        supports_parallel_tool_calls: true,
        supports_reasoning_summary_parameter: true,
        use_responses_lite: false,
        service_tiers: [],
      },
    ],
  });
}

function codexRequest(stream: boolean): Request {
  return new Request("https://relay.example/api/codex/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer proxy-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-test",
      input: "hello",
      stream,
      store: false,
    }),
  });
}

describe("handleCodexResponsesRequest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accountSequence += 1;
    mocks.authenticateCodexProxyKey.mockResolvedValue(true);
    mocks.getValidCodexAccessToken.mockResolvedValue({
      accessToken: "upstream-access-token",
      accountId: `account-${accountSequence}`,
      refreshVersion: 1,
    });
  });

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
});
