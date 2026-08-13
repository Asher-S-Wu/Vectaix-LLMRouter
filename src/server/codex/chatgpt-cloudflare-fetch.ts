import "server-only";

const CHATGPT_ORIGIN = "https://chatgpt.com";
const MAX_COOKIE_BYTES = 4_096;
const MAX_COOKIES = 32;
const MAX_DATE_MS = 8_640_000_000_000_000;
const COOKIE_JAR_SYMBOL = Symbol.for(
  "vectaix.codex.chatgpt-cloudflare-cookie-jar",
);

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// RFC 6265 cookie-octet. Keep values opaque: never decode percent escapes.
const COOKIE_VALUE_PATTERN =
  /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1F\x7F]/;

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  hostOnly: boolean;
  expiresAt: number | null;
  creationOrder: number;
}

interface CookieJarState {
  version: 1;
  nextCreationOrder: number;
  cookies: StoredCookie[];
}

type SymbolGlobal = typeof globalThis & { [key: symbol]: unknown };

function isAllowedCookieName(name: string): boolean {
  return (
    name === "__cf_bm" ||
    name === "__cflb" ||
    name === "__cfruid" ||
    name === "__cfseq" ||
    name === "__cfwaitingroom" ||
    name === "_cfuvid" ||
    name === "cf_clearance" ||
    name === "cf_ob_info" ||
    name === "cf_use_ob" ||
    name.startsWith("cf_chl_")
  );
}

function isStoredCookie(value: unknown): value is StoredCookie {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const cookie = value as Partial<StoredCookie>;
  return (
    typeof cookie.name === "string" &&
    typeof cookie.value === "string" &&
    typeof cookie.domain === "string" &&
    typeof cookie.path === "string" &&
    typeof cookie.secure === "boolean" &&
    typeof cookie.hostOnly === "boolean" &&
    (cookie.expiresAt === null ||
      (typeof cookie.expiresAt === "number" &&
        Number.isFinite(cookie.expiresAt))) &&
    typeof cookie.creationOrder === "number" &&
    Number.isSafeInteger(cookie.creationOrder)
  );
}

function isCookieJarState(value: unknown): value is CookieJarState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const state = value as Partial<CookieJarState>;
  return (
    state.version === 1 &&
    typeof state.nextCreationOrder === "number" &&
    Number.isSafeInteger(state.nextCreationOrder) &&
    Array.isArray(state.cookies) &&
    state.cookies.every(isStoredCookie)
  );
}

function getCookieJar(): CookieJarState {
  const processGlobal = globalThis as SymbolGlobal;
  const current = processGlobal[COOKIE_JAR_SYMBOL];
  if (isCookieJarState(current)) return current;

  const state: CookieJarState = {
    version: 1,
    nextCreationOrder: 0,
    cookies: [],
  };
  processGlobal[COOKIE_JAR_SYMBOL] = state;
  return state;
}

function requireChatGptUrl(input: string | URL): URL {
  const url = new URL(input.toString());
  if (
    url.origin !== CHATGPT_ORIGIN ||
    url.username ||
    url.password
  ) {
    throw new TypeError("Codex ChatGPT fetch only permits https://chatgpt.com");
  }
  return url;
}

function defaultCookiePath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const finalSlash = pathname.lastIndexOf("/");
  return finalSlash <= 0 ? "/" : pathname.slice(0, finalSlash);
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function pathMatches(pathname: string, cookiePath: string): boolean {
  if (pathname === cookiePath) return true;
  if (!pathname.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || pathname[cookiePath.length] === "/";
}

function pruneExpiredCookies(state: CookieJarState, now: number): void {
  state.cookies = state.cookies.filter(
    (cookie) => cookie.expiresAt === null || cookie.expiresAt > now,
  );
}

function enforceCookieLimit(state: CookieJarState): void {
  if (state.cookies.length <= MAX_COOKIES) return;
  state.cookies.sort((left, right) => left.creationOrder - right.creationOrder);
  state.cookies.splice(0, state.cookies.length - MAX_COOKIES);
}

function parseMaxAge(value: string, now: number): number | null | undefined {
  if (!/^-?\d+$/.test(value)) return undefined;

  try {
    const seconds = BigInt(value);
    if (seconds <= 0n) return 0;
    const availableMilliseconds = BigInt(MAX_DATE_MS - now);
    const milliseconds = seconds * 1_000n;
    return milliseconds >= availableMilliseconds
      ? MAX_DATE_MS
      : now + Number(milliseconds);
  } catch {
    return undefined;
  }
}

function parseSetCookie(
  raw: string,
  requestUrl: URL,
  now: number,
): Omit<StoredCookie, "creationOrder"> | null {
  if (
    !raw ||
    Buffer.byteLength(raw, "utf8") > MAX_COOKIE_BYTES ||
    CONTROL_CHARACTER_PATTERN.test(raw)
  ) {
    return null;
  }

  const segments = raw.split(";");
  const nameValue = segments.shift();
  if (!nameValue) return null;
  const separator = nameValue.indexOf("=");
  if (separator <= 0) return null;

  const name = nameValue.slice(0, separator).trim();
  const value = nameValue.slice(separator + 1).trim();
  if (
    !isAllowedCookieName(name) ||
    !COOKIE_NAME_PATTERN.test(name) ||
    !COOKIE_VALUE_PATTERN.test(value) ||
    Buffer.byteLength(`${name}=${value}`, "utf8") > MAX_COOKIE_BYTES
  ) {
    return null;
  }

  let domain = requestUrl.hostname;
  let hostOnly = true;
  let path = defaultCookiePath(requestUrl.pathname);
  let secure = false;
  let expiresAt: number | null = null;
  let maxAge: number | null | undefined;

  for (const segment of segments) {
    const attribute = segment.trim();
    if (!attribute) continue;
    const attributeSeparator = attribute.indexOf("=");
    const attributeName = (
      attributeSeparator === -1
        ? attribute
        : attribute.slice(0, attributeSeparator)
    ).trim().toLowerCase();
    const attributeValue = attributeSeparator === -1
      ? ""
      : attribute.slice(attributeSeparator + 1).trim();

    if (attributeName === "domain") {
      const candidate = attributeValue.replace(/^\./, "").toLowerCase();
      if (
        candidate !== requestUrl.hostname ||
        !domainMatches(requestUrl.hostname, candidate)
      ) {
        return null;
      }
      domain = candidate;
      hostOnly = false;
    } else if (attributeName === "path") {
      if (attributeValue.startsWith("/")) path = attributeValue;
    } else if (attributeName === "secure") {
      secure = true;
    } else if (attributeName === "max-age") {
      maxAge = parseMaxAge(attributeValue, now);
    } else if (attributeName === "expires") {
      const parsed = Date.parse(attributeValue);
      if (Number.isFinite(parsed)) expiresAt = parsed;
    }
  }

  if (maxAge !== undefined) expiresAt = maxAge;

  return {
    name,
    value,
    domain,
    path,
    secure,
    hostOnly,
    expiresAt,
  };
}

function absorbSetCookieHeaders(response: Response, requestUrl: URL): void {
  const rawCookies = response.headers.getSetCookie();
  if (rawCookies.length === 0) return;

  const state = getCookieJar();
  const now = Date.now();
  pruneExpiredCookies(state, now);

  for (const rawCookie of rawCookies) {
    const parsed = parseSetCookie(rawCookie, requestUrl, now);
    if (!parsed) continue;

    const existingIndex = state.cookies.findIndex(
      (cookie) =>
        cookie.name === parsed.name &&
        cookie.domain === parsed.domain &&
        cookie.path === parsed.path,
    );
    if (parsed.expiresAt !== null && parsed.expiresAt <= now) {
      if (existingIndex !== -1) state.cookies.splice(existingIndex, 1);
      continue;
    }

    if (existingIndex !== -1) {
      const creationOrder = state.cookies[existingIndex].creationOrder;
      state.cookies[existingIndex] = { ...parsed, creationOrder };
    } else {
      state.nextCreationOrder += 1;
      state.cookies.push({
        ...parsed,
        creationOrder: state.nextCreationOrder,
      });
    }
  }

  enforceCookieLimit(state);
}

function cookieHeaderFor(requestUrl: URL): string | null {
  const state = getCookieJar();
  const now = Date.now();
  pruneExpiredCookies(state, now);
  enforceCookieLimit(state);

  const cookies = state.cookies
    .filter(
      (cookie) =>
        isAllowedCookieName(cookie.name) &&
        COOKIE_NAME_PATTERN.test(cookie.name) &&
        COOKIE_VALUE_PATTERN.test(cookie.value) &&
        Buffer.byteLength(`${cookie.name}=${cookie.value}`, "utf8") <=
          MAX_COOKIE_BYTES &&
        (!cookie.secure || requestUrl.protocol === "https:") &&
        (cookie.hostOnly
          ? requestUrl.hostname === cookie.domain
          : domainMatches(requestUrl.hostname, cookie.domain)) &&
        pathMatches(requestUrl.pathname, cookie.path),
    )
    .sort(
      (left, right) =>
        right.path.length - left.path.length ||
        left.creationOrder - right.creationOrder,
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  return cookies.length === 0 ? null : cookies.join("; ");
}

export async function fetchChatGptWithCloudflareCookies(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url = requireChatGptUrl(input);
  const headers = new Headers(init.headers);

  // Never accept a Cookie header from a caller. Only the strict infrastructure
  // allowlist stored by this process may be sent to ChatGPT.
  headers.delete("cookie");
  const cookieHeader = cookieHeaderFor(url);
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
  });
  absorbSetCookieHeaders(response, url);
  return response;
}
