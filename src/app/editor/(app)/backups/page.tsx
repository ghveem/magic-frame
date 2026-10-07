"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  Upload,
  Clock,
  RefreshCw,
  RotateCcw,
  Trash2,
  Check,
  AlertTriangle,
  Camera,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/i18n/date-locale";
import { useT, useLocale } from "@/lib/i18n/LocaleProvider";

type Snapshot = {
  id: string;
  dashboardId: string;
  dashboardName: string;
  reason: string;
  reasonLabel: string;
  widgetCount: number;
  createdAt: string;
};

type ParsedBackup = {
  raw: any;
  count: number;
  views: { id: string; name: string; widgets: number }[];
};

export default function BackupsPage() {
  const t = useT();
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [, tick] = useState(0);

  // Re-render für „vor X Min." alle 30s
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  async function loadSnapshots() {
    try {
      const r = await fetch("/api/admin/backups/snapshots", { cache: "no-store" });
      const d = await r.json();
      setSnapshots(d.snapshots ?? []);
    } catch {
      setSnapshots([]);
    }
  }
  useEffect(() => {
    loadSnapshots();
  }, []);

  function flash(kind: "ok" | "err", m: string) {
    setMsg({ kind, msg: m });
    setTimeout(() => setMsg(null), 4000);
  }

  async function exportAll() {
    setBusy("export");
    try {
      const r = await fetch("/api/admin/backups/export", { cache: "no-store" });
      if (!r.ok) throw new Error(t("Export fehlgeschlagen."));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `magicframe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash("ok", t("Backup heruntergeladen."));
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function manualSnapshot() {
    setBusy("snap");
    try {
      const r = await fetch("/api/admin/backups/snapshots", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("Fehlgeschlagen."));
      flash("ok", t("Snapshot von {n} View(s) angelegt.").replace("{n}", String(d.count)));
      await loadSnapshots();
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function restore(s: Snapshot) {
    if (!confirm(t("„{name}“ auf diese Version zurücksetzen? Der aktuelle Stand wird vorher als Snapshot gesichert.").replace("{name}", s.dashboardName || s.dashboardId))) return;
    setBusy(s.id);
    try {
      const r = await fetch(`/api/admin/backups/snapshots/${s.id}/restore`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("Fehlgeschlagen."));
      flash("ok", t("„{name}“ wiederhergestellt.").replace("{name}", s.dashboardName || s.dashboardId));
      await loadSnapshots();
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteSnap(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/backups/snapshots/${id}`, { method: "DELETE" });
      await loadSnapshots();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--mf-fg)]/40 mb-2">
            {t("Backups")}
          </div>
          <h1 className="text-3xl font-semibold">{t("Layout-Sicherungen")}</h1>
          <p className="text-[var(--mf-fg)]/50 mt-2 max-w-xl text-sm">
            {t("Kompletter Export aller Views als JSON, Import mit Vorschau, plus automatische Snapshots vor jedem Speichern (1-Klick-Rückkehr).")}
          </p>
        </div>

        {msg && (
          <div className="mb-4">
            <Banner kind={msg.kind} msg={msg.msg} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <ExportCard busy={busy === "export"} onExport={exportAll} />
          <ImportCard
            onDone={(m) => {
              flash("ok", m);
              loadSnapshots();
            }}
            onError={(m) => flash("err", m)}
          />
          <SnapshotInfoCard busy={busy === "snap"} onSnap={manualSnapshot} />
        </div>

        <SnapshotsList
          snapshots={snapshots}
          busy={busy}
          onRestore={restore}
          onDelete={deleteSnap}
        />
      </div>
    </div>
  );
}

function Banner({ kind, msg }: { kind: "ok" | "err"; msg: string }) {
  const t = useT();
  return (
    <div
      className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${
        kind === "ok"
          ? "bg-green-600/10 border-green-500/40 text-green-200"
          : "bg-red-600/10 border-red-500/40 text-red-200"
      }`}
    >
      {kind === "ok" ? <Check size={15} /> : <AlertTriangle size={15} />}
      <span>{t(msg)}</span>
    </div>
  );
}

function CardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="bg-[var(--mf-surface-2)]/60 light:bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 rounded-2xl p-4 flex flex-col">
      <div className="w-9 h-9 rounded-lg bg-[var(--mf-elev)]/5 border border-[var(--mf-bdr)]/10 flex items-center justify-center text-[var(--mf-fg)]/70 mb-3">
        {icon}
      </div>
      <div className="font-semibold">{t(title)}</div>
      {children}
    </div>
  );
}

function ExportCard({ busy, onExport }: { busy: boolean; onExport: () => void }) {
  const t = useT();
  return (
    <CardShell icon={<Download size={16} />} title="Alle Views exportieren">
      <p className="text-xs text-[var(--mf-fg)]/50 mt-1 mb-3 leading-relaxed flex-1">
        {t("Ein JSON-File mit Layouts, Wallpapers & View-Settings. (Ohne globale Secrets wie HA-Token.)")}
      </p>
      <button
        onClick={onExport}
        disabled={busy}
        className="flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
        {t("Exportieren")}
      </button>
    </CardShell>
  );
}

function ImportCard({
  onDone,
  onError,
}: {
  onDone: (m: string) => void;
  onError: (m: string) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [importing, setImporting] = useState(false);

  function pick() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // erlaubt erneutes Wählen derselben Datei
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      if (raw?.magicFrameBackup !== true || !Array.isArray(raw.dashboards)) {
        throw new Error(t("Keine gültige Magic-Frame-Backup-Datei."));
      }
      const views = raw.dashboards.map((d: any) => ({
        id: String(d.id),
        name: d.name || d.id,
        widgets: Array.isArray(d.widgets) ? d.widgets.length : 0,
      }));
      setParsed({ raw, count: views.length, views });
    } catch (err: any) {
      onError(err.message || t("Datei konnte nicht gelesen werden."));
    }
  }

  async function apply() {
    if (!parsed) return;
    if (!confirm(t("{n} View(s) überschreiben? Der aktuelle Stand wird vorher als Snapshot gesichert.").replace("{n}", String(parsed.count)))) return;
    setImporting(true);
    try {
      const r = await fetch("/api/admin/backups/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.raw),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("Import fehlgeschlagen."));
      onDone(t("{n} View(s) importiert.").replace("{n}", String(d.imported?.length ?? parsed.count)));
      setParsed(null);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <CardShell icon={<Upload size={16} />} title="Import">
      <p className="text-xs text-[var(--mf-fg)]/50 mt-1 mb-3 leading-relaxed flex-1">
        {t("Backup-Datei wählen — du siehst eine Vorschau vor dem Überschreiben.")}
      </p>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
      {!parsed ? (
        <button
          onClick={pick}
          className="flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold bg-[var(--mf-elev)]/10 hover:bg-[var(--mf-elev)]/15 text-[var(--mf-fg)]"
        >
          <Upload size={14} /> {t("Datei wählen")}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="bg-[var(--mf-ovl)]/40 light:bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 rounded-lg p-2 max-h-28 overflow-y-auto">
            <div className="text-[11px] text-[var(--mf-fg)]/50 mb-1">{parsed.count} {t("View(s):")}</div>
            {parsed.views.map((v) => (
              <div key={v.id} className="text-xs text-[var(--mf-fg)]/80 flex justify-between gap-2">
                <span className="truncate">{v.name}</span>
                <span className="text-[var(--mf-fg)]/40 shrink-0">{v.widgets} {t("Widgets")}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={apply}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
            >
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {t("Überschreiben")}
            </button>
            <button
              onClick={() => setParsed(null)}
              className="px-3 h-9 rounded-lg text-sm text-[var(--mf-fg)]/60 hover:text-[var(--mf-fg)] bg-[var(--mf-elev)]/5"
            >
              {t("Abbruch")}
            </button>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function SnapshotInfoCard({ busy, onSnap }: { busy: boolean; onSnap: () => void }) {
  const t = useT();
  return (
    <CardShell icon={<Clock size={16} />} title="Auto-Snapshots">
      <p className="text-xs text-[var(--mf-fg)]/50 mt-1 mb-3 leading-relaxed flex-1">
        {t("Vor jedem Speichern wird automatisch eine Version gesichert (letzte 20). Du kannst auch jetzt einen Snapshot anlegen.")}
      </p>
      <button
        onClick={onSnap}
        disabled={busy}
        className="flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold bg-[var(--mf-elev)]/10 hover:bg-[var(--mf-elev)]/15 text-[var(--mf-fg)] disabled:opacity-40"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />}
        {t("Snapshot jetzt")}
      </button>
    </CardShell>
  );
}

function SnapshotsList({
  snapshots,
  busy,
  onRestore,
  onDelete,
}: {
  snapshots: Snapshot[] | null;
  busy: string | null;
  onRestore: (s: Snapshot) => void;
  onDelete: (id: string) => void;
}) {
  const { locale, t } = useLocale();
  if (snapshots === null) {
    return <div className="text-sm text-[var(--mf-fg)]/40">{t("Lade Versionen…")}</div>;
  }
  if (snapshots.length === 0) {
    return (
      <div className="bg-[var(--mf-surface-2)]/60 light:bg-[var(--mf-surface)] border border-dashed border-[var(--mf-bdr)]/15 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[var(--mf-elev)]/5 border border-[var(--mf-bdr)]/10 flex items-center justify-center text-[var(--mf-fg)]/60 mb-4">
          <Archive size={22} />
        </div>
        <h3 className="font-semibold mb-1">{t("Noch keine Versionen")}</h3>
        <p className="text-sm text-[var(--mf-fg)]/50 max-w-md mx-auto">
          {t("Sobald du einen View speicherst, legt das System automatisch einen Snapshot an. Oder klick oben auf „Snapshot jetzt\".")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--mf-fg)]/40 mb-3">
        {t("Versionen")} ({snapshots.length})
      </div>
      <div className="space-y-2">
        {snapshots.map((s) => {
          const isBusy = busy === s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 bg-[var(--mf-surface-2)]/60 light:bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 rounded-xl px-4 py-3"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--mf-elev)]/5 border border-[var(--mf-bdr)]/10 flex items-center justify-center text-[var(--mf-fg)]/60 shrink-0">
                <Clock size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--mf-fg)] truncate">
                  {s.dashboardName || s.dashboardId}
                  <span className="text-[10px] uppercase tracking-wider bg-[var(--mf-elev)]/5 border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)]/40 px-1.5 py-0.5 rounded ml-2">
                    {t(s.reasonLabel)}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--mf-fg)]/40">
                  {s.widgetCount} {t("Widgets")} ·{" "}
                  {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true, locale: dateFnsLocale(locale) })}
                </div>
              </div>
              <button
                onClick={() => onRestore(s)}
                disabled={isBusy}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md px-2.5 h-8 disabled:opacity-40"
              >
                {isBusy ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {t("Wiederherstellen")}
              </button>
              <button
                onClick={() => onDelete(s.id)}
                disabled={isBusy}
                title={t("Snapshot verwerfen")}
                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--mf-fg)]/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
