"use server";

import { headers } from "next/headers";

import {
  AdminAuthenticationError,
  clearAdminSession,
  createAdminSession,
  requireAdminSession,
  verifyAdminLogin,
} from "@/server/auth";
import {
  ProxyKeyValidationError,
  createProxyKey,
  renameProxyKey,
  revokeProxyKey,
  type CreatedProxyKey,
  type ProxyKeyItem,
} from "@/server/keys";
import { checkOpenRouterConnection } from "@/server/status/service";

export interface AdminActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

export interface OpenRouterCheckResult {
  status: number;
  latencyMs: number;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function actionError<T = undefined>(error: unknown): AdminActionResult<T> {
  if (error instanceof AdminAuthenticationError) {
    return { ok: false, message: "登录状态已失效，请重新登录" };
  }

  if (error instanceof ProxyKeyValidationError) {
    return { ok: false, message: error.message };
  }

  return { ok: false, message: "操作暂时无法完成，请稍后再试" };
}

async function requestSourceIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .at(0);
  return (
    forwarded ??
    "unknown"
  ).trim();
}

export async function loginAction(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const password = formText(formData, "password");
    const result = await verifyAdminLogin(password, await requestSourceIp());

    if (!result.ok) {
      if (result.blocked) {
        const minutes = Math.max(
          1,
          Math.ceil((result.retryAfterSeconds ?? 60) / 60),
        );
        return {
          ok: false,
          message: `尝试次数过多，请约 ${minutes} 分钟后再试`,
        };
      }

      return { ok: false, message: "管理密码不正确" };
    }

    await createAdminSession();
    return { ok: true, message: "登录成功" };
  } catch {
    return { ok: false, message: "暂时无法登录，请稍后再试" };
  }
}

export async function logoutAction(): Promise<AdminActionResult> {
  await clearAdminSession();
  return { ok: true, message: "已安全退出" };
}

export async function createProxyKeyAction(
  formData: FormData,
): Promise<AdminActionResult<CreatedProxyKey>> {
  try {
    await requireAdminSession();
    const created = await createProxyKey(formText(formData, "name"));
    return {
      ok: true,
      message: "设备密钥已创建，请立即复制保存",
      data: created,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function renameProxyKeyAction(
  formData: FormData,
): Promise<AdminActionResult<ProxyKeyItem>> {
  try {
    await requireAdminSession();
    const updated = await renameProxyKey(
      formText(formData, "id"),
      formText(formData, "name"),
    );

    if (!updated) {
      return { ok: false, message: "没有找到这个设备密钥" };
    }

    return { ok: true, message: "设备名称已更新", data: updated };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeProxyKeyAction(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    await requireAdminSession();
    const revoked = await revokeProxyKey(formText(formData, "id"));

    if (!revoked) {
      return { ok: false, message: "设备密钥不存在或已经撤销" };
    }

    return { ok: true, message: "设备密钥已撤销" };
  } catch (error) {
    return actionError(error);
  }
}

export async function checkOpenRouterAction(): Promise<
  AdminActionResult<OpenRouterCheckResult>
> {
  try {
    await requireAdminSession();
    const result = await checkOpenRouterConnection();
    const data =
      result.status !== null && result.latencyMs !== null
        ? { status: result.status, latencyMs: result.latencyMs }
        : undefined;
    return { ok: result.ok, message: result.message, data };
  } catch (error) {
    if (error instanceof AdminAuthenticationError) {
      return actionError(error);
    }

    return { ok: false, message: "无法连接 OpenRouter" };
  }
}
