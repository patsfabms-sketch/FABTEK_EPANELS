// Supabase access for the pack-out kit feature. Reads and writes ONLY the
// four assemblyos_kit_* tables and the private `assemblyos-kit-files` storage
// bucket — never the live panels / work-history tables, and never the
// activity feed. Kit tables hold the panel's build_id as plain text (no
// foreign key), so a kit can't affect, or be broken by, the live data.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { applyAction, buildEvent, buildIncludeEvent, canUndo, eventsToUndo, snapshotLine, undoPatch } from "./kitData";

export const KIT_BUCKET = "assemblyos-kit-files";

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

// ---- row mappers ----------------------------------------------------------

export const fromDbKit = (r) => ({
  buildId: r.build_id,
  panelId: r.panel_id ?? "",
  soNumber: r.so_number ?? "",
  itemNumber: r.item_number ?? "",
  topPn: r.top_pn ?? "",
  topDescription: r.top_description ?? "",
  sourceFileName: r.source_file_name ?? "",
  bomNotes: r.bom_notes ? String(r.bom_notes).split("\n").filter(Boolean) : [],
  bomRowCount: r.bom_row_count ?? 0,
  uploadedBy: r.uploaded_by ?? "",
  uploadedAt: r.uploaded_at,
  reportLastGeneratedAt: r.report_last_generated_at ?? null,
  reportCount: r.report_count ?? 0,
});

export const fromDbLine = (r) => ({
  id: r.id,
  buildId: r.build_id,
  pn: r.pn,
  description: r.description ?? "",
  unit: r.unit ?? "EA",
  qtyRequired: Number(r.qty_required) || 0,
  usedIn: r.used_in ?? "",
  refs: r.refs ?? "",
  bomLineCount: r.bom_line_count ?? 1,
  sortOrder: r.sort_order ?? 0,
  kind: r.kind,
  included: !!r.included,
  status: r.status,
  qtyReceived: Number(r.qty_received) || 0,
  checkedBy: r.checked_by ?? null,
  checkedAt: r.checked_at ?? null,
  receivedAt: r.received_at ?? null,
  note: r.note ?? "",
});

export const fromDbEvent = (r) => ({
  id: r.id,
  buildId: r.build_id,
  lineId: r.line_id,
  action: r.action,
  prevStatus: r.prev_status,
  prevQtyReceived: r.prev_qty_received === null ? 0 : Number(r.prev_qty_received),
  prevCheckedBy: r.prev_checked_by,
  prevCheckedAt: r.prev_checked_at,
  prevReceivedAt: r.prev_received_at,
  newStatus: r.new_status,
  newQtyReceived: r.new_qty_received === null ? 0 : Number(r.new_qty_received),
  qty: r.qty === null ? null : Number(r.qty),
  note: r.note,
  by: r.by_name,
  group: r.group_id,
  createdAt: r.created_at,
  undoneAt: r.undone_at,
});

export const fromDbFile = (r) => ({
  id: r.id,
  buildId: r.build_id,
  kind: r.kind,
  fileName: r.file_name,
  storagePath: r.storage_path,
  sizeBytes: r.size_bytes ?? 0,
  sortOrder: r.sort_order ?? 0,
});

export const fromDbMarker = (r) => ({
  id: r.id,
  buildId: r.build_id,
  lineId: r.line_id,
  fileId: r.file_id,
  page: r.page ?? 1,
  x: Number(r.x),
  y: Number(r.y),
  note: r.note ?? "",
  createdBy: r.created_by ?? "",
});

const toDbLinePatch = (p) => {
  const map = {
    status: "status",
    qtyReceived: "qty_received",
    checkedBy: "checked_by",
    checkedAt: "checked_at",
    receivedAt: "received_at",
    included: "included",
    note: "note",
  };
  const out = {};
  Object.entries(p).forEach(([k, v]) => {
    if (map[k]) out[map[k]] = v;
  });
  return out;
};

const toDbEvent = (e, buildId, lineId) => ({
  build_id: buildId,
  line_id: lineId,
  action: e.action,
  prev_status: e.prevStatus ?? null,
  prev_qty_received: e.prevQtyReceived ?? null,
  prev_checked_by: e.prevCheckedBy ?? null,
  prev_checked_at: e.prevCheckedAt ?? null,
  prev_received_at: e.prevReceivedAt ?? null,
  new_status: e.newStatus ?? null,
  new_qty_received: e.newQtyReceived ?? null,
  qty: e.qty ?? null,
  note: e.note ?? null,
  by_name: e.by ?? null,
  group_id: e.group ?? null,
});

function must({ error, data }) {
  if (error) throw error;
  return data;
}

// ---- reads ----------------------------------------------------------------

export async function fetchKits() {
  const kits = must(await supabase.from("assemblyos_kits").select("*").order("uploaded_at", { ascending: false }));
  const summary = must(await supabase.from("assemblyos_kit_summary").select("*"));
  const byId = new Map(summary.map((s) => [s.build_id, s]));
  return kits.map((k) => {
    const s = byId.get(k.build_id) || {};
    return {
      ...fromDbKit(k),
      counts: {
        total: s.total_lines ?? 0,
        pending: s.pending_lines ?? 0,
        got: s.got_lines ?? 0,
        missing: s.missing_lines ?? 0,
        short: s.short_lines ?? 0,
        received: s.received_lines ?? 0,
      },
    };
  });
}

// Lines for one kit, past Supabase's 1,000-row cap (a kit is ~100-200, but
// never assume).
async function fetchAll(table, buildId, orderCol) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await supabase.from(table).select("*").eq("build_id", buildId).order(orderCol, { ascending: true }).range(from, from + 999)
    );
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function fetchKitDetail(buildId) {
  const kitRow = must(await supabase.from("assemblyos_kits").select("*").eq("build_id", buildId).maybeSingle());
  if (!kitRow) return null;
  const [lines, events, files, markers] = await Promise.all([
    fetchAll("assemblyos_kit_lines", buildId, "sort_order"),
    fetchAll("assemblyos_kit_events", buildId, "created_at"),
    fetchAll("assemblyos_kit_files", buildId, "sort_order"),
    // The markers table is newer than the rest; if it isn't there yet the
    // checklist must still work, so a failure here just means "no markers".
    fetchAll("assemblyos_kit_markers", buildId, "created_at").catch(() => []),
  ]);
  return {
    kit: fromDbKit(kitRow),
    lines: lines.map(fromDbLine),
    events: events.map(fromDbEvent),
    files: files.map(fromDbFile),
    markers: markers.map(fromDbMarker),
  };
}

// ---- writes ---------------------------------------------------------------

/**
 * Create a kit from a parsed BOM + the files to keep. `files` =
 * [{ kind, fileName, blob }]. If anything fails part-way the kit is deleted
 * again (child rows cascade) so a half-uploaded kit never lingers.
 */
export async function createKit({ buildId, panelId, parsed, sourceFileName, uploadedBy, files }) {
  const { meta, lines, notes } = parsed;
  must(await supabase.from("assemblyos_kits").delete().eq("build_id", buildId)); // replace any earlier upload of this panel's kit
  try {
    must(
      await supabase.from("assemblyos_kits").insert({
        build_id: buildId,
        panel_id: panelId,
        so_number: meta.so,
        item_number: meta.item,
        top_pn: meta.topPn,
        top_description: meta.topDescription,
        source_file_name: sourceFileName,
        bom_notes: notes.join("\n"),
        bom_row_count: meta.rowCount,
        uploaded_by: uploadedBy,
      })
    );
    const rows = lines.map((l) => ({
      build_id: buildId,
      pn: l.pn,
      description: l.description,
      unit: l.unit,
      qty_required: l.qtyRequired,
      used_in: l.usedIn,
      refs: l.refs,
      bom_line_count: l.bomLineCount,
      sort_order: l.sortOrder,
      kind: l.kind,
      included: l.included,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      must(await supabase.from("assemblyos_kit_lines").insert(rows.slice(i, i + 200)));
    }
    let order = 0;
    for (const f of files) {
      const safe = f.fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${buildId}/${order}-${safe}`;
      const up = await supabase.storage.from(KIT_BUCKET).upload(path, f.blob, {
        upsert: true,
        contentType: f.contentType || undefined,
      });
      if (up.error) throw up.error;
      must(
        await supabase.from("assemblyos_kit_files").insert({
          build_id: buildId,
          kind: f.kind,
          file_name: f.fileName,
          storage_path: path,
          size_bytes: f.blob.size,
          sort_order: order,
        })
      );
      order += 1;
    }
    must(await supabase.from("assemblyos_kit_events").insert({ build_id: buildId, action: "upload", by_name: uploadedBy, note: sourceFileName }));
  } catch (err) {
    await supabase.from("assemblyos_kits").delete().eq("build_id", buildId);
    throw err;
  }
}

export async function deleteKit(buildId) {
  const { data: files } = await supabase.from("assemblyos_kit_files").select("storage_path").eq("build_id", buildId);
  if (files?.length) await supabase.storage.from(KIT_BUCKET).remove(files.map((f) => f.storage_path));
  must(await supabase.from("assemblyos_kits").delete().eq("build_id", buildId));
}

// Apply one verifier action (got / missing / reset / receive) to one line.
export async function applyLineAction(line, action, opts) {
  const patch = applyAction(line, action, opts);
  if (!patch) return null;
  const before = snapshotLine(line);
  const evAction = action === "missing" && patch.status === "short" ? "short" : action === "missing" && patch.status === "got" ? "got" : action;
  const event = buildEvent(evAction, before, patch, { by: opts.by, qty: opts.qty ?? null, note: opts.note ?? null, group: opts.group ?? null });
  const dbPatch = toDbLinePatch({ ...patch, ...(opts.note !== undefined ? { note: opts.note } : {}) });
  // Guard on the status we read, so two people clicking the same line at
  // once can't silently overwrite each other.
  const res = await supabase
    .from("assemblyos_kit_lines")
    .update(dbPatch)
    .eq("id", line.id)
    .eq("status", line.status)
    .eq("qty_received", line.qtyReceived)
    .select("id");
  if (res.error) throw res.error;
  if (!res.data?.length) throw new Error("Someone else just changed this line — it has been refreshed.");
  must(await supabase.from("assemblyos_kit_events").insert(toDbEvent(event, line.buildId, line.id)));
  return patch;
}

// Bulk actions. One Undo click reverts the whole batch (shared group id).
// Written for speed: the per-line updates run in parallel (8 at a time) and
// ALL the history rows go in with a single insert — the first version did
// ~200 one-at-a-time round trips for a 100-part kit, which looked frozen on
// a real connection. Each update is still guarded on the status we read, so
// a line someone else just changed is skipped, not overwritten.
async function bulkApply(targets, action, optsFor) {
  const group = uuid();
  const events = [];
  let skipped = 0;
  for (let i = 0; i < targets.length; i += 8) {
    await Promise.all(
      targets.slice(i, i + 8).map(async (line) => {
        const opts = { ...optsFor(line), group };
        const patch = applyAction(line, action, opts);
        if (!patch) return;
        const res = await supabase
          .from("assemblyos_kit_lines")
          .update(toDbLinePatch(patch))
          .eq("id", line.id)
          .eq("status", line.status)
          .eq("qty_received", line.qtyReceived)
          .select("id");
        if (res.error) throw res.error;
        if (!res.data?.length) {
          skipped += 1;
          return;
        }
        const ev = buildEvent(action, snapshotLine(line), patch, { by: opts.by, qty: opts.qty ?? null, group });
        events.push(toDbEvent(ev, line.buildId, line.id));
      })
    );
  }
  if (events.length) must(await supabase.from("assemblyos_kit_events").insert(events));
  return { done: events.length, skipped };
}

// "Everything left is fine" shortcut.
export async function markAllPendingGot(lines, by) {
  const pending = lines.filter((l) => l.included && l.status === "pending");
  return bulkApply(pending, "got", () => ({ by }));
}

// "The rest of the missing/short parts have all arrived."
export async function markAllOutstandingReceived(lines, by, at = new Date().toISOString()) {
  const out = lines.filter((l) => l.included && (l.status === "missing" || l.status === "short"));
  return bulkApply(out, "receive", (l) => ({ by, at, qty: Math.max(0, l.qtyRequired - l.qtyReceived) }));
}

export async function setLineIncluded(line, included, by) {
  const event = buildIncludeEvent(included ? "include" : "exclude", { by });
  must(await supabase.from("assemblyos_kit_lines").update({ included }).eq("id", line.id));
  must(await supabase.from("assemblyos_kit_events").insert(toDbEvent(event, line.buildId, line.id)));
}

// Red "missing / on order" pins on the drawings. x/y are 0..1 of the page so a
// pin lands on the same spot at any zoom or screen size.
export async function addMarker({ buildId, lineId, fileId, page = 1, x, y, by }) {
  must(
    await supabase.from("assemblyos_kit_markers").insert({
      build_id: buildId,
      line_id: lineId,
      file_id: fileId,
      page,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      created_by: by ?? null,
    })
  );
}

export async function removeMarker(markerId) {
  must(await supabase.from("assemblyos_kit_markers").delete().eq("id", markerId));
}

export async function saveLineNote(line, note) {
  must(await supabase.from("assemblyos_kit_lines").update({ note }).eq("id", line.id));
}

/** Undo the most recent un-undone action (and its bulk group). Returns the number of lines restored. */
export async function undoLast(events, lines) {
  const batch = eventsToUndo(events);
  if (!batch.length) return 0;
  const byId = new Map(lines.map((l) => [l.id, l]));
  // Refuse if anyone changed a line after the event (don't overwrite them).
  for (const e of batch) {
    if (!canUndo(e, byId.get(e.lineId))) {
      throw new Error("That line was changed again after this action, so it can't be undone automatically. Fix it on the line itself.");
    }
  }
  for (let i = 0; i < batch.length; i += 8) {
    await Promise.all(batch.slice(i, i + 8).map(async (e) => must(await supabase.from("assemblyos_kit_lines").update(toDbLinePatch(undoPatch(e))).eq("id", e.lineId))));
  }
  must(await supabase.from("assemblyos_kit_events").update({ undone_at: new Date().toISOString() }).in("id", batch.map((e) => e.id)));
  return batch.length;
}

export async function recordReportGenerated(buildId, by, format, kit) {
  must(
    await supabase
      .from("assemblyos_kits")
      .update({ report_last_generated_at: new Date().toISOString(), report_count: (kit?.reportCount ?? 0) + 1 })
      .eq("build_id", buildId)
  );
  must(await supabase.from("assemblyos_kit_events").insert({ build_id: buildId, action: "report", by_name: by, note: format }));
}

// A short-lived signed URL isn't needed — we download the blob (bucket is
// private) and hand it to pdf.js / the browser directly.
export async function downloadKitFile(storagePath) {
  const { data, error } = await supabase.storage.from(KIT_BUCKET).download(storagePath);
  if (error) throw error;
  return data;
}

// ---- hooks ----------------------------------------------------------------

function useRealtimeReload(channelName, tables, filterBuildId, reload) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    let timer = null;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), 250);
    };
    let ch = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`);
    tables.forEach((table) => {
      const cfg = { event: "*", schema: "public", table };
      if (filterBuildId && table !== "assemblyos_kits") cfg.filter = `build_id=eq.${filterBuildId}`;
      if (filterBuildId && table === "assemblyos_kits") cfg.filter = `build_id=eq.${filterBuildId}`;
      ch = ch.on("postgres_changes", cfg, bump);
    });
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [channelName, tables, filterBuildId]);
}

const LIST_TABLES = ["assemblyos_kits", "assemblyos_kit_lines"];
const DETAIL_TABLES = ["assemblyos_kits", "assemblyos_kit_lines", "assemblyos_kit_events", "assemblyos_kit_files", "assemblyos_kit_markers"];

export function useKitList() {
  const [state, setState] = useState({ kits: [], loading: true, error: null });
  const reload = useCallback(async () => {
    try {
      const kits = await fetchKits();
      setState({ kits, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useRealtimeReload("kit-list", LIST_TABLES, null, reload);
  return { ...state, reload };
}

export function useKitDetail(buildId) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = useCallback(async () => {
    try {
      const data = await fetchKitDetail(buildId);
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, [buildId]);
  useEffect(() => {
    setState({ data: null, loading: true, error: null });
    reload();
  }, [reload]);
  useRealtimeReload(`kit-${buildId}`, DETAIL_TABLES, buildId, reload);
  return { ...state, reload };
}
