"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="full-state page-wrap">
      <div className="signal-lost" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow"><span />SIGNAL INTERRUPTED</p>
      <h1>航线数据暂时中断</h1>
      <p>控制台没有拿到最新数据。代理请求不一定受影响，可以重新连接管理视图。{error.digest ? ` 事件编号：${error.digest}` : ""}</p>
      <button className="button button-primary" onClick={reset} type="button">重新连接</button>
    </div>
  );
}
