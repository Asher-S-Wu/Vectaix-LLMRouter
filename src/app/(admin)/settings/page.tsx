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
    throw new Error("无法识别当前域名");
  }
  const proxyBaseUrl = `https://${host}/api/v1`;
  const environmentExample = `OPENAI_BASE_URL=${proxyBaseUrl}\nOPENAI_API_KEY=你创建的设备密钥`;

  return (
    <div className="page-wrap settings-page">
      <PageHeading
        description="把下面的中转地址和设备密钥填进你的 AI 软件，就能开始使用了。"
        title="接入设置"
        action={<span className="heading-note"><i />检查于 {formatDate(status.checkedAt)}</span>}
      />

      <section className="proxy-address surface">
        <h2>中转地址</h2>
        <p>所有支持 OpenAI 接口的软件都填这个地址，不需要在后面再加 <code>/v1</code>。</p>
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
              <div><strong>服务器地址（Base URL）</strong><p>填上方这个中转地址。</p></div>
            </div>
            <div className="guide-step">
              <span>2</span>
              <div><strong>密钥（API Key）</strong><p>填“设备密钥”页面创建的密钥，不要填 OpenRouter 的真实密钥。</p></div>
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
          <p>你的设备只保存代理密钥；OpenRouter 真实密钥存放在服务器的环境变量里，不会进入浏览器，也不会存进数据库。</p>
          <p>中转只负责转发请求，不会保存你的聊天内容，也不会保存路径、模型、用量等使用记录。</p>
          <p>建议使用普通的推理密钥，并在 OpenRouter 里设置好你能接受的消费上限，不要使用管理级密钥。</p>
          <p className="scope-note">中转只改变请求的网络出口，无法改变 OpenRouter 账户、账单或模型供应商本身的地区规则。</p>
        </section>

        <section className="surface session-card">
          <div><h2>管理会话</h2><p>退出后，这台设备需要重新输入密码才能进入控制台。</p></div>
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}
