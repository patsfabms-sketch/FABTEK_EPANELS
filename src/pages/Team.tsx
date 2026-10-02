import { useRef, useState } from 'react';
import { Topbar } from '../components/Layout';
import { inviteMember, removeMember, useData } from '../lib/data';
import { BUCKET, supabase } from '../lib/supabase';
import { shortDate } from '../lib/format';
import { SECTIONS, type Member, type Perms, type Section } from '../lib/types';
import ChangeLog from '../components/ChangeLog';
import { DriversBox } from '../components/Drivers';
import { ShopRoles } from '../components/ShopRoles';

export default function Team() {
  const { D, email, isOwner, reload, toast } = useData();
  const [addr, setAddr] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [newPerms, setNewPerms] = useState<Perms>(FULL);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await inviteMember(addr.trim().toLowerCase(), name.trim(), '');
      await savePerms(out.email, newPerms);
      setAddr(''); setName(''); setPw(''); setNewPerms(FULL); await reload();
      window.alert(`${name.trim() || out.email} is added.\n\nUsername: ${out.username}\nFirst PIN: 123456\n\nThey pick their own 6-digit PIN the first time they sign in.`);
    }
    catch (err: any) { toast(err.message); } finally { setBusy(false); }
  }
  async function reset(m: string) {
    const who = D.team.find(t => t.email === m);
    if (!window.confirm(`Reset ${who?.name || m}'s PIN to 123456? They pick a new one the next time they sign in.`)) return;
    try { await inviteMember(m, '', '', 'reset'); await reload(); toast(`Reset. ${who?.username || m} signs in with 123456 and picks a new PIN.`); } catch (err: any) { toast(err.message); }
  }
  async function remove(m: string) {
    if (!window.confirm(`Remove ${m} from the team? They lose access right away.`)) return;
    try { await removeMember(m); await reload(); toast('Removed'); } catch (err: any) { toast(err.message); }
  }
  return (
    <>
      <Topbar title="Team" />
      <div className="content">
        <section className="card pad stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 24 }}>Who can sign in</h2>
          <span className="note">People sign in with their username (or email) and a 6-digit PIN. Only people you add here can get in. New people start on PIN 123456 and pick their own the first time they sign in.</span>
          <div className="tw"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th title="Engineers check out compartments from the Engineering queue and do the engineering">Engineer</th><th title="Managers transfer or unlock engineering, reopen it, override the revision check and correct production status. Every override needs a reason and is logged.">Manager</th><th>What they can do</th><th></th></tr></thead>
            <tbody>{D.team.map(m => <tr key={m.email}><td><b>{m.name || '—'}</b>{m.email === email && <span className="faint"> (you)</span>}{m.mustChange && <div className="note">hasn't picked a PIN yet (123456)</div>}</td><td className="mono">{m.username || '—'}</td><td>{m.email.endsWith('@team.fabtekindustries.com') ? <span className="faint">none</span> : m.email}</td><td><span className={'chip small' + (m.role === 'owner' ? ' acc' : '')}>{m.role}</span></td>
              <td>{isOwner ? <label className="engtoggle"><input type="checkbox" checked={!!m.engineer} onChange={e => saveEngineer(m.email, e.target.checked).then(reload).then(() => toast(e.target.checked ? `${m.name || m.email} is an engineer` : `${m.name || m.email} is not an engineer`)).catch(err => toast(err.message))} aria-label={'Engineer: ' + m.email} /><span>{m.engineer ? 'Yes' : 'No'}</span></label> : m.engineer ? <span className="chip small info">Engineer</span> : <span className="faint">—</span>}</td>
              <td>{m.role === 'owner' ? <span className="chip small acc">Owner</span> : isOwner ? <label className="engtoggle"><input type="checkbox" checked={!!m.manager} onChange={e => saveManager(m.email, e.target.checked).then(reload).then(() => toast(e.target.checked ? `${m.name || m.email} is a manager` : `${m.name || m.email} is not a manager`)).catch(err => toast(err.message))} aria-label={'Manager: ' + m.email} /><span>{m.manager ? 'Yes' : 'No'}</span></label> : m.manager ? <span className="chip small warn">Manager</span> : <span className="faint">—</span>}</td>
              <td>{m.role === 'owner' ? <span className="note">Everything</span> : isOwner ? <PermEditor value={m.perms || FULL} onChange={p => savePerms(m.email, p).then(reload).then(() => toast(`Saved for ${m.email}`)).catch(err => toast(err.message))} /> : <span className="note">{describe(m)}</span>}</td>
              <td className="r"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>{isOwner && m.email !== email && <button className="btn sm" onClick={() => reset(m.email)}>Reset PIN</button>}{isOwner && m.role !== 'owner' && <button className="btn sm" onClick={() => remove(m.email)}>Remove</button>}</div></td></tr>)}</tbody>
          </table></div>
          {isOwner && <form className="row" style={{ gap: 8 }} onSubmit={invite}>
            <label htmlFor="in" className="sr">First and last name</label>
            <input id="in" className="input grow" required placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} />
            <label htmlFor="ie" className="sr">Email</label>
            <input id="ie" className="input" type="email" placeholder="Email (optional)" value={addr} onChange={e => setAddr(e.target.value)} />
            <button className="btn primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add person'}</button>
          </form>}
          {isOwner && name.trim() && <span className="note">Username will be <b className="mono">{previewUser(name, D.team.map(t => t.username || ''))}</b> · first PIN <b className="mono">123456</b>, changed at their first sign-in.</span>}
          {isOwner && <div className="stack" style={{ gap: 4 }}><span className="note">What the new person can do:</span><PermEditor value={newPerms} onChange={setNewPerms} /></div>}
          {isOwner && <span className="note">Prices and what they can change are locked in the database: someone without prices never gets them sent to their browser. The sections just take pages out of their menu.</span>}
        </section>

        <ShopRoles />

        <DriversBox />

        {isOwner && <section className="card pad stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 24 }}>Change log</h2>
          <p className="muted" style={{ margin: 0 }}>Every change anyone makes: who, when, what it was before and after, and the browser, device and internet address it came from. The database writes this itself, so it can't be skipped or edited. Revisions are marked in amber. Only you can see it.</p>
          <ChangeLog filters />
        </section>}
        {isOwner && <Importer />}

        <section className="card pad stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 24 }}>Recent uploads</h2>
          <div className="tw"><table>
            <thead><tr><th>When</th><th>What</th><th>File</th><th className="hide-sm">Result</th><th className="hide-sm">By</th></tr></thead>
            <tbody>{D.uploads.slice(0, 60).map(u => <tr key={u.id}><td className="num">{shortDate(u.at)}</td><td>{u.kind}</td><td>{u.name}</td><td className="muted hide-sm">{u.detail}</td><td className="muted hide-sm">{u.by}</td></tr>)}
              {!D.uploads.length && <tr><td colSpan={5} className="empty">Nothing uploaded yet.</td></tr>}</tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}

/* Owner-only: load the starter-data folder (seed.json + files/...) with the owner's own session. */
const ORDER = ['parts', 'drawings', 'estimates', 'estimate_lines', 'orders', 'order_lines', 'designs', 'material_requests'] as const;
const CONFLICT: Record<string, string> = { parts: 'key', drawings: 'id', estimates: 'no', orders: 'po', designs: 'id', material_requests: 'id' };

function Importer() {
  const { reload, toast } = useData();
  const pick = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (s: string) => setLog(l => [...l, s]);

  async function run(files: FileList) {
    const all = Array.from(files);
    const seedFile = all.find(f => /(^|\/)seed\.json$/i.test(f.webkitRelativePath || f.name));
    if (!seedFile) { toast('That folder has no seed.json'); return; }
    setBusy(true); setLog([]);
    try {
      const seed = JSON.parse(await seedFile.text());
      for (const t of ORDER) {
        const rows: any[] = seed[t] || [];
        if (!rows.length) continue;
        // Line tables have generated ids, so clear the parent's old lines first to keep a re-run idempotent.
        if (t === 'estimate_lines' || t === 'order_lines') {
          const col = t === 'estimate_lines' ? 'estimate_no' : 'po';
          const parents = [...new Set(rows.map(r => r[col]))];
          for (let i = 0; i < parents.length; i += 200) { const { error } = await supabase.from(t).delete().in(col, parents.slice(i, i + 200)); if (error) throw error; }
        }
        for (let i = 0; i < rows.length; i += 400) {
          const chunk = rows.slice(i, i + 400);
          const { error } = CONFLICT[t] ? await supabase.from(t).upsert(chunk, { onConflict: CONFLICT[t] }) : await supabase.from(t).insert(chunk);
          if (error) throw new Error(`${t}: ${error.message}`);
        }
        say(`${t}: ${rows.length} rows`);
      }
      // Everything under files/ goes to the documents bucket at the same relative path.
      const docs = all.filter(f => /(^|\/)files\//.test(f.webkitRelativePath));
      let done = 0, failed = 0;
      for (let i = 0; i < docs.length; i += 4) {
        await Promise.all(docs.slice(i, i + 4).map(async f => {
          const path = f.webkitRelativePath.replace(/^.*?files\//, '');
          const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || 'application/pdf' });
          if (error) failed++; else done++;
        }));
        if (i % 40 === 0) setLog(l => [...l.filter(x => !x.startsWith('files:')), `files: ${done + failed} of ${docs.length}…`]);
      }
      setLog(l => [...l.filter(x => !x.startsWith('files:')), `files: ${done} uploaded${failed ? `, ${failed} failed` : ''}`]);
      await supabase.from('uploads').insert({ kind: 'starter data', name: seedFile.name, detail: `${ORDER.map(t => (seed[t] || []).length).reduce((a, b) => a + b, 0)} rows, ${done} files` });
      await reload();
      toast('Starter data loaded');
    } catch (e: any) { say('Stopped: ' + e.message); toast(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="card pad stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 24 }}>Import starter data</h2>
      <span className="note">Pick the <b>nvent-starter-data</b> folder. It loads the parts, drawings, estimates, POs and material requests from the first build, plus the PDFs. Safe to run again: rows are updated, not doubled.</span>
      <div className="row"><button className="btn primary" disabled={busy} onClick={() => pick.current?.click()}>{busy ? 'Importing…' : 'Choose folder'}</button></div>
      <input ref={pick} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={e => { const f = e.target.files; if (f?.length) run(f); e.target.value = ''; }} />
      {log.length > 0 && <div className="callout mono" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{log.join('\n')}</div>}
    </section>
  );
}

const FULL: Perms = { sections: SECTIONS.map(([k]) => k), prices: true, access: 'edit' };
/** first initial + last name, like the database makes it */
function previewUser(name: string, taken: string[]) {
  const w = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let base = (w.length >= 2 ? w[0][0] + w[w.length - 1] : w[0] || 'user').replace(/[^a-z0-9]/g, '') || 'user';
  let u = base, n = 1; const t = new Set(taken.map(x => x.toLowerCase()));
  while (t.has(u)) { n++; u = base + n; }
  return u;
}
async function saveManager(email: string, on: boolean) {
  const { error } = await supabase.from('team_members').update({ manager: on }).eq('email', email);
  if (error) throw new Error(error.message);
}
async function saveEngineer(email: string, on: boolean) {
  const { error } = await supabase.from('team_members').update({ engineer: on }).eq('email', email);
  if (error) throw new Error(error.message);
}
async function savePerms(email: string, p: Perms) {
  const { error } = await supabase.from('team_members').update({ perms: p }).eq('email', email);
  if (error) throw new Error(error.message);
}
function describe(m: Member) {
  const p = m.perms || FULL;
  const acc = p.access === 'view' ? 'View only' : p.access === 'status' ? 'Status updates' : 'Can edit';
  return `${acc}${p.prices === false ? ', no prices' : ''}${p.sections && p.sections.length < SECTIONS.length ? ' · ' + p.sections.length + ' sections' : ''}`;
}
/** Sections they see, whether they see prices, and what they can change. */
function PermEditor({ value, onChange }: { value: Perms; onChange: (p: Perms) => void }) {
  const secs = new Set<Section>(value.sections && value.sections.length ? value.sections : SECTIONS.map(([k]) => k));
  const set = (patch: Partial<Perms>) => onChange({ ...FULL, ...value, sections: [...secs], ...patch });
  const toggle = (k: Section) => { const n = new Set(secs); if (n.has(k)) n.delete(k); else n.add(k); if (!n.size) return; set({ sections: SECTIONS.map(([x]) => x).filter(x => n.has(x)) }); };
  return (
    <div className="perms">
      <span className="grp">{SECTIONS.map(([k, label]) => <label key={k}><input type="checkbox" checked={secs.has(k)} onChange={() => toggle(k)} />{label}</label>)}</span>
      <span className="grp"><label><input type="checkbox" checked={value.prices !== false} onChange={e => set({ prices: e.target.checked })} />Sees prices</label></span>
      <span className="grp">
        {([['edit', 'Can edit'], ['status', 'Status updates only'], ['view', 'View only']] as const).map(([k, label]) =>
          <label key={k}><input type="radio" checked={(value.access || 'edit') === k} onChange={() => set({ access: k })} />{label}</label>)}
      </span>
    </div>
  );
}
