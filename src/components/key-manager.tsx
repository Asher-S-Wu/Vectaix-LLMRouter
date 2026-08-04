"use client";

import { FormEvent, useState, useTransition } from "react";

import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/data-state";
import { createProxyKeyAction, renameProxyKeyAction, revokeProxyKeyAction } from "@/features/admin/actions";

export type ProxyKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

export function KeyManager({ initialKeys }: Readonly<{ initialKeys: ProxyKeyView[] }>) {
  const [keys, setKeys] = useState(initialKeys);
  const [revealedKey, setRevealedKey] = useState<{ key: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await createProxyKeyAction(formData);
      if (!result.ok || !result.data) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      const created = result.data;
      setKeys((current) => [created.item, ...current]);
      setRevealedKey({ key: created.key, name: created.item.name });
      setMessage({ kind: "success", text: result.message });
      form.reset();
    });
  }

  function renameKey(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("id", id);
    setMessage(null);
    startTransition(async () => {
      const result = await renameProxyKeyAction(formData);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      const updated = result.data;
      setKeys((current) => current.map((item) => item.id === id && updated ? updated : item));
      setEditingId(null);
      setMessage({ kind: "success", text: result.message });
    });
  }

  function revokeKey(id: string, name: string) {
    if (!window.confirm(`撤销“${name}”后，使用它的设备会立即无法连接。确认撤销吗？`)) return;
    const formData = new FormData();
    formData.set("id", id);
    setMessage(null);
    startTransition(async () => {
      const result = await revokeProxyKeyAction(formData);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      const revokedAt = new Date().toISOString();
      setKeys((current) => current.map((item) => item.id === id ? { ...item, revokedAt } : item));
      setMessage({ kind: "success", text: result.message });
    });
  }

  const activeCount = keys.filter((item) => !item.revokedAt).length;

  return (
    <>
      <section className="key-create surface">
        <div className="key-create-copy">
          <span className="panel-kicker">ISSUE ACCESS</span>
          <h2>签发新的设备密钥</h2>
          <p>建议按设备命名，例如“家中电脑”或“手机客户端”，以后能快速找到需要撤销的密钥。</p>
        </div>
        <form className="key-create-form" onSubmit={createKey}>
          <div className="field-group">
            <label htmlFor="new-key-name">设备名称</label>
            <input disabled={pending} id="new-key-name" maxLength={80} name="name" placeholder="例如：家中电脑" required />
          </div>
          <button className="button button-primary" disabled={pending} type="submit">{pending ? "正在签发…" : "创建设备密钥"}</button>
        </form>
      </section>

      {revealedKey ? (
        <section aria-live="polite" className="key-reveal surface">
          <div className="reveal-orbit" aria-hidden="true"><i /><i /></div>
          <div className="key-reveal-copy">
            <span className="reveal-label">仅显示这一次</span>
            <h2>“{revealedKey.name}”的密钥已生成</h2>
            <p>现在复制并保存到对应设备。关闭此区域后，控制台无法再次查看完整密钥。</p>
          </div>
          <div className="secret-line">
            <code>{revealedKey.key}</code>
            <CopyButton label="复制完整密钥" value={revealedKey.key} />
          </div>
          <button className="reveal-close" onClick={() => { setRevealedKey(null); setMessage(null); }} type="button">我已保存，关闭显示</button>
        </section>
      ) : null}

      {message ? <p className={`form-message ${message.kind === "error" ? "is-error" : "is-success"}`} role="status">{message.text}</p> : null}

      <section className="key-list surface">
        <div className="panel-head">
          <div><span className="panel-kicker">DEVICE CREDENTIALS</span><h2>已签发密钥</h2></div>
          <span className="count-chip">{activeCount} 个有效密钥</span>
        </div>
        {keys.length ? (
          <div aria-label="设备密钥列表" className="key-rows" role="table">
            <div className="key-row key-row-head" role="row">
              <span role="columnheader">设备</span><span role="columnheader">密钥前缀</span><span role="columnheader">创建时间</span><span role="columnheader">操作</span>
            </div>
            {keys.map((item) => (
              <div className={item.revokedAt ? "key-row is-revoked" : "key-row"} key={item.id} role="row">
                {editingId === item.id ? (
                  <form className="rename-form" onSubmit={(event) => renameKey(event, item.id)} role="cell">
                    <input aria-label="新的设备名称" autoFocus defaultValue={item.name} maxLength={80} name="name" required />
                    <button className="button button-primary button-compact" disabled={pending} type="submit">保存</button>
                    <button className="button button-secondary button-compact" onClick={() => setEditingId(null)} type="button">取消</button>
                  </form>
                ) : (
                  <>
                    <div className="key-device" role="cell">
                      <span className="device-dot" />
                      <strong>{item.name}</strong>
                      {item.revokedAt ? <small>已撤销</small> : null}
                    </div>
                    <code role="cell">{item.prefix}••••••••</code>
                    <time dateTime={item.createdAt} role="cell">{formatDate(item.createdAt)}</time>
                    <div className="row-actions" role="cell">
                      {!item.revokedAt ? (
                        <>
                      <button aria-label={`重命名 ${item.name}`} className="plain-action" disabled={pending} onClick={() => setEditingId(item.id)} type="button">重命名</button>
                      <button aria-label={`撤销 ${item.name}`} className="plain-action is-danger" disabled={pending} onClick={() => revokeKey(item.id, item.name)} type="button">撤销</button>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : <EmptyState title="还没有设备密钥" description="先为你的电脑或手机签发一枚密钥，它只会完整显示一次。" />}
      </section>
    </>
  );
}
