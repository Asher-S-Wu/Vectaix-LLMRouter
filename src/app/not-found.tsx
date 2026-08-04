import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <p className="eyebrow"><span />ROUTE 404</p>
      <h1>这条航线不存在</h1>
      <p>地址没有对应的控制台页面。</p>
      <Link className="button button-primary" href="/dashboard">返回航线总览</Link>
    </main>
  );
}
