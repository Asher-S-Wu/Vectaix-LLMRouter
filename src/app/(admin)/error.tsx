"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="full-state page-wrap">
      <h1>数据加载失败</h1>
      <p>暂时无法加载控制台数据，请重试。{error.digest ? ` 事件编号：${error.digest}` : ""}</p>
      <button className="button button-primary" onClick={reset} type="button">重试</button>
    </div>
  );
}
