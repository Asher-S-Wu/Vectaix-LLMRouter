import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { ShieldIcon } from "@/components/icons";
import { RouteDiagram } from "@/features/dashboard/route-diagram";
import { getDashboardStats, getSettingsStatus } from "@/server/admin/queries";

export const metadata: Metadata = { title: "总览" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, status] = await Promise.all([
    getDashboardStats(),
    getSettingsStatus(),
  ]);

  return (
    <div className="page-wrap dashboard-page">
      <PageHeading
        description="查看服务规模与连接状态。"
        title="总览"
      />

      <section aria-label="服务状态" className="stat-grid">
        <article className="stat-card surface">
          <span>注册用户</span>
          <strong>{stats.userCount} 个</strong>
          <Link className="stat-link" href="/users">管理用户</Link>
        </article>
        <article className="stat-card surface">
          <span>设备密钥</span>
          <strong>{stats.keyCount} 把</strong>
          <p>全部有效密钥</p>
        </article>
        <article className="stat-card surface">
          <span>数据库</span>
          <strong>{status.database.status === "online" ? "正常" : "离线"}</strong>
          <p>{status.database.latencyMs === null ? "暂时无法取得延迟" : `响应 ${status.database.latencyMs} ms`}</p>
        </article>
        <article className="stat-card surface">
          <span>OpenRouter 密钥</span>
          <strong>{status.openRouter.configured ? "已配置" : "未配置"}</strong>
          <p>{status.openRouter.configured ? "连接已就绪" : "需要配置"}</p>
        </article>
      </section>

      <RouteDiagram
        activeKeys={stats.keyCount}
        openRouterConfigured={status.openRouter.configured}
      />

      <section aria-label="隐私与安全" className="privacy-strip surface">
        <span className="privacy-icon"><ShieldIcon /></span>
        <div>
          <h2>隐私与安全</h2>
          <p>不读取对话、不保存使用记录，OpenRouter 密钥仅保存在服务器。</p>
        </div>
      </section>

      <section className="next-step surface">
        <div>
          <h2>常用操作</h2>
          <p>管理用户权限或复制接入地址。</p>
        </div>
        <div className="next-step-actions">
          <Link className="button button-primary" href="/users">管理用户</Link>
          <Link className="button button-secondary" href="/settings">查看接入地址</Link>
        </div>
      </section>
    </div>
  );
}
