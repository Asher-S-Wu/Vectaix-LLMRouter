"use client";

import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data-state";
import { ModelRestrictionPanel } from "@/components/model-restriction-panel";
import { removeUserAction, updateUserModelsAction } from "@/features/admin/actions";
import type { ModelRestrictionMode } from "@/server/keys";

export type AdminUserView = {
  id: string;
  username: string;
  keyCount: number;
  modelMode: ModelRestrictionMode;
  models: string[];
  createdAt: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function ModelChip({ item }: Readonly<{ item: AdminUserView }>) {
  if (item.modelMode === "all") {
    return <span className="model-chip is-all">全部模型</span>;
  }

  if (item.modelMode === "allow") {
    return (
      <span className="model-chip is-limited">
        仅允许 {item.models.length} 个
      </span>
    );
  }

  return (
    <span className="model-chip is-limited">排除 {item.models.length} 个</span>
  );
}

export function UserManager({ initialUsers }: Readonly<{ initialUsers: AdminUserView[] }>) {
  const [users, setUsers] = useState(initialUsers);
  const [modelPanelId, setModelPanelId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function removeUser(id: string, username: string, keyCount: number) {
    const keyNote = keyCount > 0 ? `，其 ${keyCount} 把密钥也会一并失效` : "";
    if (!window.confirm(`移除用户“${username}”后${keyNote}，该用户会立即无法登录和连接。确认移除吗？`)) return;
    const formData = new FormData();
    formData.set("id", id);
    setMessage(null);
    startTransition(async () => {
      const result = await removeUserAction(formData);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== id));
      if (modelPanelId === id) setModelPanelId(null);
      setMessage({ kind: "success", text: result.message });
    });
  }

  function toggleModelPanel(id: string) {
    setModelPanelId((current) => (current === id ? null : id));
  }

  function saveModels(subjectId: string, mode: ModelRestrictionMode, models: string[]) {
    const formData = new FormData();
    formData.set("id", subjectId);
    formData.set("mode", mode);
    formData.set("models", JSON.stringify(models));
    setMessage(null);
    startTransition(async () => {
      const result = await updateUserModelsAction(formData);
      if (!result.ok || !result.data) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      const updated = result.data;
      setUsers((current) => current.map((item) => (item.id === subjectId ? updated : item)));
      setModelPanelId(null);
      setMessage({ kind: "success", text: result.message });
    });
  }

  return (
    <>
      {message ? <p className={`form-message ${message.kind === "error" ? "is-error" : "is-success"}`} role="status">{message.text}</p> : null}

      <section className="key-list surface">
        <div className="panel-head">
          <h2>注册用户</h2>
          <span className="count-chip">{users.length} 个账户</span>
        </div>
        {users.length ? (
          <div aria-label="用户列表" className="key-rows" role="table">
            <div className="user-row user-row-head" role="row">
              <span role="columnheader">用户</span><span role="columnheader">密钥</span><span role="columnheader">模型权限</span><span role="columnheader">注册时间</span><span role="columnheader">操作</span>
            </div>
            {users.map((item) => (
              <div className="key-entry" key={item.id}>
                <div className="user-row" role="row">
                  <div className="key-device" role="cell">
                    <span aria-hidden="true" className="user-avatar user-avatar-small">{item.username.slice(0, 1).toUpperCase()}</span>
                    <strong>{item.username}</strong>
                  </div>
                  <span className="user-key-count" role="cell">{item.keyCount} 把</span>
                  <span className="key-models" role="cell"><ModelChip item={item} /></span>
                  <time dateTime={item.createdAt} role="cell">{formatDate(item.createdAt)}</time>
                  <div className="row-actions" role="cell">
                    <button
                      aria-expanded={modelPanelId === item.id}
                      aria-label={`设置 ${item.username} 的模型权限`}
                      className="plain-action"
                      disabled={pending}
                      onClick={() => toggleModelPanel(item.id)}
                      type="button"
                    >
                      {modelPanelId === item.id ? "收起面板" : "模型权限"}
                    </button>
                    <button aria-label={`移除用户 ${item.username}`} className="plain-action is-danger" disabled={pending} onClick={() => removeUser(item.id, item.username, item.keyCount)} type="button">移除</button>
                  </div>
                </div>

                {modelPanelId === item.id ? (
                  <div className="key-expansion">
                    <ModelRestrictionPanel
                      initialMode={item.modelMode}
                      initialModels={item.models}
                      onClose={() => setModelPanelId(null)}
                      onSave={saveModels}
                      pending={pending}
                      subjectId={item.id}
                      subjectName={item.username}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : <EmptyState title="还没有用户" description="新账户注册后会显示在这里。" />}
      </section>
    </>
  );
}
