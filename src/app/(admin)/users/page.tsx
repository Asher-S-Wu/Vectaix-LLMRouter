import type { Metadata } from "next";

import { PageHeading } from "@/components/page-heading";
import { UserManager } from "@/components/user-manager";
import { getUsers } from "@/server/admin/queries";

export const metadata: Metadata = { title: "用户管理" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getUsers();
  return (
    <div className="page-wrap users-page">
      <PageHeading
        description="查看所有注册账户，按用户限制可用模型，或移除不再使用的账户。模型权限对该用户的所有密钥立即生效。"
        title="用户管理"
      />
      <UserManager initialUsers={users} />
    </div>
  );
}
