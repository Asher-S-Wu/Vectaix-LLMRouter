import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import { getConfig } from "@/server/config";

export const ADMIN_SESSION_COOKIE = "__Host-vectaix_admin";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
export const USER_SESSION_COOKIE = "__Host-vectaix_user";
export const USER_SESSION_SECONDS = 30 * 24 * 60 * 60;

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
  sub?: string;
}

export interface AdminSession {
  issuedAt: string;
  expiresAt: string;
}

export interface UserSession {
  userId: string;
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

export class UserAuthenticationError extends Error {
  readonly code = "USER_AUTHENTICATION_REQUIRED";

  constructor() {
    super("登录状态无效或已过期");
    this.name = "UserAuthenticationError";
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

async function writeSession(
  cookieName: string,
  seconds: number,
  sub?: string,
): Promise<{ issuedAt: string; expiresAt: string }> {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + seconds,
    nonce: randomUUID(),
    ...(sub ? { sub } : {}),
  };
  const cookieStore = await cookies();

  cookieStore.set(cookieName, serialize(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: seconds,
  });

  return {
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

async function readSession(cookieName: string): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  return parse(token);
}

export async function createAdminSession(): Promise<AdminSession> {
  return writeSession(ADMIN_SESSION_COOKIE, ADMIN_SESSION_SECONDS);
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const payload = await readSession(ADMIN_SESSION_COOKIE);

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

export async function createUserSession(userId: string): Promise<UserSession> {
  const base = await writeSession(USER_SESSION_COOKIE, USER_SESSION_SECONDS, userId);
  return { userId, ...base };
}

export async function clearUserSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(USER_SESSION_COOKIE);
}

export async function getUserSession(): Promise<UserSession | null> {
  const payload = await readSession(USER_SESSION_COOKIE);

  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }

  return {
    userId: payload.sub,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function requireUserSession(): Promise<UserSession> {
  const session = await getUserSession();

  if (!session) {
    throw new UserAuthenticationError();
  }

  return session;
}
