import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { PageHeading } from "@/components/page-heading";
import { getCurrentUser } from "@/server/portal/queries";

export const metadata: Metadata = { title: "接入指南" };
export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const [user, requestHeaders] = await Promise.all([getCurrentUser(), headers()]);
  const host = requestHeaders.get("host")?.trim();
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("无法识别当前域名");
  }
  const proxyBaseUrl = `https://${host}/api/v1`;
  const environmentExample = `OPENAI_BASE_URL=${proxyBaseUrl}\nOPENAI_API_KEY=你在“我的密钥”页创建的密钥`;

  return (
    <div className="page-wrap settings-page">
      <PageHeading
        description={`你好，${user.username}！把下面的中转地址和你创建的密钥填进 AI 软件，就能开始使用了。`}
        title="接入指南"
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
              <div><strong>密钥（API Key）</strong><p>填“我的密钥”页面创建的密钥，忘记的话可以回去随时查看复制。</p></div>
            </div>
          </div>
          <div className="code-example">
            <div><span>环境变量示例</span><CopyButton compact label="复制环境变量示例" value={environmentExample} /></div>
            <pre><code>{environmentExample}</code></pre>
          </div>
        </section>

        <section className="surface security-note">
          <h2>使用须知</h2>
          <p>你的密钥只属于你的账户，请按设备分开创建，哪把不用了就及时移除。</p>
          <p>中转只负责转发请求，不会保存你的聊天内容，也不会保存路径、模型、用量等使用记录。</p>
          <p>可用模型范围由管理员统一设置。如果某个模型突然无法使用，可以到<Link className="text-link" href="/portal/keys">我的密钥</Link>页查看你的可用模型清单。</p>
        </section>
      </div>
    </div>
  );
}
