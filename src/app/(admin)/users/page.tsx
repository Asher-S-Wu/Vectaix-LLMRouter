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
        description="管理账户与模型权限，修改后立即生效。"
        title="用户管理"
      />
      <UserManager initialUsers={users} />
    </div>
  );
}
