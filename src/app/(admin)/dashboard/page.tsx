import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { EyeOffIcon, KeyIcon, ZapIcon } from "@/components/icons";
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
        description="这里是你的中转服务概况：用户数量、密钥数量、连接状态，以及它是怎么工作的。"
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
          <p>包含你和各位用户创建的全部密钥</p>
        </article>
        <article className="stat-card surface">
          <span>数据库</span>
          <strong>{status.database.status === "online" ? "正常" : "离线"}</strong>
          <p>{status.database.latencyMs === null ? "暂时无法取得延迟" : `响应 ${status.database.latencyMs} ms`}</p>
        </article>
        <article className="stat-card surface">
          <span>OpenRouter 密钥</span>
          <strong>{status.openRouter.configured ? "已配置" : "未配置"}</strong>
          <p>{status.openRouter.configured ? "真实密钥只保存在服务器上" : "请在服务器环境变量中配置"}</p>
        </article>
      </section>

      <RouteDiagram
        activeKeys={stats.keyCount}
        openRouterConfigured={status.openRouter.configured}
      />

      <section aria-label="隐私承诺" className="privacy-grid">
        <article className="privacy-card">
          <span className="privacy-icon"><EyeOffIcon /></span>
          <h3>不查看对话</h3>
          <p>请求和回复都只是原样经过，服务器不会读取聊天内容。</p>
        </article>
        <article className="privacy-card">
          <span className="privacy-icon"><ZapIcon /></span>
          <h3>不保存记录</h3>
          <p>不保存路径、模型、用量、耗时等任何使用记录。</p>
        </article>
        <article className="privacy-card">
          <span className="privacy-icon"><KeyIcon /></span>
          <h3>密钥受保护</h3>
          <p>OpenRouter 真实密钥只放在服务器上，不会出现在用户的设备里。</p>
        </article>
      </section>

      <section className="next-step surface">
        <div>
          <h2>接下来做什么？</h2>
          <p>到用户管理页限制某个账户可用的模型，或者查看接入地址告诉用户怎么填。</p>
        </div>
        <div className="next-step-actions">
          <Link className="button button-primary" href="/users">管理用户</Link>
          <Link className="button button-secondary" href="/settings">查看接入地址</Link>
        </div>
      </section>
    </div>
  );
}
