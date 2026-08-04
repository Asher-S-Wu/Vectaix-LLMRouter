import { getConfig } from "@/server/config";
import { pingDatabase } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    getConfig();
  } catch {
    return Response.json(
      {
        status: "not_ready",
        checks: {
          configuration: { status: "error" },
          database: { status: "not_checked" },
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await pingDatabase();
    return Response.json(
      {
        status: "ready",
        checks: {
          configuration: { status: "ok" },
          database: { status: "ok" },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "not_ready",
        checks: {
          configuration: { status: "ok" },
          database: { status: "error" },
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

