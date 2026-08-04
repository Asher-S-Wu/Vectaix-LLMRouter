"use server";

import { headers } from "next/headers";

import {
  UserAuthenticationError,
  clearUserSession,
  createUserSession,
  requireUserSession,
} from "@/server/auth";
import {
  ProxyKeyValidationError,
  createProxyKey,
  removeProxyKey,
  renameProxyKey,
  revealProxyKey,
  type CreatedProxyKey,
  type ProxyKeyItem,
} from "@/server/keys";
import {
  UserValidationError,
  findUserById,
  registerUser,
  verifyUserLogin,
  type PortalUser,
} from "@/server/users/service";

export interface PortalActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function actionError<T = undefined>(error: unknown): PortalActionResult<T> {
  if (error instanceof UserAuthenticationError) {
    return { ok: false, message: "登录状态已失效，请重新登录" };
  }

  if (
    error instanceof UserValidationError ||
    error instanceof ProxyKeyValidationError
  ) {
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

async function requirePortalUser(): Promise<PortalUser> {
  const session = await requireUserSession();
  const user = await findUserById(session.userId);

  if (!user) {
    throw new UserAuthenticationError();
  }

  return user;
}

export async function registerAction(
  formData: FormData,
): Promise<PortalActionResult> {
  try {
    const username = formText(formData, "username");
    const password = formText(formData, "password");
    const confirm = formText(formData, "confirm");

    if (password !== confirm) {
      return { ok: false, message: "两次输入的密码不一致" };
    }

    const user = await registerUser(username, password, await requestSourceIp());
    await createUserSession(user.id);
    return { ok: true, message: "账户已创建" };
  } catch (error) {
    return actionError(error);
  }
}

export async function userLoginAction(
  formData: FormData,
): Promise<PortalActionResult> {
  try {
    const result = await verifyUserLogin(
      formText(formData, "username"),
      formText(formData, "password"),
      await requestSourceIp(),
    );

    if (!result.ok || !result.userId) {
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

      return { ok: false, message: "用户名或密码不正确" };
    }

    await createUserSession(result.userId);
    return { ok: true, message: "登录成功" };
  } catch {
    return { ok: false, message: "暂时无法登录，请稍后再试" };
  }
}

export async function userLogoutAction(): Promise<PortalActionResult> {
  await clearUserSession();
  return { ok: true, message: "已安全退出" };
}

export async function createMyKeyAction(
  formData: FormData,
): Promise<PortalActionResult<CreatedProxyKey>> {
  try {
    const user = await requirePortalUser();
    const created = await createProxyKey(user.id, formText(formData, "name"));
    return {
      ok: true,
      message: "设备密钥已创建，请立即复制保存",
      data: created,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function renameMyKeyAction(
  formData: FormData,
): Promise<PortalActionResult<ProxyKeyItem>> {
  try {
    const user = await requirePortalUser();
    const updated = await renameProxyKey(
      user.id,
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

export async function removeMyKeyAction(
  formData: FormData,
): Promise<PortalActionResult> {
  try {
    const user = await requirePortalUser();
    const removed = await removeProxyKey(user.id, formText(formData, "id"));

    if (!removed) {
      return { ok: false, message: "没有找到这个设备密钥" };
    }

    return { ok: true, message: "设备密钥已移除" };
  } catch (error) {
    return actionError(error);
  }
}

export async function revealMyKeyAction(
  formData: FormData,
): Promise<PortalActionResult<{ key: string }>> {
  try {
    const user = await requirePortalUser();
    const result = await revealProxyKey(user.id, formText(formData, "id"));

    if (result.status === "missing") {
      return { ok: false, message: "没有找到这个设备密钥" };
    }

    return { ok: true, message: "密钥已取出", data: { key: result.key } };
  } catch (error) {
    return actionError(error);
  }
}
