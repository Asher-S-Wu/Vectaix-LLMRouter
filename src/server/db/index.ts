import { MongoClient, type Collection, type Db } from "mongodb";

import { getConfig } from "@/server/config";
import type { LoginAttemptDocument, ProxyKeyDocument } from "@/server/db/types";

declare global {
  var __vectaixMongoClientPromise: Promise<MongoClient> | undefined;
  var __vectaixIndexPromise: Promise<void> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!globalThis.__vectaixMongoClientPromise) {
    const config = getConfig();
    const client = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
      appName: "vectaix-relay",
    });

    globalThis.__vectaixMongoClientPromise = client.connect();
  }

  return globalThis.__vectaixMongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  const [client, config] = await Promise.all([
    getClientPromise(),
    Promise.resolve(getConfig()),
  ]);

  return client.db(config.mongoDatabase);
}

export async function pingDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.command({ ping: 1 });
}

export async function ensureIndexes(): Promise<void> {
  if (!globalThis.__vectaixIndexPromise) {
    globalThis.__vectaixIndexPromise = (async () => {
      const database = await getDatabase();
      const proxyKeys = database.collection<ProxyKeyDocument>("proxy_keys");
      const loginAttempts =
        database.collection<LoginAttemptDocument>("login_attempts");

      const legacyRequestLogs = await database
        .listCollections({ name: "request_logs" }, { nameOnly: true })
        .toArray();
      if (legacyRequestLogs.length > 0) {
        await database.collection("request_logs").drop();
      }
      await database.collection("proxy_keys").updateMany(
        { lastUsedAt: { $exists: true } },
        { $unset: { lastUsedAt: "" } },
      );

      await Promise.all([
        proxyKeys.createIndex(
          { keyHash: 1 },
          { name: "proxy_keys_key_hash_unique", unique: true },
        ),
        proxyKeys.createIndex(
          { createdAt: -1 },
          { name: "proxy_keys_created_at" },
        ),
        loginAttempts.createIndex(
          { expiresAt: 1 },
          { name: "login_attempts_expiry", expireAfterSeconds: 0 },
        ),
      ]);
    })();
  }

  return globalThis.__vectaixIndexPromise;
}

export async function closeDatabase(): Promise<void> {
  const clientPromise = globalThis.__vectaixMongoClientPromise;
  globalThis.__vectaixMongoClientPromise = undefined;
  globalThis.__vectaixIndexPromise = undefined;

  if (clientPromise) {
    const client = await clientPromise.catch(() => null);
    await client?.close();
  }
}

export async function getProxyKeyCollection(): Promise<
  Collection<ProxyKeyDocument>
> {
  return (await getDatabase()).collection<ProxyKeyDocument>("proxy_keys");
}

export async function getLoginAttemptCollection(): Promise<
  Collection<LoginAttemptDocument>
> {
  return (await getDatabase()).collection<LoginAttemptDocument>(
    "login_attempts",
  );
}

export type {
  LoginAttemptDocument,
  ProxyKeyDocument,
} from "@/server/db/types";
