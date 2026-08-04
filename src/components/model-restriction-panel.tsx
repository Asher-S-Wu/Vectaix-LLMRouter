"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { listUpstreamModelsAction } from "@/features/admin/actions";
import type { ModelRestrictionMode } from "@/server/keys";
import type { UpstreamModel } from "@/server/models/service";

interface ModelRestrictionPanelProps {
  subjectId: string;
  subjectName: string;
  initialMode: ModelRestrictionMode;
  initialModels: string[];
  pending: boolean;
  onSave: (subjectId: string, mode: ModelRestrictionMode, models: string[]) => void;
  onClose: () => void;
}

const MODE_OPTIONS: ReadonlyArray<{
  value: ModelRestrictionMode;
  title: string;
  description: string;
}> = [
  {
    value: "all",
    title: "全部可用",
    description: "不限制，能用 OpenRouter 上的所有模型",
  },
  {
    value: "allow",
    title: "仅允许选中的",
    description: "只有勾选的模型能用，其余一律拒绝",
  },
  {
    value: "exclude",
    title: "排除选中的",
    description: "勾选的模型不能用，其余都能用",
  },
];

export function ModelRestrictionPanel({
  subjectId,
  subjectName,
  initialMode,
  initialModels,
  pending,
  onSave,
  onClose,
}: Readonly<ModelRestrictionPanelProps>) {
  const [mode, setMode] = useState<ModelRestrictionMode>(initialMode);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initialModels),
  );
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<UpstreamModel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  function loadModels(refresh = false) {
    setLoadError(null);
    startLoad(async () => {
      const formData = new FormData();
      if (refresh) formData.set("refresh", "1");
      const result = await listUpstreamModelsAction(formData);
      if (!result.ok || !result.data) {
        setLoadError(result.message);
        return;
      }
      setModels(result.data);
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    startLoad(async () => {
      const result = await listUpstreamModelsAction(new FormData());
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setLoadError(result.message);
        return;
      }
      setModels(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!models) return [];
    const query = search.trim().toLowerCase();
    if (!query) return models;
    return models.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query),
    );
  }, [models, search]);

  function toggle(modelId: string) {
    setLocalError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function selectVisible() {
    setLocalError(null);
    setSelected((current) => {
      const next = new Set(current);
      for (const item of visible) next.add(item.id);
      return next;
    });
  }

  function clearSelection() {
    setLocalError(null);
    setSelected(new Set());
  }

  function save() {
    if (mode !== "all" && selected.size === 0) {
      setLocalError("选择“仅允许”或“排除”时，请至少勾选一个模型");
      return;
    }
    setLocalError(null);
    onSave(subjectId, mode, [...selected]);
  }

  const selectedVisibleCount = visible.filter((item) =>
    selected.has(item.id),
  ).length;

  const saveHint =
    mode === "all"
      ? "保存后，这把密钥可以使用全部模型。"
      : mode === "allow"
        ? `保存后，这把密钥只能使用选中的 ${selected.size} 个模型。`
        : `保存后，选中的 ${selected.size} 个模型将被这把密钥禁用。`;

  return (
    <div className="model-panel">
      <div className="model-panel-head">
        <h3>“{subjectName}”的模型权限</h3>
        <button
          aria-label="关闭模型权限设置"
          className="plain-action"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>

      <div aria-label="模型权限模式" className="model-modes" role="radiogroup">
        {MODE_OPTIONS.map((option) => (
          <label
            className={`model-mode-card ${mode === option.value ? "is-active" : ""}`}
            key={option.value}
          >
            <input
              checked={mode === option.value}
              name={`model-mode-${subjectId}`}
              onChange={() => {
                setMode(option.value);
                setLocalError(null);
              }}
              type="radio"
            />
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>

      {mode !== "all" ? (
        <>
          <div className="model-toolbar">
            <input
              aria-label="搜索模型"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模型 ID 或名称，比如 gpt 或 claude"
              type="search"
              value={search}
            />
            <button
              className="button button-secondary button-compact"
              disabled={loading}
              onClick={() => loadModels(true)}
              title="从 OpenRouter 重新获取最新模型列表"
              type="button"
            >
              {loading ? "刷新中…" : "刷新列表"}
            </button>
          </div>

          <div className="model-list-meta">
            <span>
              已选 <strong>{selected.size}</strong> 个模型
              {search.trim()
                ? `，当前筛选出 ${visible.length} 个（其中已选 ${selectedVisibleCount} 个）`
                : ""}
            </span>
            <span className="model-list-actions">
              <button
                className="plain-action"
                disabled={loading || visible.length === 0}
                onClick={selectVisible}
                type="button"
              >
                选中筛选结果
              </button>
              <button
                className="plain-action"
                disabled={selected.size === 0}
                onClick={clearSelection}
                type="button"
              >
                清空已选
              </button>
            </span>
          </div>

          {loadError ? (
            <div className="model-list-state">
              <p>{loadError}</p>
              <button
                className="button button-secondary button-compact"
                disabled={loading}
                onClick={() => loadModels()}
                type="button"
              >
                重试
              </button>
            </div>
          ) : models === null ? (
            <div className="model-list-state">
              <p>正在从 OpenRouter 获取模型列表…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="model-list-state">
              <p>没有匹配“{search.trim()}”的模型，换个关键词试试。</p>
            </div>
          ) : (
            <ul className="model-list">
              {visible.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={`model-item ${checked ? "is-checked" : ""}`}
                    >
                      <input
                        checked={checked}
                        onChange={() => toggle(item.id)}
                        type="checkbox"
                      />
                      <span className="model-item-text">
                        <code>{item.id}</code>
                        {item.name !== item.id ? <small>{item.name}</small> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="model-all-note">
          这把密钥当前不限模型。如果想控制它能用哪些模型，请选择上面另外两种模式。
        </p>
      )}

      {localError ? (
        <p className="form-message is-error" role="alert">
          {localError}
        </p>
      ) : null}

      <div className="model-panel-foot">
        <div className="model-panel-actions">
          <button
            className="button button-primary button-compact"
            disabled={pending || loading || (mode !== "all" && models === null)}
            onClick={save}
            type="button"
          >
            {pending ? "正在保存…" : "保存设置"}
          </button>
          <button
            className="button button-secondary button-compact"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
        </div>
        <p className="model-save-hint">{saveHint}</p>
      </div>
    </div>
  );
}
