export function RouteDiagram({
  openRouterConfigured,
  activeKeys,
}: Readonly<{
  openRouterConfigured: boolean;
  activeKeys: number;
}>) {
  return (
    <section aria-label="代理连接链路" className="route-diagram surface">
      <div className="route-skyline" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="route-station route-origin">
        <span className="station-code">LOCAL</span>
        <span className="station-symbol device-symbol"><i /></span>
        <strong>本地设备</strong>
        <small>{activeKeys} 枚有效密钥</small>
      </div>
      <div className="route-line">
        <span>ENCRYPTED</span>
        <i><b /></i>
      </div>
      <div className="route-station route-singapore">
        <span className="station-code">SIN · 01°N 103°E</span>
        <span className="station-symbol singapore-symbol"><i /><i /><i /></span>
        <strong>新加坡节点</strong>
        <small><em />出口在线</small>
      </div>
      <div className="route-line">
        <span>SERVER KEY</span>
        <i><b /></i>
      </div>
      <div className="route-station route-destination">
        <span className="station-code">GLOBAL</span>
        <span className="station-symbol router-symbol"><i /><i /></span>
        <strong>OpenRouter</strong>
        <small className={openRouterConfigured ? undefined : "route-degraded"}>
          {openRouterConfigured ? "服务端密钥已就绪" : "服务端密钥未配置"}
        </small>
      </div>
      <span className="route-coordinate">SG / RELAY</span>
    </section>
  );
}
