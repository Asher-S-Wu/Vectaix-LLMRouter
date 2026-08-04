import type { Metadata } from "next";
import { headers } from "next/headers";

import { CopyButton } from "@/components/copy-button";
import { LogoutButton } from "@/components/logout-button";
import { PageHeading } from "@/components/page-heading";
import { SettingsCheck } from "@/components/settings-check";
import { getSettingsStatus } from "@/server/admin/queries";

export const metadata: Metadata = { title: "接入设置" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export default async function SettingsPage() {
  const [status, requestHeaders] = await Promise.all([getSettingsStatus(), headers()]);
  const host = requestHeaders.get("host")?.trim();
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("无法识别当前 Zeabur HTTPS 域名");
  }
  const proxyBaseUrl = `https://${host}/api/v1`;
  const environmentExample = `OPENAI_BASE_URL=${proxyBaseUrl}\nOPENAI_API_KEY=你创建的设备代理密钥`;

  return (
    <div className="page-wrap settings-page">
      <PageHeading
        description="把下面的代理地址和设备密钥填入本地客户端，请求会从新加坡节点发往 OpenRouter。"
        eyebrow="VECTAIX ROUTE CONFIGURATION / SIN"
        title="接入设置"
        action={<span className="updated-at"><i />检查于 {formatDate(status.checkedAt)}</span>}
      />

      <section className="proxy-address surface">
        <div className="address-index">01</div>
        <div className="address-copy">
          <span className="panel-kicker">OPENAI-COMPATIBLE BASE URL</span>
          <h2>代理地址</h2>
          <p>所有兼容 OpenAI 接口的客户端都使用这个地址，不要再额外添加 <code>/v1</code>。</p>
        </div>
        <div className="address-value">
          <code>{proxyBaseUrl}</code>
          <CopyButton label="复制代理地址" value={proxyBaseUrl} />
        </div>
      </section>

      <div className="settings-grid">
        <section className="surface connect-guide">
          <div className="panel-head"><div><span className="panel-kicker">CLIENT SETUP</span><h2>本地客户端怎么填</h2></div><span className="panel-kicker">2 个字段</span></div>
          <div className="guide-steps">
            <div className="guide-step">
              <span>01</span>
              <div><strong>Base URL</strong><p>填写上方代理地址。</p></div>
            </div>
            <div className="guide-step">
              <span>02</span>
              <div><strong>API Key</strong><p>填写“设备密钥”页面创建的密钥，不要填写 OpenRouter 真实密钥。</p></div>
            </div>
          </div>
          <div className="code-example">
            <div><span>环境变量示例</span><CopyButton compact label="复制环境变量示例" value={environmentExample} /></div>
            <pre><code>{environmentExample}</code></pre>
          </div>
        </section>

        <section className="surface system-status">
          <div className="panel-head"><div><span className="panel-kicker">NODE TELEMETRY</span><h2>运行状态</h2></div><span className="live-chip"><i />LIVE</span></div>
          <dl className="status-list">
            <div><dt>MongoDB</dt><dd><span className={status.database.status === "online" ? "state-pill is-online" : "state-pill is-offline"}><i />{status.database.status === "online" ? "正常" : "离线"}</span><small>{status.database.latencyMs === null ? "未取得延迟" : `${status.database.latencyMs} ms`}</small></dd></div>
            <div><dt>OpenRouter 密钥</dt><dd><span className={status.openRouter.configured ? "state-pill is-online" : "state-pill is-offline"}><i />{status.openRouter.configured ? "已配置" : "未配置"}</span><small>仅保存在 Zeabur 环境变量</small></dd></div>
            <div><dt>Node.js</dt><dd><code>{status.nodeVersion}</code><small>应用版本 {status.appVersion}</small></dd></div>
            <div><dt>本次运行</dt><dd><strong>{formatUptime(status.uptimeSeconds)}</strong><small>服务重启后重新计算</small></dd></div>
          </dl>
          <SettingsCheck />
        </section>

        <section className="surface security-note">
          <span className="security-orbit" aria-hidden="true"><i /></span>
          <div>
            <span className="panel-kicker">KEY BOUNDARY</span>
            <h2>真实密钥留在新加坡</h2>
            <p>本地设备只持有代理密钥。OpenRouter 真实密钥保存在 Zeabur 环境变量中，不会进入浏览器或 MongoDB。</p>
            <p>代理不会解析 JSON 或 SSE，也不会保存路径、模型、Token、费用、耗时、状态码或最近使用时间。</p>
            <p>请为代理使用普通推理密钥，并在 OpenRouter 设置你能接受的消费上限，不要使用管理级密钥。</p>
            <p className="scope-note">这条代理只改变请求的网络出口，不能改变 OpenRouter 账户、账单地址或模型供应商自身的地区规则。</p>
          </div>
          <div className="boundary-flow" aria-label="密钥边界示意">
            <span>本地<br /><small>代理密钥</small></span><i>→</i><strong>新加坡节点<br /><small>替换鉴权</small></strong><i>→</i><span>OpenRouter<br /><small>真实密钥</small></span>
          </div>
        </section>

        <section className="surface session-card">
          <div><span className="panel-kicker">ADMIN SESSION</span><h2>管理会话</h2><p>退出后，此浏览器需要重新输入管理密码。</p></div>
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}
