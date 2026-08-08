import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

type View = "summary" | "users" | "readings" | "contributions" | "ai" | "errors" | "config";
type JsonRecord = Record<string, unknown>;

function itemList(data: unknown): JsonRecord[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object") : [];
}

export function AdminPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("summary");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null); setError("");
    void api(`/api/v1/admin/${view}`).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : t("common.error")));
  }, [view, revision, t]);
  const tabs: Array<[View, string]> = [
    ["summary", "admin.summary"], ["users", "admin.users"], ["readings", "admin.readings"],
    ["contributions", "admin.contributions"], ["ai", "admin.ai"], ["errors", "common.error"], ["config", "admin.config"],
  ];
  const setUserStatus = async (id: string, status: "active" | "suspended") => {
    await api(`/api/v1/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    setRevision((value) => value + 1);
  };
  return <section className="page admin-page">
    <header className="page-header"><div><p className="eyebrow">{t("admin.eyebrow")}</p><h1>{t("admin.title")}</h1><p>{t("admin.noContent")}</p></div></header>
    <div className="admin-tabs">{tabs.map(([key, label]) => <button className={view === key ? "active" : ""} key={key} onClick={() => setView(key)}>{t(label)}</button>)}</div>
    <div className="glass-panel admin-data">
      {error ? <p className="form-error">{error}</p> : !data ? <p>{t("common.loading")}</p>
        : view === "users" ? <UsersTable items={itemList(data)} onStatus={setUserStatus} />
          : view === "contributions" ? <ContributionsTable items={itemList(data)} />
            : view === "config" ? <ConfigEditor key={revision} items={itemList(data)} onSaved={() => setRevision((value) => value + 1)} />
              : <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  </section>;
}

function UsersTable({ items, onStatus }: { items: JsonRecord[]; onStatus: (id: string, status: "active" | "suspended") => Promise<void> }) {
  const { t } = useTranslation();
  return <div className="admin-table-wrap"><table><thead><tr><th>{t("ops.email")}</th><th>{t("ops.role")}</th><th>{t("ops.status")}</th><th /></tr></thead><tbody>{items.map((item) => {
    const id = String(item.id); const status = String(item.status);
    return <tr key={id}><td>{String(item.email)}</td><td>{String(item.role)}</td><td>{status}</td><td><button className="button quiet" onClick={() => void onStatus(id, status === "suspended" ? "active" : "suspended")}>{t(status === "suspended" ? "ops.activate" : "ops.suspend")}</button></td></tr>;
  })}</tbody></table></div>;
}

function ContributionsTable({ items }: { items: JsonRecord[] }) {
  const { t } = useTranslation();
  return <div className="admin-table-wrap"><table><thead><tr><th>{t("ops.id")}</th><th>HKD</th><th>{t("ops.status")}</th><th>Stripe</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td><code>{String(item.id)}</code></td><td>{String(item.amount_hkd)}</td><td>{String(item.status)}</td><td>{typeof item.stripeDashboardUrl === "string" && <a href={item.stripeDashboardUrl} target="_blank" rel="noreferrer">{t("ops.dashboard")} ↗</a>}</td></tr>)}</tbody></table></div>;
}

function ConfigEditor({ items, onSaved }: { items: JsonRecord[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const initial = useMemo(() => new Map(items.map((item) => [String(item.key), String(item.value)])), [items]);
  const [enabled, setEnabled] = useState(initial.get("global_ai_enabled") === "true");
  const [tokens, setTokens] = useState(Number(initial.get("global_daily_token_budget") ?? 250000));
  const [spend, setSpend] = useState(Number(initial.get("global_daily_spend_micros") ?? 10000000));
  const [concurrency, setConcurrency] = useState(Number(initial.get("global_ai_max_concurrency") ?? 8));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/v1/admin/config", { method: "PATCH", body: JSON.stringify({ globalAiEnabled: enabled, globalDailyTokenBudget: tokens, globalDailySpendMicros: spend, globalAiMaxConcurrency: concurrency }) });
      onSaved();
    } finally { setBusy(false); }
  };
  return <div className="admin-config-form">
    <label className="check-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>{t("ops.aiEnabled")}</span></label>
    <label className="field"><span>{t("ops.tokens")}</span><input type="number" min="1" value={tokens} onChange={(event) => setTokens(Number(event.target.value))} /></label>
    <label className="field"><span>{t("ops.spend")}</span><input type="number" min="1" value={spend} onChange={(event) => setSpend(Number(event.target.value))} /></label>
    <label className="field"><span>{t("ops.concurrency")}</span><input type="number" min="1" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} /></label>
    <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? t("ops.saving") : t("ops.save")}</button>
  </div>;
}
