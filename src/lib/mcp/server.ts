import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { McpAuth } from "@/lib/mcp/auth";
import { teachError, jsonResult } from "@/lib/mcp/errors";
import { widgetCatalog } from "@/lib/mcp/catalog";
import { prisma } from "@/lib/companion/prisma";
import { readViewLayout } from "@/lib/layout/read";
import { applyLayoutSync } from "@/lib/layout/apply";
import { layoutSyncBodySchema } from "@/lib/widgets/schemas";
import {
  createView,
  duplicateView,
  renameView,
  deleteView,
  ViewManageError,
} from "@/lib/views/manage";
import { createSnapshot, restoreSnapshot } from "@/lib/backups/snapshots";
import { getAppSettings } from "@/lib/settings/store";
import { isAddonMode } from "@/lib/runtime/addon";
import { listViewClients } from "@/lib/view-clients/store";
import {
  mayActOn,
  mayCallService,
  allowedEntities,
} from "@/lib/ha/action-policy";
import { createMessage, listActiveMessages, dismissMessage } from "@/lib/companion/messages";
import { addItems, listItems, setItemChecked, clearChecked } from "@/lib/companion/shopping";
import { createTodo, listTodos, setTodoDone } from "@/lib/companion/todos";
import { createTimer, listActiveTimers, dismissTimer } from "@/lib/timers/store";

/**
 * Baut den MCP-Server für EINE Anfrage. Stateless: jede Anfrage bekommt eine
 * frische Instanz, aller Zustand liegt in Postgres. Die Werkzeuge werden nach
 * Rolle registriert — ein Viewer-Token sieht die Einrichtungs-Werkzeuge gar
 * nicht erst, `tools/list` ist damit ehrlich.
 */
export function buildMcpServer(auth: McpAuth): McpServer {
  const server = new McpServer({ name: "magic-frame", version: "1.1.0" });
  const isAdmin = auth.role === "admin";

  const listViewIdsHint = async () => {
    const views = await prisma.dashboard.findMany({ select: { id: true } });
    return `Valid view ids: ${views.map((v) => v.id).join(", ") || "(none yet)"}.`;
  };

  const viewExists = async (id: string) =>
    !!(await prisma.dashboard.findUnique({ where: { id }, select: { id: true } }));

  // Dieselben Ereignisse wie die Companion-Routen, damit die Widgets ohne
  // Neuladen nachziehen. Ohne Socket-Server (Skript, Test) bleibt es still.
  const emit = (event: string, payload?: unknown) => {
    const io = (global as any).LIVE_SYNC_IO;
    if (!io) return;
    if (payload === undefined) io.emit(event);
    else io.emit(event, payload);
  };

  // ── LESEN (Viewer + Admin) ────────────────────────────────────────────────

  server.registerTool(
    "get_widget_catalog",
    {
      description:
        "The widget vocabulary. Call with no argument for the list of widget types and the grid rules; call with a type (e.g. \"ClockWidget.tsx\") for that widget's exact config schema. Always fetch a type's schema before configuring it.",
      inputSchema: { type: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ type }) => jsonResult(await widgetCatalog(type)),
  );

  server.registerTool(
    "list_views",
    {
      description: "Every view (dashboard) in this installation, with its id, name, orientation and widget count. A view's id is what appears in its /view/<id> address.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const views = await prisma.dashboard.findMany({
        select: { id: true, name: true, settings: true, _count: { select: { widgets: true } } },
        orderBy: { id: "asc" },
      });
      return jsonResult(
        views.map((v) => ({
          id: v.id,
          name: v.name,
          orientation: (v.settings as any)?.orientation === "landscape" ? "landscape" : "portrait",
          widgetCount: v._count.widgets,
        })),
      );
    },
  );

  server.registerTool(
    "get_view",
    {
      description: "The full layout of one view: every widget with its geometry and config, plus the wallpaper and view settings. layout is null when the view does not exist, [] when it is deliberately empty.",
      inputSchema: { dashboardId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId }) => {
      const view = await readViewLayout(dashboardId);
      if (view.layout === null) {
        return teachError(`View "${dashboardId}" does not exist`, await listViewIdsHint());
      }
      return jsonResult(view);
    },
  );

  server.registerTool(
    "get_settings",
    {
      description: "What is wired up on this installation — Home Assistant, Immich, Todoist, weather key, default language, version. Secrets are reported only as booleans, never their values.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const s = await getAppSettings();
      return jsonResult({
        haConfigured: !!(s.haUrl && s.haToken),
        immichConfigured: !!(s.immichUrl && s.immichApiKey),
        addonMode: isAddonMode(),
        note: isAddonMode()
          ? "Home Assistant credentials are managed by the Supervisor in add-on mode and are read-only here."
          : undefined,
      });
    },
  );

  server.registerTool(
    "list_ha_entities",
    {
      description: "Home Assistant entities this installation can see, for filling entity ids into widgets. Filter with domain (e.g. \"light\") or a search string — the unfiltered list can be very large.",
      inputSchema: {
        domain: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ domain, search, limit }) => {
      const s = await getAppSettings();
      if (!s.haUrl || !s.haToken) {
        return teachError("Home Assistant is not configured", "Connect it in the editor under Integrations first.");
      }
      try {
        const res = await fetch(`${s.haUrl.replace(/\/+$/, "")}/api/states`, {
          headers: { Authorization: `Bearer ${s.haToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return teachError(`Home Assistant answered ${res.status}`, "Check the URL and token in Integrations.");
        let list = (await res.json()) as Array<{ entity_id: string; state: string; attributes?: any }>;
        if (domain) list = list.filter((e) => e.entity_id.startsWith(`${domain}.`));
        if (search) {
          const q = search.toLowerCase();
          list = list.filter(
            (e) => e.entity_id.toLowerCase().includes(q) || String(e.attributes?.friendly_name || "").toLowerCase().includes(q),
          );
        }
        return jsonResult({
          total: list.length,
          entities: list.slice(0, limit).map((e) => ({
            entity_id: e.entity_id,
            friendly_name: e.attributes?.friendly_name ?? null,
            state: e.state,
          })),
        });
      } catch (e: any) {
        return teachError("Could not reach Home Assistant", e?.message || "unknown error");
      }
    },
  );

  server.registerTool(
    "diagnose_ha_action",
    {
      description: "Why a login-free display would or would not be allowed to act on an entity. Read-only: evaluates the same allowlist /api/ha/action enforces, and explains the verdict — the answer to \"why does this button do nothing on the wall\".",
      inputSchema: {
        entityId: z.string(),
        domain: z.string().optional(),
        service: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ entityId, domain, service }) => {
      const entityOk = await mayActOn(entityId);
      const allowed = await allowedEntities();
      const serviceOk = domain && service ? await mayCallService(domain, service) : undefined;
      const reasons: string[] = [];
      if (!entityOk) reasons.push(`Entity "${entityId}" is on no saved view, so a display may not act on it. Place it on a view and save, then it is allowed within ~30 s.`);
      if (serviceOk === false) reasons.push(`Service "${domain}.${service}" is not one the widgets emit and is not saved on any Button widget.`);
      if (allowed.has("*")) reasons.push("Note: the allowlist is currently in fail-open mode (the database was unreachable when it was last built).");
      return jsonResult({
        entityAllowed: entityOk,
        serviceAllowed: serviceOk,
        verdict: entityOk && serviceOk !== false ? "would be allowed" : "would be refused",
        reasons: reasons.length ? reasons : ["No problem found — a display could perform this."],
      });
    },
  );

  server.registerTool(
    "list_snapshots",
    {
      description: "The saved snapshots (restore points) per view, newest first. Up to 20 per view are kept; auto-saves are pruned before hand-made ones.",
      inputSchema: { dashboardId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId }) => {
      const snaps = await prisma.snapshot.findMany({
        where: dashboardId ? { dashboardId } : undefined,
        select: { id: true, dashboardId: true, reason: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return jsonResult(snaps);
    },
  );

  server.registerTool(
    "list_displays",
    {
      description: "Which physical displays are currently showing a view, with their screen sizes. Use it to see what would change before control_displays.",
      inputSchema: { dashboardId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId }) => jsonResult(listViewClients(dashboardId)),
  );

  server.registerTool(
    "browse_immich_albums",
    {
      description: "The albums in the installation's Immich connection, with ids, so set_wallpaper can point at one (\"rotate the holiday album\"). Needs Immich configured in Integrations.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const s = await getAppSettings();
      if (!s.immichUrl || !s.immichApiKey) {
        return teachError("Immich is not configured", "Connect it in the editor under Integrations first.");
      }
      try {
        const res = await fetch(`${s.immichUrl.replace(/\/+$/, "")}/api/albums`, {
          headers: { "x-api-key": s.immichApiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return teachError(`Immich answered ${res.status}`, "Check the URL and API key in Integrations.");
        const data = await res.json();
        return jsonResult(
          (Array.isArray(data) ? data : []).map((a: any) => ({
            id: a.id,
            name: a.albumName,
            assetCount: a.assetCount,
          })),
        );
      } catch (e: any) {
        return teachError("Could not reach Immich", e?.message || "unknown error");
      }
    },
  );

  // ── HAUSHALT (jeder Token) ────────────────────────────────────────────────
  // Dieselben Rechte wie die Companion-Routen: Nachrichten, Einkaufsliste,
  // To-dos und Timer gehören dem Haushalt, nicht der Einrichtung. Wer sie per
  // HTTP mit seinem Token schreiben darf, darf es hier auch — ein Viewer also
  // ebenso. Ansichten, Hintergründe und Displays bleiben beim Admin.

  server.registerTool(
    "list_messages",
    {
      description: "The notes the displays' Messages widget currently shows, newest first. With dashboardId, only the ones that view shows: notes for every view plus notes for that one.",
      inputSchema: { dashboardId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId }) => jsonResult(await listActiveMessages({ dashboardId })),
  );

  server.registerTool(
    "post_message",
    {
      description: "Put a note on the displays' Messages widget, e.g. \"Dinner at seven\". Without dashboardId every view shows it. With ttlMinutes it disappears by itself; without, it stays until someone dismisses it. imageUrl adds a picture by its http(s) address.",
      inputSchema: {
        text: z.string(),
        dashboardId: z.string().optional(),
        ttlMinutes: z.number().int().min(1).max(10080).optional(),
        imageUrl: z.string().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ text, dashboardId, ttlMinutes, imageUrl }) => {
      if (!text.trim()) return teachError("The note is empty", "Pass the text to show.");
      if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
        return teachError("imageUrl is not a web address", "Pass a picture's http:// or https:// address, or leave it out.");
      }
      if (dashboardId && !(await viewExists(dashboardId))) {
        return teachError(`View "${dashboardId}" does not exist`, await listViewIdsHint());
      }
      const message = await createMessage({
        userId: auth.userId,
        text,
        imageUrl: imageUrl ?? null,
        targetDashboardId: dashboardId ?? null,
        ttlSec: ttlMinutes ? ttlMinutes * 60 : null,
      });
      emit("MESSAGE_POSTED", message);
      return jsonResult({ ok: true, message });
    },
  );

  server.registerTool(
    "dismiss_message",
    {
      description: "Take a note off the displays, the same as tapping its cross. Ids come from list_messages.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      try {
        await dismissMessage(id);
      } catch {
        return teachError(`No message "${id}"`, "Call list_messages for valid ids.");
      }
      emit("MESSAGE_DISMISSED", { id });
      return jsonResult({ ok: true, id });
    },
  );

  server.registerTool(
    "list_shopping",
    {
      description: "The household shopping list kept in Magic Frame itself (the widgets' Local source): open items first, then items ticked off in the last 24 hours. A widget set to a Home Assistant or Todoist list keeps its items there, out of reach of these tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => jsonResult(await listItems()),
  );

  server.registerTool(
    "add_shopping_items",
    {
      description: "Add one or more items to the shopping list. Every display's Shopping list widget shows them within a second.",
      inputSchema: { items: z.array(z.string()).min(1).max(50) },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ items }) => {
      const texts = items.map((s) => s.trim()).filter(Boolean);
      if (!texts.length) return teachError("No item given", "Pass at least one item with text.");
      const created = await addItems({ userId: auth.userId, texts });
      emit("SHOPPING_UPDATED");
      return jsonResult({ ok: true, items: created });
    },
  );

  server.registerTool(
    "check_shopping_item",
    {
      description: "Tick an item off the shopping list (checked: true, the default) or put it back (checked: false). Calling it twice changes nothing. Ids come from list_shopping.",
      inputSchema: { id: z.string(), checked: z.boolean().default(true) },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ id, checked }) => {
      const item = await setItemChecked(id, checked);
      if (!item) return teachError(`No shopping item "${id}"`, "Call list_shopping for valid ids.");
      emit("SHOPPING_UPDATED");
      return jsonResult({ ok: true, item });
    },
  );

  server.registerTool(
    "clear_checked_shopping",
    {
      description: "Remove every ticked-off item from the shopping list, like the widget's clear button. Open items stay.",
      inputSchema: {},
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async () => {
      await clearChecked();
      emit("SHOPPING_UPDATED");
      return jsonResult({ ok: true });
    },
  );

  server.registerTool(
    "list_todos",
    {
      description: "Open household to-dos kept in Magic Frame itself (the widgets' Local source), the ones due soonest first. assignee narrows to one person's; includeDoneHours also returns the ones finished in the last N hours. Home Assistant and Todoist lists are out of reach of these tools.",
      inputSchema: {
        assignee: z.string().optional(),
        includeDoneHours: z.number().int().min(1).max(168).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ assignee, includeDoneHours }) => jsonResult(await listTodos({ assignee, includeDoneHours })),
  );

  server.registerTool(
    "add_todo",
    {
      description: "Add a household to-do. assignee is a free-text name the To-dos widget shows beside it; dueDate is ISO 8601, a day (\"2026-10-21\") or a moment (\"2026-10-21T18:00:00Z\").",
      inputSchema: {
        title: z.string(),
        assignee: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(["low", "normal", "high"]).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ title, assignee, dueDate, priority }) => {
      if (!title.trim()) return teachError("The title is empty", "Pass what needs doing.");
      let due: Date | null = null;
      if (dueDate) {
        due = new Date(dueDate);
        if (isNaN(due.getTime())) {
          return teachError(`"${dueDate}" is not a date`, "Use ISO 8601, e.g. 2026-10-21 or 2026-10-21T18:00:00Z.");
        }
      }
      const todo = await createTodo({
        userId: auth.userId,
        title: title.trim(),
        assignee: assignee?.trim() || null,
        dueDate: due,
        priority: priority ?? "normal",
      });
      emit("TODOS_UPDATED");
      return jsonResult({ ok: true, todo });
    },
  );

  server.registerTool(
    "complete_todo",
    {
      description: "Mark a to-do done (done: true, the default) or open it again (done: false). Calling it twice changes nothing. Ids come from list_todos.",
      inputSchema: { id: z.string(), done: z.boolean().default(true) },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ id, done }) => {
      const todo = await setTodoDone(id, done);
      if (!todo) return teachError(`No to-do "${id}"`, "Call list_todos for valid ids.");
      emit("TODOS_UPDATED");
      return jsonResult({ ok: true, todo });
    },
  );

  server.registerTool(
    "list_timers",
    {
      description: "The timers running or ringing on the displays. With dashboardId, only the ones that view shows.",
      inputSchema: { dashboardId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId }) => jsonResult(await listActiveTimers({ dashboardId })),
  );

  server.registerTool(
    "start_timer",
    {
      description: "Start a countdown on the displays' Timer widget, e.g. label \"Pasta\", minutes 10. Without dashboardId every view shows it. At most 24 hours.",
      inputSchema: {
        label: z.string().optional(),
        minutes: z.number().min(0).max(1440).optional(),
        seconds: z.number().min(0).max(86400).optional(),
        dashboardId: z.string().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ label, minutes, seconds, dashboardId }) => {
      const durationMs = Math.round((minutes ?? 0) * 60_000 + (seconds ?? 0) * 1000);
      if (durationMs < 1000) return teachError("The timer has no duration", "Pass minutes and/or seconds, one second at least.");
      if (dashboardId && !(await viewExists(dashboardId))) {
        return teachError(`View "${dashboardId}" does not exist`, await listViewIdsHint());
      }
      const timer = await createTimer({
        userId: auth.userId,
        label: (label?.trim() || "Timer").slice(0, 40),
        durationMs: Math.min(durationMs, 24 * 60 * 60 * 1000),
        targetDashboardId: dashboardId ?? null,
      });
      emit("TIMER_STARTED", timer);
      return jsonResult({ ok: true, timer });
    },
  );

  server.registerTool(
    "stop_timer",
    {
      description: "Stop a timer and take it off the displays, the same as dismissing it there. Ids come from list_timers.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      try {
        await dismissTimer(id);
      } catch {
        return teachError(`No timer "${id}"`, "Call list_timers for valid ids.");
      }
      emit("TIMER_DISMISSED", { id });
      return jsonResult({ ok: true, id });
    },
  );

  // ── SCHREIBEN (nur Admin) ─────────────────────────────────────────────────

  if (isAdmin) {
    const opSchema = z.discriminatedUnion("op", [
      // Bewusst locker: das SDK lehnt inputSchema-Verstösse selbst ab, mit
      // einem Protokollfehler statt unserer erklärenden Meldung. Die echte
      // Prüfung passiert unten gegen layoutSyncBodySchema — dort können wir
      // sagen, WAS falsch war und WO das richtige Schema steht. Ausserdem ist
      // `i` hier optional, damit der Server die ID vergeben kann.
      z.object({
        op: z.literal("add"),
        widget: z.object({ type: z.string(), i: z.string().optional() }).catchall(z.unknown()),
      }),
      z.object({ op: z.literal("update"), i: z.string(), patch: z.record(z.string(), z.unknown()) }),
      z.object({ op: z.literal("move"), i: z.string(), x: z.number().int().optional(), y: z.number().int().optional(), w: z.number().int().optional(), h: z.number().int().optional() }),
      z.object({ op: z.literal("remove"), i: z.string() }),
    ]);

    server.registerTool(
      "edit_widgets",
      {
        description:
          "Add, update, move or remove widgets on a view. Batch ALL edits for one request into a single call — each call takes one snapshot and refreshes the displays once. Ids you add are optional; the server assigns one. Read the result with get_view: stored ids carry the view prefix.",
        inputSchema: { dashboardId: z.string(), operations: z.array(opSchema).min(1) },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async ({ dashboardId, operations }) => {
        const view = await readViewLayout(dashboardId);
        if (view.layout === null) return teachError(`View "${dashboardId}" does not exist`, await listViewIdsHint());
        const layout = view.layout as Array<Record<string, any>>;

        const taken = new Set(layout.map((w) => String(w.i)));
        const prefixed = (i: string) => (i.startsWith(`${dashboardId}_`) ? i : `${dashboardId}_${i}`);

        for (const op of operations) {
          if (op.op === "add") {
            const w: any = { ...op.widget };
            if (!w.i) {
              // Server-vergebene ID: so lange würfeln, bis sie frei ist. Der
              // Agent muss die Vergabe nicht kennen und kann nicht kollidieren.
              do {
                w.i = `w${Math.random().toString(36).slice(2, 9)}`;
              } while (taken.has(w.i) || taken.has(prefixed(w.i)));
            } else if (taken.has(String(w.i)) || taken.has(prefixed(String(w.i)))) {
              // Sonst stirbt es erst tief in der Pipeline am Primärschlüssel,
              // mit einer Meldung über Präfixe, die niemandem hilft. Eine neu
              // angelegte Ansicht bringt clk/cal/wth schon mit — genau hier
              // läuft ein Agent als Erstes hinein.
              return teachError(
                `A widget with id "${w.i}" already exists on view "${dashboardId}"`,
                `Leave "i" out and the server assigns a free id, or pick another. Present ids: ${[...taken].join(", ")}.`,
              );
            }
            taken.add(String(w.i));
            taken.add(prefixed(String(w.i)));
            layout.push(w);
          } else {
            const idx = layout.findIndex((w) => w.i === op.i || w.i === `${dashboardId}_${op.i}`);
            if (idx < 0) {
              return teachError(
                `No widget "${op.i}" on view "${dashboardId}"`,
                `Widgets on this view: ${layout.map((w) => w.i).join(", ") || "(none)"}.`,
              );
            }
            if (op.op === "remove") layout.splice(idx, 1);
            else if (op.op === "move") {
              for (const k of ["x", "y", "w", "h"] as const) if (op[k] !== undefined) layout[idx][k] = op[k];
            } else if (op.op === "update") {
              layout[idx].config = { ...(layout[idx].config || {}), ...op.patch };
            }
          }
        }

        const parsed = layoutSyncBodySchema.safeParse({
          dashboardId,
          layout,
          wallpaper: view.wallpaper,
          settings: view.settings,
        });
        if (!parsed.success) {
          return teachError(
            "The edited layout does not validate",
            "Call get_widget_catalog with the widget's type for its exact schema.",
            parsed.error.flatten(),
          );
        }
        try {
          await applyLayoutSync(parsed.data);
        } catch (e: any) {
          return teachError("Could not save the layout", e?.message || "unknown error");
        }
        return jsonResult({ ok: true, dashboardId, widgetCount: layout.length });
      },
    );

    server.registerTool(
      "replace_view_layout",
      {
        description: "Replace a view's entire layout in one write — for redesigns where reading first is noise. Everything not included is removed. Consider create_snapshot first.",
        inputSchema: {
          dashboardId: z.string(),
          // Ebenfalls locker — siehe edit_widgets: die echte Prüfung mit
          // erklärendem Fehler passiert gegen layoutSyncBodySchema.
          layout: z.array(z.object({ type: z.string() }).catchall(z.unknown())),
          wallpaper: z.object({}).catchall(z.unknown()).optional(),
          settings: z.record(z.string(), z.unknown()).optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true },
      },
      async ({ dashboardId, layout, wallpaper, settings }) => {
        const parsed = layoutSyncBodySchema.safeParse({ dashboardId, layout, wallpaper, settings });
        if (!parsed.success) {
          return teachError("The layout does not validate", "Fetch each widget type's schema with get_widget_catalog.", parsed.error.flatten());
        }
        try {
          await applyLayoutSync(parsed.data);
        } catch (e: any) {
          return teachError("Could not save the layout", e?.message || "unknown error");
        }
        return jsonResult({ ok: true, dashboardId, widgetCount: layout.length });
      },
    );

    server.registerTool(
      "set_wallpaper",
      {
        description: "Change only a view's wallpaper, leaving its widgets untouched. Use browse_immich_albums to get an album id for an Immich source.",
        inputSchema: { dashboardId: z.string(), wallpaper: z.object({}).catchall(z.unknown()) },
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ dashboardId, wallpaper }) => {
        const view = await readViewLayout(dashboardId);
        if (view.layout === null) return teachError(`View "${dashboardId}" does not exist`, await listViewIdsHint());
        const parsed = layoutSyncBodySchema.safeParse({ dashboardId, layout: view.layout, wallpaper, settings: view.settings });
        if (!parsed.success) return teachError("The wallpaper does not validate", "See wallpaperSchema fields.", parsed.error.flatten());
        try {
          await applyLayoutSync(parsed.data);
        } catch (e: any) {
          return teachError("Could not save the wallpaper", e?.message || "unknown error");
        }
        return jsonResult({ ok: true, dashboardId });
      },
    );

    server.registerTool(
      "manage_view",
      {
        description: "Create, duplicate, rename or delete a whole view. delete needs confirm: true. Button targets are carried across duplicate and rename automatically.",
        inputSchema: {
          action: z.enum(["create", "duplicate", "rename", "delete"]),
          id: z.string().optional(),
          sourceId: z.string().optional(),
          oldId: z.string().optional(),
          name: z.string().optional(),
          orientation: z.enum(["portrait", "landscape"]).optional(),
          confirm: z.boolean().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      async ({ action, id, sourceId, oldId, name, orientation, confirm }) => {
        try {
          if (action === "create") {
            if (!id || !name) return teachError("create needs id and name", "Pass both.");
            const newId = await createView(id, name, orientation || "portrait");
            return jsonResult({ ok: true, action, id: newId });
          }
          if (action === "duplicate") {
            if (!sourceId || !id || !name) return teachError("duplicate needs sourceId, id and name", "Pass all three.");
            const newId = await duplicateView(sourceId, id, name);
            return jsonResult({ ok: true, action, id: newId });
          }
          if (action === "rename") {
            if (!oldId || !id || !name) return teachError("rename needs oldId, id and name", "Pass all three.");
            const newId = await renameView(oldId, id, name);
            return jsonResult({ ok: true, action, id: newId });
          }
          // delete
          if (!id) return teachError("delete needs id", await listViewIdsHint());
          if (!confirm) {
            const view = await readViewLayout(id);
            if (view.layout === null) return teachError(`View "${id}" does not exist`, await listViewIdsHint());
            return teachError(
              `Deleting view "${id}" removes ${view.layout.length} widget(s) and cannot be undone`,
              "Call again with confirm: true to proceed.",
            );
          }
          await deleteView(id);
          return jsonResult({ ok: true, action, id });
        } catch (e: any) {
          if (e instanceof ViewManageError) return teachError(e.message, await listViewIdsHint());
          return teachError("View operation failed", e?.message || "unknown error");
        }
      },
    );

    server.registerTool(
      "create_snapshot",
      {
        description: "Save a restore point of a view before a multi-step change. Call this first when you are about to make several edits.",
        inputSchema: { dashboardId: z.string(), label: z.string().default("mcp-manual") },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async ({ dashboardId, label }) => {
        try {
          await createSnapshot(dashboardId, label);
          return jsonResult({ ok: true, dashboardId, label });
        } catch (e: any) {
          return teachError("Could not create the snapshot", e?.message || "unknown error");
        }
      },
    );

    server.registerTool(
      "restore_snapshot",
      {
        description: "Roll a view back to a saved snapshot. Takes its own pre-restore snapshot first, and refreshes the displays. Needs confirm: true.",
        inputSchema: { snapshotId: z.string(), confirm: z.boolean() },
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      async ({ snapshotId, confirm }) => {
        if (!confirm) return teachError("restore_snapshot needs confirm: true", "This overwrites the view's current widgets. A pre-restore snapshot is taken automatically.");
        const ok = await restoreSnapshot(snapshotId);
        if (!ok) return teachError(`Snapshot "${snapshotId}" not found`, "Call list_snapshots for valid ids.");
        // restoreSnapshot pingt die Displays nicht selbst — die Editor-Route
        // macht das getrennt, also hier genauso, sonst zeigt die Wand den
        // alten Stand bis zum nächsten Neuladen.
        (global as any).LIVE_SYNC_IO?.emit("LAYOUT_UPDATED");
        return jsonResult({ ok: true, snapshotId });
      },
    );

    server.registerTool(
      "control_displays",
      {
        description: "Steer the physical displays: navigate everyone to a view, refresh them, clear a forced navigation, or show the next wallpaper picture now (with dashboardId only on that view, without on every view). Uses the live-sync channel; needs the app's socket server running.",
        inputSchema: {
          action: z.enum(["navigate", "refresh", "clear_navigate", "next_wallpaper"]),
          dashboardId: z.string().optional(),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ action, dashboardId }) => {
        const io = (global as any).LIVE_SYNC_IO;
        if (!io) return teachError("Live-sync is not available", "The app's socket server is not running in this process.");
        if (action === "navigate") {
          if (!dashboardId) return teachError("navigate needs dashboardId", await listViewIdsHint());
          io.emit("FORCE_NAVIGATE", dashboardId);
        } else if (action === "refresh") {
          io.emit("REFRESH_DEVICE", dashboardId ?? null);
        } else if (action === "next_wallpaper") {
          io.emit("NEXT_WALLPAPER", dashboardId ?? null);
        } else {
          io.emit("CLEAR_NAVIGATE");
        }
        return jsonResult({ ok: true, action, dashboardId: dashboardId ?? null });
      },
    );
  }

  return server;
}
