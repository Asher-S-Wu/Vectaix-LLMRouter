import type { Metadata } from "next";

import { KeyManager } from "@/components/key-manager";
import { PageHeading } from "@/components/page-heading";
import {
  createMyKeyAction,
  removeMyKeyAction,
  renameMyKeyAction,
  revealMyKeyAction,
} from "@/features/portal/actions";
import { listProxyKeys } from "@/server/keys/service";
import { getCurrentUser } from "@/server/portal/queries";

export const metadata: Metadata = { title: "我的密钥" };
export const dynamic = "force-dynamic";

export default async function MyKeysPage() {
  const user = await getCurrentUser();
  const keys = await listProxyKeys(user.id);

  const modelSummary =
    user.modelMode === "all"
      ? { chipClass: "model-chip is-all", chipText: "全部模型", note: "你的账户当前不限模型，OpenRouter 上的所有模型都可以使用。" }
      : user.modelMode === "allow"
        ? { chipClass: "model-chip is-limited", chipText: `仅允许 ${user.models.length} 个`, note: "管理员为你的账户设置了模型白名单，只有清单里的模型可以使用。" }
        : { chipClass: "model-chip is-limited", chipText: `排除 ${user.models.length} 个`, note: "清单里的模型对你的账户不可用，其余模型都可以正常使用。" };

  return (
    <div className="page-wrap keys-page">
      <PageHeading
        description="给每台设备发一把独立的密钥，随时查看复制，不用了随时可以移除。"
        title="我的密钥"
      />

      <section className="my-models surface">
        <div className="my-models-summary">
          <div>
            <h2>我的可用模型</h2>
            <p>{modelSummary.note}模型权限由管理员统一设置。</p>
          </div>
          <span className={modelSummary.chipClass}>{modelSummary.chipText}</span>
        </div>
        {user.modelMode !== "all" ? (
          <details className="my-models-detail">
            <summary>查看具体清单（{user.models.length} 个模型）</summary>
            <ul className="my-models-list">
              {user.models.map((model) => (
                <li key={model}><code>{model}</code></li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <KeyManager
        createAction={createMyKeyAction}
        initialKeys={keys}
        removeAction={removeMyKeyAction}
        renameAction={renameMyKeyAction}
        revealAction={revealMyKeyAction}
      />
    </div>
  );
}
