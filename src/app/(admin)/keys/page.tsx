import type { Metadata } from "next";

import { KeyManager } from "@/components/key-manager";
import { PageHeading } from "@/components/page-heading";
import {
  createAdminKeyAction,
  removeAdminKeyAction,
  renameAdminKeyAction,
  revealAdminKeyAction,
} from "@/features/admin/actions";
import { requireAdminSession } from "@/server/auth/admin-session";
import { listProxyKeys } from "@/server/keys/service";

export const metadata: Metadata = { title: "我的密钥" };
export const dynamic = "force-dynamic";

export default async function AdminKeysPage() {
  await requireAdminSession();
  const keys = await listProxyKeys(null);

  return (
    <div className="page-wrap keys-page">
      <PageHeading
        description="这是你自己使用的密钥，和用户的密钥互不影响，也不受模型权限限制。"
        title="我的密钥"
      />
      <KeyManager
        createAction={createAdminKeyAction}
        initialKeys={keys}
        removeAction={removeAdminKeyAction}
        renameAction={renameAdminKeyAction}
        revealAction={revealAdminKeyAction}
      />
    </div>
  );
}
