export function RouteDiagram({
  openRouterConfigured,
  activeKeys,
}: Readonly<{
  openRouterConfigured: boolean;
  activeKeys: number;
}>) {
  return (
    <section aria-label="中转流程" className="flow-card surface">
      <div className="flow-steps">
        <div className="flow-node">
          <strong>你的设备</strong>
          <small>{activeKeys} 把有效密钥</small>
        </div>
        <span aria-hidden="true" className="flow-arrow">→</span>
        <div className="flow-node is-hub">
          <strong>Vectaix 节点</strong>
          <small>新加坡 · 运行中</small>
        </div>
        <span aria-hidden="true" className="flow-arrow">→</span>
        <div className="flow-node">
          <strong>OpenRouter</strong>
          <small>{openRouterConfigured ? "连接已就绪" : "密钥未配置"}</small>
        </div>
      </div>
    </section>
  );
}
