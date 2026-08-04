import "server-only";

import packageMetadata from "../../../package.json";

import { getConfig } from "@/server/config";
import { pingDatabase } from "@/server/db/client";

export interface SettingsStatus {
  checkedAt: string;
  appVersion: string;
  nodeVersion: string;
  uptimeSeconds: number;
  database: {
    status: "online" | "offline";
    latencyMs: number | null;
  };
  openRouter: {
    configured: boolean;
  };
}

export interface OpenRouterCheckResult {
  ok: boolean;
  checkedAt: string;
  status: number | null;
  latencyMs: number | null;
  message: string;
}

export async function getSystemStatus(): Promise<SettingsStatus> {
  const started = performance.now();
  let databaseStatus: "online" | "offline" = "offline";
  let latencyMs: number | null = null;

  try {
    await pingDatabase();
    databaseStatus = "online";
    latencyMs = Math.round(performance.now() - started);
  } catch {
    databaseStatus = "offline";
    latencyMs = null;
  }

  const configured = Boolean(getConfig().openRouterApiKey);

  return {
    checkedAt: new Date().toISOString(),
    appVersion: packageMetadata.version,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    database: { status: databaseStatus, latencyMs },
    openRouter: { configured },
  };
}

export async function checkOpenRouterConnection(): Promise<OpenRouterCheckResult> {
  const started = performance.now();

  try {
    const config = getConfig();
    const response = await fetch(`${config.openRouterBaseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        Accept: "application/json",
        "Accept-Encoding": "identity",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        status: response.status,
        latencyMs,
        message: `OpenRouter 返回 ${response.status}`,
      };
    }

    await response.body?.cancel();
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      status: response.status,
      latencyMs,
      message: "OpenRouter 连接正常",
    };
  } catch {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      status: null,
      latencyMs: null,
      message: "无法连接 OpenRouter",
    };
  }
}
