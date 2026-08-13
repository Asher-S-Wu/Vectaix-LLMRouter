import type { Metadata } from "next";
import { headers } from "next/headers";

import { CodexAdmin } from "@/components/codex-admin";
import { PageHeading } from "@/components/page-heading";
import { requireAdminSession } from "@/server/auth/admin-session";
import { getCodexOverview, listCodexProxyKeys } from "@/server/codex";

export const metadata: Metadata = { title: "Codex 反代" };
export const dynamic = "force-dynamic";

export default async function CodexPage() {
  await requireAdminSession();
  const [overview, keys, requestHeaders] = await Promise.all([
    getCodexOverview(),
    listCodexProxyKeys(),
    headers(),
  ]);

  const host = (
    requestHeaders.get("x-forwarded-host")?.split(",")[0] ??
    requestHeaders.get("host")
  )?.trim();
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("无法识别当前域名");
  }

  return (
    <div className="page-wrap codex-page">
      <PageHeading
        action={<span className="codex-private-chip"><i />仅超级管理员</span>}
        description="连接你自己的 Codex 账户，查看套餐额度，并为自己的设备签发独立密钥。"
        title="Codex 反代"
      />
      <CodexAdmin
        baseUrl={`https://${host}/api/codex/v1`}
        initialKeys={keys}
        initialOverview={overview}
      />
    </div>
  );
}
