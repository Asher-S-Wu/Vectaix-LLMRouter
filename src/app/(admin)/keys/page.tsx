import type { Metadata } from "next";

import { KeyManager } from "@/components/key-manager";
import { PageHeading } from "@/components/page-heading";
import { getProxyKeys } from "@/server/admin/queries";

export const metadata: Metadata = { title: "设备密钥" };
export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const keys = await getProxyKeys();
  return (
    <div className="page-wrap keys-page">
      <PageHeading
        description="给每台设备发一把独立的密钥，不用了随时可以移除。OpenRouter 的真实密钥不会出现在这里。"
        title="设备密钥"
      />
      <KeyManager initialKeys={keys} />
    </div>
  );
}
