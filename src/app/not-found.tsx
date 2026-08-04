import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <h1>页面不存在</h1>
      <p>你访问的地址没有对应的页面，可能是链接有误。</p>
      <Link className="button button-primary" href="/">返回首页</Link>
    </main>
  );
}
