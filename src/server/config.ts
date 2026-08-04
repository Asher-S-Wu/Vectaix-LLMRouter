import "server-only";

export interface AppConfig {
  readonly mongoUri: string;
  readonly mongoDatabase: string;
  readonly openRouterApiKey: string;
  readonly openRouterBaseUrl: "https://openrouter.ai/api/v1";
  readonly adminPassword: string;
  readonly sessionSecret: string;
  readonly port: number;
}

let cachedConfig: AppConfig | undefined;

const MONGO_DATABASE = "vectaix";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少必需的环境变量：${name}`);
  }

  return value;
}

function validateMongoUri(uri: string): void {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error("MONGO_URI 必须是有效的 MongoDB 连接地址");
  }

  try {
    new URL(uri);
  } catch {
    throw new Error("MONGO_URI 必须是有效的 MongoDB 连接地址");
  }
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT 必须是 1 到 65535 之间的整数");
  }

  return port;
}

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const mongoUri = required("MONGO_URI");
  const openRouterApiKey = required("OPENROUTER_API_KEY");
  const adminPassword = required("ADMIN_PASSWORD");
  const sessionSecret = required("SESSION_SECRET");
  const port = parsePort(required("PORT"));

  validateMongoUri(mongoUri);

  if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("SESSION_SECRET 至少需要 32 字节");
  }

  cachedConfig = Object.freeze({
    mongoUri,
    mongoDatabase: MONGO_DATABASE,
    openRouterApiKey,
    openRouterBaseUrl: "https://openrouter.ai/api/v1",
    adminPassword,
    sessionSecret,
    port,
  });

  return cachedConfig;
}
