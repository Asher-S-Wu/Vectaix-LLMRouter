"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="full-state page-wrap">
      <h1>数据加载失败</h1>
      <p>控制台暂时没有拿到最新数据，你的中转服务不一定受影响，可以重试一下。{error.digest ? ` 事件编号：${error.digest}` : ""}</p>
      <button className="button button-primary" onClick={reset} type="button">重试</button>
    </div>
  );
}
