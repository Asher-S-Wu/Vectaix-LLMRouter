import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <h1>页面不存在</h1>
      <p>请检查地址，或返回首页。</p>
      <Link className="button button-primary" href="/">返回首页</Link>
    </main>
  );
}
