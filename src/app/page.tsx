import Link from "next/link";

import { KeyIcon, ShieldIcon, ZapIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-switcher";
import { getAdminSession, getUserSession } from "@/server/auth";

export default async function HomePage() {
  const [adminSession, userSession] = await Promise.all([
    getAdminSession(),
    getUserSession(),
  ]);
  const entryHref = adminSession
    ? "/dashboard"
    : userSession
      ? "/portal/keys"
      : "/login";
  const entryLabel = adminSession || userSession ? "进入控制台" : "登录";
  const loggedIn = Boolean(adminSession || userSession);

  return (
    <main className="home">
      <header className="home-nav">
        <div className="home-nav-inner">
          <span className="brand">
            <span aria-hidden="true" className="brand-mark">V</span>
            <span>
              <strong>Vectaix</strong>
            </span>
          </span>
          <div className="home-nav-actions">
            <ThemeToggle />
            <Link className="button button-secondary button-compact" href={entryHref}>{entryLabel}</Link>
          </div>
        </div>
      </header>

      <section className="home-hero">
        <span className="home-badge">OpenRouter 中转服务</span>
        <h1>一个地址，用上所有 AI 模型</h1>
        <p>
          Vectaix 是一个开箱即用的中转站。注册账户、创建密钥，把 AI 软件里的服务器地址换成它，
          就能通过新加坡节点使用 OpenRouter 上的模型——对话不会被查看，也不会被保存。
        </p>
        <div className="home-actions">
          {loggedIn ? (
            <Link className="button button-primary" href={entryHref}>{entryLabel}</Link>
          ) : (
            <>
              <Link className="button button-primary" href="/register">创建账户</Link>
              <Link className="button button-secondary" href="/login">登录</Link>
            </>
          )}
          <a className="button button-secondary" href="#how-it-works">看看怎么用</a>
        </div>
      </section>

      <section aria-label="服务特点" className="home-section">
        <div className="home-section-head">
          <h2>简单、安心、好管理</h2>
          <p>这是一个面向小团队的中转服务，设计上只做好三件事。</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-icon"><ZapIcon /></span>
            <h3>换上就能用</h3>
            <p>任何支持 OpenAI 接口的软件都能接入，只需要改两个填空：服务器地址和你的密钥。</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon"><ShieldIcon /></span>
            <h3>不看你的对话</h3>
            <p>服务器只负责原样转发请求，不读取聊天内容，也不保存路径、模型、用量等任何记录。</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon"><KeyIcon /></span>
            <h3>账户自主管理</h3>
            <p>注册自己的账户，按设备创建密钥、随时查看复制；可用模型范围由管理员统一把控。</p>
          </article>
        </div>
      </section>

      <section aria-label="使用步骤" className="home-section" id="how-it-works">
        <div className="home-section-head">
          <h2>三步完成设置</h2>
          <p>不需要任何编程知识，和平时配置软件一样简单。</p>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">1</span>
            <h3>注册账户</h3>
            <p>创建一个属于自己的账户，登录后进入用户中心。</p>
          </article>
          <article className="step-card">
            <span className="step-number">2</span>
            <h3>创建密钥</h3>
            <p>为你的每台设备各创建一把密钥，比如“家里的电脑”和“手机”。</p>
          </article>
          <article className="step-card">
            <span className="step-number">3</span>
            <h3>开始使用</h3>
            <p>把中转地址和密钥填进 AI 软件的设置里，照常和 AI 聊天即可。</p>
          </article>
        </div>
      </section>

      <section className="home-section">
        <div className="home-cta">
          <h2>准备好开始了吗？</h2>
          <p>创建账户，两分钟就能完成全部设置。</p>
          <Link className="button button-primary" href={loggedIn ? entryHref : "/register"}>{loggedIn ? entryLabel : "创建账户"}</Link>
        </div>
      </section>

      <footer className="home-footer">Vectaix · AI 中转站</footer>
    </main>
  );
}
