import { invoiceIndex, loadInvoiceParts, loadInvoices, type Invoice, type InvPart } from './invoices';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { selectAll, setRfqSaveMode, supabase, uploadDoc } from './supabase';
import { normKey, ENGINE_VERSION } from './engine.js';
import { safeId, today } from './format';
import type { Design, Drawing, Estimate, Line, MatRequest, Member, Order, OrderLine, Part, PoPdfLine, PriceLine, Upload } from './types';

// ---------------- row mappers ----------------
type Row = Record<string, any>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

export const toPart = (r: Row): Part => ({
  key: r.key, number: r.number, title: s(r.title), customer: s(r.customer), site: s(r.site), project: s(r.project),
  latestRev: s(r.latest_rev), parentKey: s(r.parent_key),
  files: { pdf: [], dwg: [], dxf: [], cad: [], folders: [], ...(r.files || {}) }, aliases: r.aliases || [], revLog: r.rev_log || [],
});
export const fromPart = (p: Part) => ({
  key: p.key, number: p.number, title: p.title || null, customer: p.customer || null, site: p.site || null, project: p.project || null,
  latest_rev: p.latestRev || null, parent_key: p.parentKey || null, files: p.files, aliases: p.aliases, rev_log: p.revLog, updated_at: new Date().toISOString(),
});
export const toDrawing = (r: Row): Drawing => ({
  id: r.id, key: r.key, partNo: r.part_no, rev: s(r.rev), fileRev: s(r.file_rev), title: s(r.title), customer: s(r.customer), site: s(r.site),
  project: s(r.project), discrete: s(r.discrete), date: s(r.drawing_date), bom: r.bom || [], dims: r.dims || [], holes: r.holes || [],
  revisions: r.revisions || [], sheets: r.sheets || 1, textless: !!r.textless, readBy: s(r.read_by), numberMismatch: s(r.number_mismatch),
  file: s(r.file), paths: r.paths || [], storagePath: s(r.storage_path), addedAt: s(r.added_at).slice(0, 10),
});
export const fromDrawing = (d: Drawing, source = 'upload') => ({
  id: d.id, key: d.key, part_no: d.partNo, rev: d.rev || null, file_rev: d.fileRev || null, title: d.title || null, customer: d.customer || null,
  site: d.site || null, project: d.project || null, discrete: d.discrete || null, drawing_date: d.date || null, bom: d.bom, dims: d.dims,
  holes: d.holes, revisions: d.revisions, sheets: d.sheets || 1, textless: d.textless, read_by: d.readBy || null,
  number_mismatch: d.numberMismatch || null, file: d.file || null, paths: d.paths || [], storage_path: d.storagePath || null, source, engine: ENGINE_VERSION,
});

// ---------------- data model ----------------
export type Data = {
  parts: Part[]; drawings: Drawing[]; estimates: Estimate[]; orders: Order[]; designs: Design[];
  requests: MatRequest[]; uploads: Upload[]; team: Member[]; invoices: Invoice[]; invParts: InvPart[];
};
const EMPTY: Data = { parts: [], drawings: [], estimates: [], orders: [], designs: [], requests: [], uploads: [], team: [], invoices: [], invParts: [] };

async function loadAll(): Promise<Data> {
  const [parts, drawings, ests, lines, orders, olines, designs, reqs, uploads, team, invoices, invParts] = await Promise.all([
    selectAll('parts'), selectAll('drawings'), selectAll('estimates'), selectAll('estimate_lines', '*', 'id'), selectAll('orders_safe'),
    selectAll('order_lines_safe', '*', 'id'), selectAll('designs'), selectAll('material_requests'),
    supabase.from('uploads').select('*').order('at', { ascending: false }).limit(200).then(r => r.data || []),
    selectAll('team_members'),
    loadInvoices().catch(() => [] as Invoice[]),
    loadInvoiceParts().catch(() => [] as InvPart[]),
  ]);
  const byEst = new Map<string, Line[]>();
  for (const l of lines as Row[]) {
    if (!byEst.has(l.estimate_no)) byEst.set(l.estimate_no, []);
    byEst.get(l.estimate_no)!.push({ id: l.id, n: l.n, product: s(l.product), key: s(l.key), desc: s(l.descr), rev: s(l.rev), qty: n(l.qty), rate: n(l.rate), amount: n(l.amount) });
  }
  const byPo = new Map<string, OrderLine[]>();
  for (const l of olines as Row[]) {
    if (!byPo.has(l.po)) byPo.set(l.po, []);
    byPo.get(l.po)!.push({ part: s(l.part), key: s(l.key), desc: s(l.descr), qty: n(l.qty), orderDate: s(l.order_date), shopDate: s(l.shop_date), due: s(l.due), estimate: s(l.estimate), line: s(l.line), eng: s(l.eng), notes: s(l.notes), row: l.sheet_row, id: l.id, price: n(l.price) });
  }
  return {
    parts: (parts as Row[]).map(toPart),
    drawings: (drawings as Row[]).map(toDrawing),
    estimates: (ests as Row[]).map(e => ({
      no: e.no, date: s(e.est_date), po: s(e.po_field), rep: s(e.rep), total: n(e.total), tax: n(e.tax), subtotal: n(e.subtotal),
      reconciled: !!e.reconciled, src: e.src || {}, storagePath: s(e.storage_path), versions: e.versions || [],
      lines: (byEst.get(e.no) || []).sort((a, b) => a.n - b.n),
    })),
    orders: (orders as Row[]).map(o => ({ po: o.po, firstDate: s(o.first_date), source: s(o.source), estimates: o.estimates || [], pdf: o.pdf, pdfHistory: o.pdf_history || [], lines: byPo.get(o.po) || [] })),
    designs: (designs as Row[]).map(d => ({ id: d.id, name: s(d.name), status: d.status, note: s(d.note), members: d.members || [] })),
    requests: (reqs as Row[]).map(r => ({ id: r.id, title: r.title, job: s(r.job), date: s(r.req_date), neededBy: s(r.needed_by), status: s(r.status), parts: r.parts || [], items: r.items || [], note: s(r.note), source: s(r.source) })),
    uploads: (uploads as Row[]).map(u => ({ id: u.id, kind: u.kind, name: s(u.name), detail: s(u.detail), at: s(u.at), by: s(u.by_email) })),
    team: (team as Row[]).map(t => ({ email: t.email, role: t.role, name: t.name, perms: t.perms || null, engineer: !!t.engineer, manager: !!t.manager, username: t.username || '', mustChange: !!t.must_change })),
    invoices, invParts,
  };
}

// ---------------- indexes ----------------
export type Index = ReturnType<typeof buildIndex>;
export function buildIndex(D: Data) {
  const parts = new Map(D.parts.map(p => [p.key, p]));
  const drawings = new Map(D.drawings.map(d => [d.id, d]));
  const drawsByKey = new Map<string, Drawing[]>();
  for (const d of D.drawings) { if (!drawsByKey.has(d.key)) drawsByKey.set(d.key, []); drawsByKey.get(d.key)!.push(d); }
  for (const a of drawsByKey.values()) a.sort((x, y) => (Number(x.rev) || 0) - (Number(y.rev) || 0));
  const lines: PriceLine[] = [];
  for (const e of D.estimates) for (const l of e.lines) lines.push({ ...l, no: e.no, date: e.date, po: e.po, storagePath: e.storagePath, page: e.src?.page });
  lines.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const linesByKey = new Map<string, PriceLine[]>();
  for (const l of lines) { if (!l.key) continue; if (!linesByKey.has(l.key)) linesByKey.set(l.key, []); linesByKey.get(l.key)!.push(l); }
  type OL = { po: string; key: string; part: string; desc: string; qty: number | null; due: string; estimate: string; notes: string; price?: number | null; fromPdf?: boolean; id?: number };
  const ordLines: OL[] = [];
  for (const o of D.orders) {
    for (const l of o.lines) ordLines.push({ po: o.po, key: l.key, part: l.part, desc: l.desc, qty: l.qty, due: l.due, estimate: l.estimate, notes: l.notes, price: l.price, id: l.id });
    for (const l of o.pdf?.lines || []) ordLines.push({ po: o.po, key: normKey(l.part), part: l.part, desc: l.desc, qty: l.qty, due: l.due, estimate: l.quote, notes: '', price: l.price, fromPdf: true });
  }
  const ordByKey = new Map<string, OL[]>(), ordByEstKey = new Map<string, OL[]>();
  for (const l of ordLines) {
    if (l.key) { if (!ordByKey.has(l.key)) ordByKey.set(l.key, []); ordByKey.get(l.key)!.push(l); }
    if (l.estimate) { const k = l.estimate + '|' + l.key; if (!ordByEstKey.has(k)) ordByEstKey.set(k, []); ordByEstKey.get(k)!.push(l); }
  }
  const designByKey = new Map<string, Design>();
  for (const d of D.designs) for (const k of d.members) designByKey.set(k, d);
  const reqByKey = new Map<string, MatRequest[]>();
  for (const r of D.requests) for (const p of r.parts) { if (!reqByKey.has(p.key)) reqByKey.set(p.key, []); reqByKey.get(p.key)!.push(r); }

  const inv = invoiceIndex(D.invoices, D.invParts);
  const ix = {
    inv,
    parts, drawings, drawsByKey, lines, linesByKey, ordByKey, ordByEstKey, designByKey, reqByKey,
    latestDrawing: (k: string) => { const a = drawsByKey.get(k); return a && a.length ? a[a.length - 1] : null; },
    pName: (k: string) => parts.get(k)?.number || k,
    pricesFor: (k: string) => linesByKey.get(k) || [],
    subLinesFor: (k: string) => { const out: PriceLine[] = []; for (const [lk, arr] of linesByKey) if (lk !== k && lk.startsWith(k) && lk.length - k.length <= 3) out.push(...arr); return out; },
    ordered: (no: string, key: string) => ordByEstKey.get(no + '|' + key) || [],
    quotedFor: (key: string, no?: string, price?: number | null): (PriceLine & { fuzzy?: boolean }) | null => {
      const byKey = linesByKey.get(key) || [];
      const hit = byKey.find(x => x.no === no); if (hit) return hit;
      const e = no ? D.estimates.find(x => x.no === no) : null;
      if (e) {
        const l = e.lines.find(l => l.key === key) || e.lines.find(l => price != null && Math.abs((l.rate || 0) - price) < 0.01) || e.lines.find(l => l.key && key && l.key.slice(0, 7) === key.slice(0, 7));
        if (l) return { ...l, no: e.no, date: e.date, po: e.po, storagePath: e.storagePath, fuzzy: l.key !== key };
      }
      return no ? null : byKey[0] || null;
    },
    /** Lines for several parts plus sub-part lines of the first, newest first. */
    priceRows: (keys: string[], ownKey?: string) => {
      const rows: PriceLine[] = [];
      for (const k of keys) for (const l of linesByKey.get(k) || []) rows.push({ ...l, via: k === ownKey ? 'this part' : parts.get(k)?.number || k });
      if (ownKey) for (const [lk, arr] of linesByKey) if (lk !== ownKey && lk.startsWith(ownKey) && lk.length - ownKey.length <= 3) for (const l of arr) rows.push({ ...l, via: 'sub-part ' + l.product });
      rows.sort((a, b) => b.date.localeCompare(a.date));
      return rows;
    },
  };
  return ix;
}

/** Same-design groups whose members were quoted at different prices. */
export function priceConflicts(D: Data, ix: Index) {
  const out: { g: Design; lo: number; hi: number }[] = [];
  for (const g of D.designs) {
    const rates = ix.priceRows(g.members).map(r => r.rate).filter((x): x is number => x != null);
    if (rates.length < 2) continue;
    const lo = Math.min(...rates), hi = Math.max(...rates);
    if (hi - lo > 0.01 && (hi - lo) / hi > 0.03) out.push({ g, lo, hi });
  }
  return out.sort((a, b) => (b.hi - b.lo) / b.hi - (a.hi - a.lo) / a.hi);
}

// ---------------- context ----------------
/** What this person may do: owner and people with no settings get everything. */
export type MyPerms = { prices: boolean; access: 'edit' | 'status' | 'view'; canEdit: boolean; canStatus: boolean; sections: Set<string>; can: (s: string) => boolean };
export function permsFor(m?: Member | null): MyPerms {
  const all = ['compartments', 'rfqs', 'material', 'progress', 'engineering', 'packing'];
  const p = m && m.role !== 'owner' ? m.perms || {} : {};
  const access = p.access || 'edit';
  const sections = new Set<string>(p.sections && p.sections.length ? p.sections : all);
  return { prices: p.prices !== false, access, canEdit: access === 'edit', canStatus: access !== 'view', sections, can: s => sections.has(s) };
}
type Ctx = {
  D: Data; ix: Index; loading: boolean; error: string; email: string; isOwner: boolean; perms: MyPerms;
  reload: () => Promise<void>;
  toast: (m: string) => void; toastMsg: string;
};
const DataCtx = createContext<Ctx | null>(null);
export const useData = () => { const c = useContext(DataCtx); if (!c) throw new Error('DataProvider missing'); return c; };

export function DataProvider({ email, children }: { email: string; children: ReactNode }) {
  const [D, setD] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMsg, setToast] = useState('');
  const reload = useCallback(async () => {
    try { setD(await loadAll()); setError(''); } catch (e: any) { setError(e.message || String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const toast = useCallback((m: string) => { setToast(m); window.clearTimeout((toast as any)._t); (toast as any)._t = window.setTimeout(() => setToast(''), 4000); }, []);
  const ix = useMemo(() => buildIndex(D), [D]);
  const isOwner = D.team.some(t => t.email === email.toLowerCase() && t.role === 'owner');
  const me = D.team.find(t => t.email === email.toLowerCase());
  const perms = useMemo(() => permsFor(me), [me]);
  useEffect(() => { setRfqSaveMode(!perms.prices || !perms.canEdit); }, [perms]);
  return <DataCtx.Provider value={{ D, ix, loading, error, email, isOwner, perms, reload, toast, toastMsg }}>{children}</DataCtx.Provider>;
}

// ---------------- writes ----------------
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
export async function logUpload(kind: string, name: string, detail: string) {
  await supabase.from('uploads').insert({ kind, name, detail });
}

export async function saveDrawing(D: Data, ix: Index, fp: Drawing, file: File | null, name: string, email: string) {
  if (!fp.key) throw new Error('No part number found. Rename the file with the part number and try again.');
  const id = safeId(`${fp.key}_R${fp.rev || 'X'}`);
  let storagePath = '';
  if (file) storagePath = await uploadDoc(`drawings/${id}.pdf`, file);
  const p = ix.parts.get(fp.key);
  const revs = (ix.drawsByKey.get(fp.key) || []).map(d => d.rev);
  const isNewRev = !!p && revs.length > 0 && !revs.includes(fp.rev);
  const latest = [...revs, fp.rev].sort((a, b) => (Number(a) || 0) - (Number(b) || 0)).pop() || fp.rev;
  const part: Part = p ? { ...p } : { key: fp.key, number: fp.partNo, title: '', customer: '', site: '', project: '', latestRev: '', parentKey: '', files: { pdf: [], dwg: [], dxf: [], cad: [], folders: [] }, aliases: [], revLog: [] };
  part.title = part.title || fp.title; part.customer = fp.customer || part.customer; part.site = fp.site || part.site; part.project = fp.project || part.project;
  part.latestRev = latest;
  if (isNewRev) part.revLog = [...part.revLog, { at: today(), from: p!.latestRev, to: fp.rev, file: name }];
  must(await supabase.from('parts').upsert(fromPart(part)));
  must(await supabase.from('drawings').upsert({ ...fromDrawing({ ...fp, id, file: name, storagePath }), added_by: email }));
  await logUpload('drawing', name, `${fp.partNo} Rev ${fp.rev}${isNewRev ? ' (new revision)' : ''}`);
  return { id, isNewRev };
}

async function ensureParts(ix: Index, rows: { key: string; number: string; title: string }[]) {
  const missing = new Map<string, { key: string; number: string; title: string }>();
  for (const r of rows) if (r.key && !ix.parts.has(r.key) && !/^(SALES|MATERIALS|MISC|EXPEDITE)/.test(r.key)) missing.set(r.key, r);
  if (missing.size) must(await supabase.from('parts').upsert([...missing.values()].map(m => ({ key: m.key, number: m.number, title: m.title || null })), { onConflict: 'key', ignoreDuplicates: true }));
}

export async function saveEstimates(D: Data, ix: Index, ests: any[], file: File | null, name: string, email: string) {
  let storagePath = '';
  if (file) storagePath = await uploadDoc(`estimates/${Date.now()}-${safeId(name)}`, file);
  for (const e of ests) {
    const ex = D.estimates.find(x => x.no === e.no);
    const versions = ex ? [...ex.versions, { file: ex.src?.file, page: ex.src?.page, lines: ex.lines.length, total: ex.total ?? undefined, replacedAt: today() }] : [];
    must(await supabase.from('estimates').upsert({
      no: e.no, est_date: e.date || null, po_field: e.po || null, rep: e.rep || null, total: e.total, tax: e.tax, subtotal: e.subtotal,
      reconciled: e.reconciled, src: { file: name, page: e.page }, storage_path: storagePath || null, versions, source: 'upload', saved_at: new Date().toISOString(), saved_by: email,
    }));
    must(await supabase.from('estimate_lines').delete().eq('estimate_no', e.no));
    const lines = e.lines.map((l: any) => ({ estimate_no: e.no, n: l.n, product: l.product, key: normKey(l.product), descr: l.desc, rev: l.rev || null, qty: l.qty, rate: l.rate, amount: l.amount }));
    if (lines.length) must(await supabase.from('estimate_lines').insert(lines));
    await ensureParts(ix, e.lines.map((l: any) => ({ key: normKey(l.product), number: l.product, title: String(l.desc || '').replace(/\(\s*REV.*$/i, '').trim() })));
  }
  await logUpload('estimate', name, `${ests.length} estimate(s)`);
}

export async function savePO(D: Data, po: { po: string; rev: string; date: string; buyer: string; total: number | null; lines: PoPdfLine[] }, file: File | null, name: string) {
  if (!po.po) throw new Error('No PO number found on this file.');
  let storagePath = '';
  if (file) storagePath = await uploadDoc(`pos/${safeId(po.po)}-rev${safeId(po.rev || '0')}.pdf`, file);
  const ex = D.orders.find(o => o.po === po.po);
  const pdf = { rev: po.rev, date: po.date, buyer: po.buyer, total: po.total, file: name, storagePath, lines: po.lines.map(l => ({ ...l, key: normKey(l.part) })) };
  const estimates = [...new Set([...(ex?.estimates || []), ...po.lines.map(l => l.quote).filter(Boolean)])];
  const pdf_history = ex?.pdf && ex.pdf.rev !== po.rev ? [...ex.pdfHistory, ex.pdf] : ex?.pdfHistory || [];
  must(await supabase.from('orders').upsert({ po: po.po, first_date: ex?.firstDate || toIso(po.date), source: ex ? ex.source : 'po', estimates, pdf, pdf_history, updated_at: new Date().toISOString() }));
  await logUpload('po', name, `${po.po} rev ${po.rev}`);
}
const MON: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
function toIso(d: string) { const m = String(d).match(/(\d{1,2})-([A-Z]{3})-(\d{2,4})/i); if (!m) return null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${MON[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`; }

export async function saveVendorBom(ix: Index, vb: { job: string; date: string; items: any[] }, name: string) {
  const keys = [...ix.parts.keys()].sort((a, b) => b.length - a.length);
  const byKey = new Map<string, any[]>();
  for (const it of vb.items) { const rk = normKey(it.ref); const k = ix.parts.has(rk) ? rk : keys.find(x => rk.startsWith(x)); if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(it); }
  for (const [k, its] of byKey) {
    const p = ix.parts.get(k)!;
    const have = new Set(p.aliases.map(a => a.cal));
    const aliases = [...p.aliases, ...its.filter(x => !have.has(x.cal)).map(x => ({ cal: x.cal, ref: x.ref, desc: x.desc, qty: x.qty, task: x.task, job: vb.job, date: vb.date }))];
    must(await supabase.from('parts').update({ aliases, updated_at: new Date().toISOString() }).eq('key', k));
  }
  await logUpload('vendor BOM', name, `job ${vb.job}`);
  return byKey.size;
}

export async function saveSchedule(ix: Index, rows: any[][], name: string) {
  const h = rows[0].map(x => String(x || '').toUpperCase().trim());
  const c = (p: string) => h.findIndex(x => x.startsWith(p));
  const I = { po: c('P.O'), part: c('PART'), desc: c('DESC'), od: c('ORDER'), sd: c('SHOP'), dd: c('DELIVER'), q: c('QUANT'), job: c('JOB'), li: c('LINE'), eng: c('ENG'), notes: c('NOTES') };
  const dt = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim();
  const byPo = new Map<string, any[]>();
  rows.slice(1).forEach((row, i) => {
    if (!row || !row.some(x => x != null)) return;
    const po = dt(row[I.po]) || 'NO-PO';
    if (/^P\.?O\.?\s*#?$|^COLUMN/i.test(po)) return;
    const job = dt(row[I.job]);
    if (!byPo.has(po)) byPo.set(po, []);
    byPo.get(po)!.push({ po, part: dt(row[I.part]) || null, key: normKey(row[I.part]) || null, descr: dt(row[I.desc]) || null, qty: Number(row[I.q]) || null,
      order_date: dt(row[I.od]) || null, shop_date: dt(row[I.sd]) || null, due: dt(row[I.dd]) || null, estimate: /^\d{4}$/.test(job) ? '2026-' + job : job || null,
      line: dt(row[I.li]) || null, eng: dt(row[I.eng]) || null, notes: dt(row[I.notes]) || null, sheet_row: i + 2 });
  });
  for (const [po, lines] of byPo) {
    const first = lines.map(l => l.order_date).filter(Boolean).sort()[0] || null;
    must(await supabase.from('orders').upsert({ po, first_date: first, estimates: [...new Set(lines.map(l => l.estimate).filter(Boolean))], updated_at: new Date().toISOString() }, { onConflict: 'po' }));
    must(await supabase.from('order_lines').delete().eq('po', po));
    must(await supabase.from('order_lines').insert(lines));
  }
  await logUpload('schedule', name, `${byPo.size} POs`);
  return byPo.size;
}

export async function linkDesign(ix: Index, a: string, b: string) {
  const d = ix.designByKey.get(b) || ix.designByKey.get(a);
  if (d) must(await supabase.from('designs').update({ members: [...new Set([...d.members, a, b])], status: 'confirmed' }).eq('id', d.id));
  else must(await supabase.from('designs').insert({ id: 'D-' + b, name: ix.parts.get(b)?.title || b, members: [b, a], status: 'confirmed', note: 'Confirmed by hand from Quote check.' }));
}
export async function confirmDesign(id: string) { must(await supabase.from('designs').update({ status: 'confirmed' }).eq('id', id)); }
export async function removeFromDesign(d: Design, key: string) {
  const members = d.members.filter(k => k !== key);
  if (members.length < 2) must(await supabase.from('designs').delete().eq('id', d.id));
  else must(await supabase.from('designs').update({ members }).eq('id', d.id));
}

export async function saveRequest(r: MatRequest, email: string) {
  must(await supabase.from('material_requests').upsert({
    id: r.id, title: r.title, job: r.job || null, req_date: r.date || null, needed_by: r.neededBy || null, status: r.status,
    parts: r.parts.filter(p => p.part).map(p => ({ ...p, key: normKey(p.part) })), items: r.items, note: r.note || null, source: r.source || null,
    updated_at: new Date().toISOString(), updated_by: email,
  }));
}

export async function inviteMember(email: string, name: string, password: string, action: 'add' | 'reset' = 'add') {
  const { data, error } = await supabase.functions.invoke('invite-member', { body: { email, name, password, action } });
  if (error) { const ctx = await (error as any).context?.json?.().catch(() => null); throw new Error(ctx?.error || error.message); }
  return data;
}
export async function removeMember(email: string) { must(await supabase.from('team_members').delete().eq('email', email)); }

export async function readDrawingImage(image: string) {
  const { data, error } = await supabase.functions.invoke('read-drawing', { body: { image, mediaType: 'image/jpeg' } });
  if (error) { const ctx = await (error as any).context?.json?.().catch(() => null); throw new Error(ctx?.error || error.message); }
  return data.result;
}

// ---------------- hand edits (compartment page) ----------------
/** Owner only (enforced by the database too): remove a part and its drawings. Quotes and POs stay as history. */
export async function deletePart(D: Data, key: string) {
  // drawings first (they point at the part); the database only lets the owner delete either
  must(await supabase.from('drawings').delete().eq('key', key));
  const r = await supabase.from('parts').delete().eq('key', key).select('key');
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error('Only the owner can delete compartments.');
  for (const g of D.designs.filter(d => d.members.includes(key))) await removeFromDesign(g, key);
  await logUpload('delete', key, 'part deleted');
}

export async function setLinePrice(id: number, rate: number | null, qty: number | null) {
  must(await supabase.from('estimate_lines').update({ rate, amount: rate != null && qty != null ? Math.round(rate * qty * 100) / 100 : null }).eq('id', id));
}

/** Add a price line; creates the estimate if the number is new. */
export async function addPrice(D: Data, a: { no: string; date: string; part: string; desc: string; qty: number | null; rate: number | null }, email: string) {
  const no = a.no.trim() || 'MANUAL-' + normKey(a.part);
  const ex = D.estimates.find(e => e.no === no);
  if (!ex) must(await supabase.from('estimates').insert({ no, est_date: a.date || today(), src: { file: 'entered by hand' }, versions: [], source: 'manual', saved_at: new Date().toISOString(), saved_by: email }));
  const n = Math.max(0, ...(ex?.lines.map(l => l.n) || [])) + 1;
  must(await supabase.from('estimate_lines').insert({ estimate_no: no, n, product: a.part, key: normKey(a.part), descr: a.desc || null, qty: a.qty, rate: a.rate, amount: a.rate != null && a.qty != null ? Math.round(a.rate * a.qty * 100) / 100 : null }));
  await logUpload('price', a.part, `${no} ${a.rate ?? ''}`);
}

/** Add a PO line for a part; creates the PO if it is new. */
export async function addPoLine(D: Data, a: { po: string; part: string; desc: string; qty: number | null; due: string; price: number | null; estimate: string; date: string }) {
  const po = a.po.trim().toUpperCase();
  if (!po) throw new Error('Enter a PO number.');
  const ex = D.orders.find(o => o.po === po);
  if (!ex) must(await supabase.from('orders').insert({ po, first_date: a.date || today(), source: 'manual', estimates: a.estimate ? [a.estimate] : [], pdf_history: [], updated_at: new Date().toISOString() }));
  else if (a.estimate && !ex.estimates.includes(a.estimate)) must(await supabase.from('orders').update({ estimates: [...ex.estimates, a.estimate], updated_at: new Date().toISOString() }).eq('po', po));
  must(await supabase.from('order_lines').insert({ po, part: a.part, key: normKey(a.part), descr: a.desc || null, qty: a.qty, due: a.due || null, order_date: a.date || today(), estimate: a.estimate || null, price: a.price }));
  await logUpload('po', po, `${a.part} added by hand`);
}
export async function updatePoLine(id: number, f: { qty?: number | null; due?: string | null; price?: number | null }) {
  must(await supabase.from('order_lines').update(f).eq('id', id));
}
export async function deletePoLine(id: number) { must(await supabase.from('order_lines').delete().eq('id', id)); }
