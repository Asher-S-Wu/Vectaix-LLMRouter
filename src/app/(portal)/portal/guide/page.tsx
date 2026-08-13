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
        description={`${user.username}，填写地址和密钥即可开始使用。`}
        title="接入指南"
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
              <div><strong>密钥（API Key）</strong><p>填写“我的密钥”页中的设备密钥。</p></div>
            </div>
          </div>
          <div className="code-example">
            <div><span>环境变量示例</span><CopyButton compact label="复制环境变量示例" value={environmentExample} /></div>
            <pre><code>{environmentExample}</code></pre>
          </div>
        </section>

        <section className="surface security-note">
          <h2>使用须知</h2>
          <ul className="security-points">
            <li>密钥请按设备分别创建，不再使用时及时移除。</li>
            <li>中转不保存对话和使用记录。</li>
            <li>模型不可用时，到<Link className="text-link" href="/portal/keys">我的密钥</Link>查看权限清单。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
