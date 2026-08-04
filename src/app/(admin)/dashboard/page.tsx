import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { RouteDiagram } from "@/features/dashboard/route-diagram";
import { getProxyKeys, getSettingsStatus } from "@/server/admin/queries";

export const metadata: Metadata = { title: "航线总览" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [keys, status] = await Promise.all([
    getProxyKeys(),
    getSettingsStatus(),
  ]);
  const activeKeys = keys.filter((item) => !item.revokedAt).length;

  return (
    <div className="page-wrap dashboard-page">
      <PageHeading
        description="只负责鉴权替换和实时转发，不观察、不分析、不保存任何代理流量。"
        eyebrow="VECTAIX CLEAN RELAY / SINGAPORE"
        title="Vectaix 私人中继"
        action={<span className="clean-mode-chip"><i />零流量记录</span>}
      />

      <RouteDiagram
        activeKeys={activeKeys}
        openRouterConfigured={status.openRouter.configured}
      />

      <section aria-label="代理隐私保证" className="privacy-grid">
        <article className="privacy-card is-primary">
          <span>01 / NO READ</span>
          <strong>不解析内容</strong>
          <p>请求体和响应体都不会转成 JSON，也不会读取 SSE 事件。</p>
        </article>
        <article className="privacy-card">
          <span>02 / NO LOG</span>
          <strong>不记录流量</strong>
          <p>不保存路径、模型、Token、费用、状态码、耗时或使用时间。</p>
        </article>
        <article className="privacy-card">
          <span>03 / BYTE STREAM</span>
          <strong>实时字节流</strong>
          <p>上游字节到达后立即交给客户端，不重组内容，也不进行重试。</p>
        </article>
      </section>

      <section className="relay-contract surface">
        <div className="contract-copy">
          <span className="panel-kicker">RELAY CONTRACT</span>
          <h2>中间节点只做必要动作</h2>
          <p>
            为了让代理可用且不泄露你的本地信息，网络层仍然必须完成下面四件事；除此之外不碰调用内容。
          </p>
          <div className="contract-actions">
            <Link className="button button-primary" href="/keys">管理设备密钥</Link>
            <Link className="button button-secondary" href="/settings">查看接入地址</Link>
          </div>
        </div>

        <ol className="contract-list">
          <li><span>01</span><div><strong>验证代理密钥</strong><small>阻止陌生人使用你的新加坡服务。</small></div></li>
          <li><span>02</span><div><strong>替换服务端密钥</strong><small>本地代理密钥不会发给 OpenRouter。</small></div></li>
          <li><span>03</span><div><strong>清理身份与连接头</strong><small>不转发本地 IP、Cookie、来源页和本地 User-Agent。</small></div></li>
          <li><span>04</span><div><strong>原样传递正文</strong><small>JSON、Responses API 与 SSE 都走同一条字节通道。</small></div></li>
        </ol>

        <aside className="management-footprint" aria-label="必要管理数据">
          <span className="panel-kicker">MANAGEMENT ONLY</span>
          <strong>{activeKeys} 枚有效设备密钥</strong>
          <p>MongoDB 只保留设备密钥管理信息，以及失败登录限速所需的 IP 摘要。</p>
        </aside>
      </section>
    </div>
  );
}
