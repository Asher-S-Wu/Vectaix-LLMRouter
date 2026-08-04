import "server-only";

import { getConfig } from "@/server/config";

export interface UpstreamModel {
  id: string;
  name: string;
}

export class UpstreamModelsError extends Error {
  readonly code = "UPSTREAM_MODELS_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "UpstreamModelsError";
  }
}

declare global {
  var __vectaixModelCache:
    | { models: UpstreamModel[]; fetchedAt: number }
    | undefined;
}

const CACHE_TTL_MS = 30 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 15_000;

function parseModels(payload: unknown): UpstreamModel[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    throw new UpstreamModelsError("OpenRouter 返回的模型列表格式不正确");
  }

  const models: UpstreamModel[] = [];
  for (const item of data) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !id) continue;

    const name = (item as { name?: unknown } | null)?.name;
    models.push({
      id,
      name: typeof name === "string" && name ? name : id,
    });
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

export async function listUpstreamModels(
  forceRefresh = false,
): Promise<UpstreamModel[]> {
  const cached = globalThis.__vectaixModelCache;
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return cached.models;
  }

  const config = getConfig();

  let response: Response;
  try {
    response = await fetch(`${config.openRouterBaseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        Accept: "application/json",
        "Accept-Encoding": "identity",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamModelsError("无法连接 OpenRouter，模型列表获取失败");
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamModelsError(
      `OpenRouter 返回 ${response.status}，模型列表获取失败`,
    );
  }

  const models = parseModels(await response.json());
  globalThis.__vectaixModelCache = { models, fetchedAt: Date.now() };
  return models;
}
