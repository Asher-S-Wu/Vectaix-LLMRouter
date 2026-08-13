"use client";

import {
  type FormEvent,
  useEffect,
  useState,
  useTransition,
} from "react";

import { CopyButton } from "@/components/copy-button";
import {
  cancelCodexDeviceAction,
  clearInvalidCodexAccountAction,
  createCodexKeyAction,
  disconnectCodexAccountAction,
  pollCodexDeviceAction,
  refreshCodexOverviewAction,
  removeCodexKeyAction,
  renameCodexKeyAction,
  revealCodexKeyAction,
  startCodexDeviceAction,
  type CodexActionResult,
  type CodexDeviceAuthorization,
  type CodexOverview,
  type CodexProxyKeyItem,
} from "@/features/codex/actions";

interface CodexAdminProps {
  baseUrl: string;
  initialKeys: CodexProxyKeyItem[];
  initialOverview: CodexOverview;
}

type Notice = { kind: "error" | "success"; text: string };

function formatDate(value: string | null): string {
  if (!value) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(value));
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatWindow(minutes: number | null): string {
  if (minutes === null) return "窗口时长未提供";
  if (minutes % 1_440 === 0) return `${minutes / 1_440} 天窗口`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时窗口`;
  return `${minutes} 分钟窗口`;
}

function formatCredits(
  credits: NonNullable<CodexOverview["quota"]>["credits"],
): string {
  if (!credits) return "未提供";
  if (credits.unlimited) return "无限";
  if (!credits.hasCredits) return "无附加额度";
  if (credits.balance === null) return "未提供";
  return credits.balance;
}

function messageFrom<T>(result: CodexActionResult<T>): Notice {
  return { kind: result.ok ? "success" : "error", text: result.message };
}

function UsageWindowCard({
  label,
  window,
}: Readonly<{
  label: string;
  window: NonNullable<CodexOverview["quota"]>["primaryWindow"];
}>) {
  if (!window) {
    return (
      <article className="codex-quota-card is-empty">
        <span>{label}</span>
        <strong>未提供</strong>
        <p>当前套餐没有返回这个额度窗口。</p>
      </article>
    );
  }

  const percent = Math.min(100, Math.max(0, window.usedPercent));
  return (
    <article className="codex-quota-card">
      <div className="codex-quota-label">
        <span>{label}</span>
        <small>{formatWindow(window.windowMinutes)}</small>
      </div>
      <strong>已用 {formatPercent(window.usedPercent)}%</strong>
      <div
        aria-label={`${label}已使用 ${formatPercent(window.usedPercent)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="codex-quota-track"
        role="progressbar"
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <p>{window.resetsAt ? `重置于 ${formatDate(window.resetsAt)}` : "未提供重置时间"}</p>
    </article>
  );
}

export function CodexAdmin({
  baseUrl,
  initialKeys,
  initialOverview,
}: Readonly<CodexAdminProps>) {
  const [overview, setOverview] = useState(initialOverview);
  const [keys, setKeys] = useState(initialKeys);
  const [device, setDevice] = useState<CodexDeviceAuthorization | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [accountNotice, setAccountNotice] = useState<Notice | null>(null);
  const [keyNotice, setKeyNotice] = useState<Notice | null>(null);
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null);
  const [viewingKey, setViewingKey] = useState<{ id: string; key: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountPending, startAccountTransition] = useTransition();
  const [keyPending, startKeyTransition] = useTransition();

  const remainingSeconds = device
    ? Math.max(0, Math.ceil((new Date(device.expiresAt).getTime() - clock) / 1_000))
    : 0;

  useEffect(() => {
    if (!device) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [device]);

  useEffect(() => {
    if (!device) return;

    let stopped = false;
    let timer: number | undefined;

    async function poll(): Promise<void> {
      if (stopped || !device) return;
      if (new Date(device.expiresAt).getTime() <= Date.now()) {
        setAccountNotice({ kind: "error", text: "连接码已过期，请重新生成" });
        setDevice(null);
        return;
      }

      const formData = new FormData();
      formData.set("deviceCode", device.deviceCode);
      const result = await pollCodexDeviceAction(formData);
      if (stopped) return;

      if (!result.ok || !result.data) {
        setAccountNotice(messageFrom(result));
        return;
      }

      if (result.data.status === "connected") {
        setOverview(result.data.overview);
        setDevice(null);
        setAccountNotice({ kind: "success", text: result.message });
        return;
      }

      timer = window.setTimeout(poll, device.intervalSeconds * 1_000);
    }

    timer = window.setTimeout(poll, device.intervalSeconds * 1_000);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [device]);

  function startConnection(): void {
    setAccountNotice(null);
    startAccountTransition(async () => {
      const result = await startCodexDeviceAction();
      setAccountNotice(messageFrom(result));
      if (!result.ok || !result.data) return;
      setClock(Date.now());
      setDevice(result.data);
    });
  }

  function cancelConnection(): void {
    if (!device) return;
    const current = device;
    setAccountNotice(null);
    startAccountTransition(async () => {
      const formData = new FormData();
      formData.set("deviceCode", current.deviceCode);
      const result = await cancelCodexDeviceAction(formData);
      setAccountNotice(messageFrom(result));
      if (result.ok) setDevice(null);
    });
  }

  function refreshOverview(): void {
    setAccountNotice(null);
    startAccountTransition(async () => {
      const result = await refreshCodexOverviewAction();
      setAccountNotice(messageFrom(result));
      if (result.data) setOverview(result.data);
    });
  }

  function disconnectAccount(): void {
    if (!window.confirm("系统会先向 OpenAI 撤销登录授权，成功后再删除本站保存的账户凭据。之后所有 Codex 专用密钥都会无法使用。确认撤销并断开吗？")) return;
    setAccountNotice(null);
    startAccountTransition(async () => {
      const result = await disconnectCodexAccountAction();
      setAccountNotice(messageFrom(result));
      if (result.ok) {
        setOverview({ account: { state: "disconnected" }, quota: null });
      }
    });
  }

  function clearInvalidAccount(): void {
    if (!window.confirm("这会永久删除本站保存的失效账户凭据，删除后需要重新连接。确认清除吗？")) return;
    setAccountNotice(null);
    startAccountTransition(async () => {
      const result = await clearInvalidCodexAccountAction();
      setAccountNotice(messageFrom(result));
      if (result.ok) {
        setOverview({ account: { state: "disconnected" }, quota: null });
      }
    });
  }

  function createKey(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setKeyNotice(null);
    startKeyTransition(async () => {
      const result = await createCodexKeyAction(formData);
      setKeyNotice(messageFrom(result));
      if (!result.ok || !result.data) return;
      setKeys((current) => [result.data!.item, ...current]);
      setCreatedKey({ key: result.data.key, name: result.data.item.name });
      form.reset();
    });
  }

  function renameKey(event: FormEvent<HTMLFormElement>, id: string): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("id", id);
    setKeyNotice(null);
    startKeyTransition(async () => {
      const result = await renameCodexKeyAction(formData);
      setKeyNotice(messageFrom(result));
      if (!result.ok || !result.data) return;
      setKeys((current) => current.map((item) => item.id === id ? result.data! : item));
      setEditingId(null);
    });
  }

  function revealKey(item: CodexProxyKeyItem): void {
    if (viewingKey?.id === item.id) {
      setViewingKey(null);
      return;
    }
    setKeyNotice(null);
    startKeyTransition(async () => {
      const formData = new FormData();
      formData.set("id", item.id);
      const result = await revealCodexKeyAction(formData);
      if (!result.ok || !result.data) {
        setKeyNotice(messageFrom(result));
        return;
      }
      setViewingKey({ id: item.id, key: result.data.key });
    });
  }

  function removeKey(item: CodexProxyKeyItem): void {
    if (!window.confirm(`删除“${item.name}”后，使用它的设备会立即无法连接。确认删除吗？`)) return;
    setKeyNotice(null);
    startKeyTransition(async () => {
      const formData = new FormData();
      formData.set("id", item.id);
      const result = await removeCodexKeyAction(formData);
      setKeyNotice(messageFrom(result));
      if (!result.ok) return;
      setKeys((current) => current.filter((key) => key.id !== item.id));
      if (viewingKey?.id === item.id) setViewingKey(null);
    });
  }

  const account = overview.account;
  const quota = overview.quota;

  return (
    <div className="codex-admin">
      <section aria-label="重要使用提醒" className="codex-risk-banner" role="note">
        <span className="codex-risk-mark">!</span>
        <div>
          <strong>非官方个人工具 · 仅限本人使用</strong>
          <p>不要把这个反代地址、Codex 专用密钥或账户额度分享给任何人。向他人提供使用可能违反服务规定，产生的用量也会全部计入你的账户。</p>
        </div>
      </section>

      <section className="codex-account surface">
        <div className="panel-head codex-panel-head">
          <div>
            <h2>Codex 账户连接</h2>
            <span className={`codex-state is-${account.state}`}>
              <i />
              {account.state === "connected" ? "已连接" : account.state === "reconnect_required" ? "需要重新连接" : "未连接"}
            </span>
          </div>
          {account.state === "connected" ? (
            <button className="button button-secondary button-compact" disabled={accountPending} onClick={refreshOverview} type="button">
              {accountPending ? "正在更新…" : "刷新额度"}
            </button>
          ) : null}
        </div>

        {account.state === "connected" ? (
          <div className="codex-account-body">
            <div className="codex-account-identity">
              <span aria-hidden="true" className="codex-account-avatar">C</span>
              <div>
                <strong>{account.email ?? "已连接的 Codex 账户"}</strong>
                <p>{quota?.planName ?? account.plan ?? "套餐名称未提供"}</p>
              </div>
            </div>
            <dl className="codex-account-meta">
              <div><dt>连接时间</dt><dd>{formatDate(account.connectedAt)}</dd></div>
              <div><dt>登录有效期</dt><dd>{formatDate(account.tokenExpiresAt)}</dd></div>
            </dl>
            <button className="button button-danger" disabled={accountPending} onClick={disconnectAccount} type="button">撤销并断开</button>
          </div>
        ) : account.state === "reconnect_required" ? (
          <div className="codex-reconnect-body">
            <div>
              <strong>这次连接已经失效</strong>
              <p>{account.failureMessage ?? "请清除失效信息，再重新连接 Codex 账户。"}</p>
            </div>
            <button className="button button-danger" disabled={accountPending} onClick={clearInvalidAccount} type="button">
              {accountPending ? "正在清除…" : "永久清除失效连接"}
            </button>
          </div>
        ) : device ? (
          <div className="codex-device-flow">
            <div className="codex-device-code">
              <span>一次性连接码</span>
              <strong>{device.userCode}</strong>
              <CopyButton label="复制连接码" value={device.userCode} />
            </div>
            <div className="codex-device-instructions">
              <span className="codex-countdown">剩余 {formatCountdown(remainingSeconds)}</span>
              <h3>在 OpenAI 页面完成确认</h3>
              <p>打开下方链接，登录你自己的账户，输入左侧连接码。这个页面会自动等待连接结果。</p>
              <div className="codex-device-actions">
                <a className="button button-primary" href={device.verificationUrl} rel="noreferrer" target="_blank">打开确认页面</a>
                <CopyButton label="复制确认链接" value={device.verificationUrl} />
                <button className="button button-secondary" disabled={accountPending} onClick={cancelConnection} type="button">取消连接</button>
              </div>
              <code>{device.verificationUrl}</code>
            </div>
          </div>
        ) : (
          <div className="codex-connect-empty">
            <div>
              <strong>连接你自己的 Codex 账户</strong>
              <p>点击后会生成一个 15 分钟有效的连接码。整个过程只用于取得你本人账户的 Codex 访问资格。</p>
            </div>
            <button className="button button-primary" disabled={accountPending} onClick={startConnection} type="button">
              {accountPending ? "正在生成…" : "生成连接码"}
            </button>
          </div>
        )}

        {accountNotice ? <p className={`form-message is-${accountNotice.kind} codex-account-message`} role="status">{accountNotice.text}</p> : null}
      </section>

      <section className="codex-quota surface">
        <div className="panel-head codex-panel-head">
          <div>
            <h2>套餐与额度</h2>
            <span className="panel-note">{quota ? `${quota.planName ?? "当前套餐"} · 更新于 ${formatDate(quota.updatedAt)}` : "连接账户后显示"}</span>
          </div>
        </div>
        <div className="codex-quota-grid">
          <UsageWindowCard label="主额度窗口" window={quota?.primaryWindow ?? null} />
          <UsageWindowCard label="次额度窗口" window={quota?.secondaryWindow ?? null} />
          <UsageWindowCard label="代码审查额度" window={quota?.codeReviewWindow ?? null} />
          <article className={`codex-quota-card codex-credit-card${quota?.credits ? "" : " is-empty"}`}>
            <span>附加额度 / 积分</span>
            <strong>{formatCredits(quota?.credits ?? null)}</strong>
            <p>{quota?.credits?.overageLimitReached || quota?.spendControlReached ? "附加用量上限已经触达。" : quota?.credits?.unlimited ? "当前账户的附加额度不设上限。" : quota?.credits?.hasCredits ? "这是账户返回的当前可用余额。" : quota?.credits ? "当前没有可用的附加额度。" : "当前套餐没有返回附加额度信息。"}</p>
            <dl className="codex-credit-status">
              <div><dt>附加额度</dt><dd>{quota?.credits ? quota.credits.hasCredits || quota.credits.unlimited ? "可用" : "不可用" : "未提供"}</dd></div>
              <div><dt>超额上限</dt><dd>{quota?.credits ? quota.credits.overageLimitReached ? "已触达" : "未触达" : "未提供"}</dd></div>
              <div><dt>用量控制</dt><dd>{quota?.spendControlReached === null || quota?.spendControlReached === undefined ? "未提供" : quota.spendControlReached ? "已触达" : "未触达"}</dd></div>
            </dl>
          </article>
          <article className="codex-quota-card codex-reset-card">
            <span>可用额度重置次数</span>
            <strong>{quota?.resetCreditsAvailable ?? "未提供"}</strong>
            <p>这里只显示账户返回的次数，不能在此页面发起重置。</p>
          </article>
          <article className={`codex-quota-card codex-spend-card${quota?.spendControl ? "" : " is-empty"}`}>
            <span>附加用量控制</span>
            {quota?.spendControl?.individualLimit ? (
              <>
                <strong>已用 {formatPercent(quota.spendControl.individualLimit.usedPercent)}%</strong>
                <div
                  aria-label={`附加用量已使用 ${formatPercent(quota.spendControl.individualLimit.usedPercent)}%`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.min(100, Math.max(0, quota.spendControl.individualLimit.usedPercent))}
                  className="codex-quota-track"
                  role="progressbar"
                >
                  <i style={{ width: `${Math.min(100, Math.max(0, quota.spendControl.individualLimit.usedPercent))}%` }} />
                </div>
                <p>已用 {quota.spendControl.individualLimit.used} / 上限 {quota.spendControl.individualLimit.limit}，剩余 {quota.spendControl.individualLimit.remaining}。重置于 {formatDate(quota.spendControl.individualLimit.resetsAt)}。</p>
              </>
            ) : (
              <>
                <strong>{quota?.spendControlReached ? "已触达" : "未提供"}</strong>
                <p>{quota?.spendControl ? "账户没有返回具体的个人用量上限。" : "当前套餐没有返回附加用量控制信息。"}</p>
              </>
            )}
          </article>
        </div>
        {quota?.additionalRateLimits.length ? (
          <div className="codex-additional-limits">
            <div><strong>额外额度项</strong><span>{quota.additionalRateLimits.length} 项</span></div>
            <div className="codex-additional-grid">
              {quota.additionalRateLimits.map((item, index) => (
                <section className="codex-additional-item" key={`${item.name}-${index}`}>
                  <h3>{item.name}</h3>
                  <div>
                    <UsageWindowCard label="主窗口" window={item.primaryWindow} />
                    <UsageWindowCard label="次窗口" window={item.secondaryWindow} />
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="codex-access surface">
        <div className="panel-head"><h2>反代接入</h2><span className="panel-note">仅供你自己的设备</span></div>
        <div className="codex-access-body">
          <div className="codex-base-url">
            <span>Base URL</span>
            <div className="address-value">
              <code>{baseUrl}</code>
              <CopyButton label="复制地址" value={baseUrl} />
            </div>
          </div>
          <div className="codex-endpoints" aria-label="支持的接口">
            <div><b className="is-post">POST</b><code>/responses</code><span>发送 Codex 请求</span></div>
            <div><b className="is-get">GET</b><code>/models</code><span>读取可用模型</span></div>
          </div>
          <div className="codex-limits">
            <strong>使用限制</strong>
            <ul>
              <li>密钥只放在 <code>Authorization: Bearer</code> 中。</li>
              <li>不支持 <code>/chat/completions</code> 等其他 OpenAI 接口。</li>
              <li>两个接口都使用上方唯一连接账户的 Codex 额度。</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="codex-key-create surface">
        <div>
          <h2>创建 Codex 专用密钥</h2>
          <p>按设备分别创建，方便以后单独停用。这里的密钥不能用于 OpenRouter 中转。</p>
        </div>
        <form onSubmit={createKey}>
          <div className="field-group">
            <label htmlFor="codex-key-name">设备名称</label>
            <input disabled={keyPending} id="codex-key-name" maxLength={80} name="name" placeholder="例如：工作电脑" required />
          </div>
          <button className="button button-primary" disabled={keyPending} type="submit">{keyPending ? "正在创建…" : "创建密钥"}</button>
        </form>
      </section>

      {createdKey ? (
        <section aria-live="polite" className="key-reveal surface">
          <div className="key-reveal-copy">
            <span className="reveal-label">创建成功</span>
            <h2>“{createdKey.name}”的 Codex 密钥</h2>
            <p>复制到对应设备中。任何拿到它的人都会消耗你连接账户的额度。</p>
          </div>
          <div className="secret-line"><code>{createdKey.key}</code><CopyButton label="复制完整密钥" value={createdKey.key} /></div>
          <button className="reveal-close" onClick={() => setCreatedKey(null)} type="button">收起完整密钥</button>
        </section>
      ) : null}

      {keyNotice ? <p className={`form-message is-${keyNotice.kind} codex-key-message`} role="status">{keyNotice.text}</p> : null}

      <section className="key-list surface">
        <div className="panel-head"><h2>Codex 专用密钥</h2><span className="count-chip">{keys.length} 把有效</span></div>
        {keys.length ? (
          <div aria-label="Codex 专用密钥列表" className="key-rows" role="table">
            <div className="key-row key-row-head" role="row">
              <span role="columnheader">设备</span><span role="columnheader">密钥前缀</span><span role="columnheader">创建时间</span><span role="columnheader">操作</span>
            </div>
            {keys.map((item) => (
              <div className="key-entry" key={item.id}>
                <div className="key-row" role="row">
                  {editingId === item.id ? (
                    <form className="rename-form" onSubmit={(event) => renameKey(event, item.id)} role="cell">
                      <input aria-label="新的设备名称" autoFocus defaultValue={item.name} maxLength={80} name="name" required />
                      <button className="button button-primary button-compact" disabled={keyPending} type="submit">保存</button>
                      <button className="button button-secondary button-compact" onClick={() => setEditingId(null)} type="button">取消</button>
                    </form>
                  ) : (
                    <>
                      <div className="key-device" role="cell"><span className="device-dot" /><strong>{item.name}</strong></div>
                      <code role="cell">{item.prefix}••••••••</code>
                      <time dateTime={item.createdAt} role="cell">{formatDate(item.createdAt)}</time>
                      <div className="row-actions" role="cell">
                        <button className="plain-action" disabled={keyPending} onClick={() => revealKey(item)} type="button">{viewingKey?.id === item.id ? "收起密钥" : "查看密钥"}</button>
                        <button className="plain-action" disabled={keyPending} onClick={() => { setEditingId(item.id); setViewingKey(null); }} type="button">重命名</button>
                        <button className="plain-action is-danger" disabled={keyPending} onClick={() => removeKey(item)} type="button">删除</button>
                      </div>
                    </>
                  )}
                </div>
                {viewingKey?.id === item.id ? (
                  <div className="key-expansion">
                    <div className="key-view">
                      <span className="field-label">“{item.name}”的完整 Codex 密钥</span>
                      <div className="secret-line"><code>{viewingKey.key}</code><CopyButton label="复制完整密钥" value={viewingKey.key} /></div>
                      <p className="key-view-note">只保存在你自己的设备里，不要截图或发给他人。</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon">C</span><h2>还没有 Codex 专用密钥</h2><p>连接账户后，为你自己的设备分别创建密钥。</p></div>
        )}
      </section>
    </div>
  );
}
