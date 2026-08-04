import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/server/auth/admin-session";

export const metadata: Metadata = { title: "管理登录" };

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/dashboard");

  return (
    <main className="login-view">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-intro">
        <div className="login-brand">
          <span aria-hidden="true" className="brand-mark brand-mark-large"><b>V</b><i /><i /></span>
          <span>
            <strong>Vectaix</strong>
            <small>PRIVATE AI RELAY</small>
          </span>
        </div>
        <div className="login-copy">
          <p className="eyebrow"><span />VECTAIX SINGAPORE RELAY · ONLINE</p>
          <h1>从本地出发，<br />经新加坡抵达模型世界。</h1>
          <p>你的 OpenRouter 密钥只留在服务器。这里负责管理接入方式，代理流量不会被查看或记录。</p>
        </div>
        <div className="login-route" aria-label="本地设备经新加坡连接 OpenRouter">
          <div><span>LOCAL</span><strong>本地设备</strong></div>
          <i><b /></i>
          <div className="login-node"><span>SIN · 01°N</span><strong>新加坡节点</strong></div>
          <i><b /></i>
          <div><span>GLOBAL</span><strong>OpenRouter</strong></div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-top">
            <span>VECTAIX CONTROL DECK</span>
            <span className="status-label"><i />安全连接</span>
          </div>
          <div>
            <p className="panel-number">/ 01</p>
            <h2>验证管理身份</h2>
            <p>此密码用于控制台登录，与设备代理密钥不同。</p>
          </div>
          <LoginForm />
          <p className="privacy-note">管理会话仅保存在安全 Cookie 中，12 小时后自动结束。</p>
        </div>
      </section>
    </main>
  );
}
