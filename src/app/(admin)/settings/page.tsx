import type { Metadata } from "next";
import { headers } from "next/headers";

import { CopyButton } from "@/components/copy-button";
import { LogoutButton } from "@/components/logout-button";
import { PageHeading } from "@/components/page-heading";
import { SettingsCheck } from "@/components/settings-check";
import { logoutAction } from "@/features/admin/actions";
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
    throw new Error("无法识别当前域名");
  }
  const proxyBaseUrl = `https://${host}/api/v1`;
  const environmentExample = `OPENAI_BASE_URL=${proxyBaseUrl}\nOPENAI_API_KEY=你创建的设备密钥`;

  return (
    <div className="page-wrap settings-page">
      <PageHeading
        description="复制中转地址并检查服务状态。"
        title="接入设置"
        action={<span className="heading-note"><i />检查于 {formatDate(status.checkedAt)}</span>}
      />

      <section className="proxy-address surface">
        <h2>中转地址</h2>
        <p>直接填入软件，无需再加 <code>/v1</code>。</p>
        <div className="address-value">
          <code>{proxyBaseUrl}</code>
          <CopyButton label="复制地址" value={proxyBaseUrl} />
        </div>
      </section>

      <div className="settings-grid">
        <section className="surface connect-guide">
          <div className="panel-head"><h2>软件里怎么填</h2><span className="panel-note">共 2 个空</span></div>
          <div className="guide-steps">
            <div className="guide-step">
              <span>1</span>
              <div><strong>服务器地址（Base URL）</strong><p>填写上方中转地址。</p></div>
            </div>
            <div className="guide-step">
              <span>2</span>
              <div><strong>密钥（API Key）</strong><p>填写用户自己的设备密钥。</p></div>
            </div>
          </div>
          <div className="code-example">
            <div><span>环境变量示例</span><CopyButton compact label="复制环境变量示例" value={environmentExample} /></div>
            <pre><code>{environmentExample}</code></pre>
          </div>
        </section>

        <section className="surface system-status">
          <div className="panel-head"><h2>运行状态</h2></div>
          <dl className="status-list">
            <div><dt>数据库</dt><dd><span className={status.database.status === "online" ? "state-pill is-online" : "state-pill is-offline"}><i />{status.database.status === "online" ? "正常" : "离线"}</span><small>{status.database.latencyMs === null ? "暂时无法取得延迟" : `响应 ${status.database.latencyMs} ms`}</small></dd></div>
            <div><dt>OpenRouter 密钥</dt><dd><span className={status.openRouter.configured ? "state-pill is-online" : "state-pill is-offline"}><i />{status.openRouter.configured ? "已配置" : "未配置"}</span><small>只保存在服务器上</small></dd></div>
            <div><dt>服务版本</dt><dd><code>v{status.appVersion}</code><small>Node.js {status.nodeVersion}</small></dd></div>
            <div><dt>已运行</dt><dd><strong>{formatUptime(status.uptimeSeconds)}</strong><small>服务重启后重新计算</small></dd></div>
          </dl>
          <SettingsCheck />
        </section>

        <section className="surface security-note">
          <h2>密钥安全</h2>
          <ul className="security-points">
            <li>OpenRouter 密钥仅保存在服务器，中转不保存对话和使用记录。</li>
            <li>建议使用普通推理密钥，并设置可接受的消费上限。</li>
          </ul>
          <p className="scope-note">中转只改变网络出口，不改变账户、账单或模型供应商的地区规则。</p>
        </section>

        <section className="surface session-card">
          <div><h2>管理会话</h2><p>退出当前设备的管理登录。</p></div>
          <LogoutButton action={logoutAction} />
        </section>
      </div>
    </div>
  );
}
