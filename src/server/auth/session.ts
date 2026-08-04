import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import { getConfig } from "@/server/config";

export const ADMIN_SESSION_COOKIE = "__Host-vectaix_admin";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
}

export interface AdminSession {
  issuedAt: string;
  expiresAt: string;
}

export class AdminAuthenticationError extends Error {
  readonly code = "ADMIN_AUTHENTICATION_REQUIRED";

  constructor() {
    super("管理员登录状态无效或已过期");
    this.name = "AdminAuthenticationError";
  }
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getConfig().sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
}

function serialize(payload: SessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parse(token: string): SessionPayload | null {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extra) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      payload.v !== 1 ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.nonce !== "string" ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      payload.iat > Math.floor(Date.now() / 1000) + 60
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createAdminSession(): Promise<AdminSession> {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ADMIN_SESSION_SECONDS,
    nonce: randomUUID(),
  };
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, serialize(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });

  return {
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const payload = parse(token);

  if (!payload) {
    return null;
  }

  return {
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    throw new AdminAuthenticationError();
  }

  return session;
}
