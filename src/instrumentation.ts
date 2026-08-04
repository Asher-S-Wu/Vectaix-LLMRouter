declare global {
  var __vectaixShutdownRegistered: boolean | undefined;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ getConfig }, { closeDatabase, ensureIndexes, getDatabase }] =
    await Promise.all([import("@/server/config"), import("@/server/db")]);

  getConfig();
  await getDatabase();
  await ensureIndexes();

  if (!globalThis.__vectaixShutdownRegistered) {
    globalThis.__vectaixShutdownRegistered = true;
    process.once("SIGTERM", async () => {
      await closeDatabase();
    });
  }
}
