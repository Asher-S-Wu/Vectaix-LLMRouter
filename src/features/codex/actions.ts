"use server";

import {
  AdminAuthenticationError,
  requireAdminSession,
} from "@/server/auth";
import {
  cancelCodexDeviceAuthorization,
  clearInvalidCodexAccount,
  createCodexProxyKey,
  disconnectCodexAccount,
  getCodexOverview,
  pollCodexDeviceAuthorization,
  removeCodexProxyKey,
  renameCodexProxyKey,
  revealCodexProxyKey,
  startCodexDeviceAuthorization,
  type CodexDeviceAuthorization,
  type CodexOverview,
  type CodexProxyKeyItem,
  type CreatedCodexProxyKey,
} from "@/server/codex";

export interface CodexActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

export type CodexDevicePollView =
  | { status: "pending" }
  | { status: "connected"; overview: CodexOverview };

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function codexActionError<T = undefined>(
  error: unknown,
): CodexActionResult<T> {
  if (error instanceof AdminAuthenticationError) {
    return { ok: false, message: "管理登录已失效，请重新登录" };
  }

  if (
    error instanceof Error &&
    [
      "CodexValidationError",
      "CodexUpstreamError",
      "CodexReconnectRequiredError",
      "CodexProxyKeyValidationError",
    ].includes(error.name)
  ) {
    return { ok: false, message: error.message };
  }

  return { ok: false, message: "操作暂时无法完成，请稍后再试" };
}

export async function refreshCodexOverviewAction(): Promise<
  CodexActionResult<CodexOverview>
> {
  try {
    await requireAdminSession();
    const overview = await getCodexOverview();
    return { ok: true, message: "Codex 状态已更新", data: overview };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function startCodexDeviceAction(): Promise<
  CodexActionResult<CodexDeviceAuthorization>
> {
  try {
    await requireAdminSession();
    const authorization = await startCodexDeviceAuthorization();
    return {
      ok: true,
      message: "连接码已准备好，请在有效期内完成确认",
      data: authorization,
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function pollCodexDeviceAction(
  formData: FormData,
): Promise<CodexActionResult<CodexDevicePollView>> {
  try {
    await requireAdminSession();
    const result = await pollCodexDeviceAuthorization(
      formText(formData, "deviceCode"),
    );

    if (result.status === "pending") {
      return {
        ok: true,
        message: "正在等待你完成确认",
        data: { status: "pending" },
      };
    }

    const overview = await getCodexOverview();
    return {
      ok: true,
      message: "Codex 账户已连接",
      data: { status: "connected", overview },
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function cancelCodexDeviceAction(
  formData: FormData,
): Promise<CodexActionResult> {
  try {
    await requireAdminSession();
    const cancelled = await cancelCodexDeviceAuthorization(
      formText(formData, "deviceCode"),
    );
    return {
      ok: true,
      message: cancelled ? "本次连接已取消" : "这次连接已经结束",
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function disconnectCodexAccountAction(): Promise<CodexActionResult> {
  try {
    await requireAdminSession();
    const disconnected = await disconnectCodexAccount();
    return {
      ok: true,
      message: disconnected ? "Codex 授权已撤销，本站账户凭据已删除" : "当前没有已连接的 Codex 账户",
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function clearInvalidCodexAccountAction(): Promise<CodexActionResult> {
  try {
    await requireAdminSession();
    const cleared = await clearInvalidCodexAccount();
    return {
      ok: true,
      message: cleared ? "失效的账户凭据已永久删除" : "当前没有需要清除的连接信息",
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function createCodexKeyAction(
  formData: FormData,
): Promise<CodexActionResult<CreatedCodexProxyKey>> {
  try {
    await requireAdminSession();
    const created = await createCodexProxyKey(formText(formData, "name"));
    return {
      ok: true,
      message: "Codex 密钥已创建，请妥善保存",
      data: created,
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function renameCodexKeyAction(
  formData: FormData,
): Promise<CodexActionResult<CodexProxyKeyItem>> {
  try {
    await requireAdminSession();
    const updated = await renameCodexProxyKey(
      formText(formData, "id"),
      formText(formData, "name"),
    );

    if (!updated) {
      return { ok: false, message: "没有找到这把 Codex 密钥" };
    }

    return { ok: true, message: "密钥名称已更新", data: updated };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function removeCodexKeyAction(
  formData: FormData,
): Promise<CodexActionResult> {
  try {
    await requireAdminSession();
    const removed = await removeCodexProxyKey(formText(formData, "id"));

    if (!removed) {
      return { ok: false, message: "没有找到这把 Codex 密钥" };
    }

    return { ok: true, message: "Codex 密钥已删除" };
  } catch (error) {
    return codexActionError(error);
  }
}

export async function revealCodexKeyAction(
  formData: FormData,
): Promise<CodexActionResult<{ key: string }>> {
  try {
    await requireAdminSession();
    const result = await revealCodexProxyKey(formText(formData, "id"));

    if (result.status === "missing") {
      return { ok: false, message: "没有找到这把 Codex 密钥" };
    }

    return {
      ok: true,
      message: "完整密钥已显示",
      data: { key: result.key },
    };
  } catch (error) {
    return codexActionError(error);
  }
}

export type {
  CodexDeviceAuthorization,
  CodexOverview,
  CodexProxyKeyItem,
  CreatedCodexProxyKey,
};
