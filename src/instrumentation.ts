export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ getConfig }, { ensureIndexes, getDatabase }] =
    await Promise.all([import("@/server/config"), import("@/server/db")]);

  getConfig();
  await getDatabase();
  await ensureIndexes();
}
