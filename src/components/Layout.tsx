import { useState } from 'react';
import { DriverLinkDialog } from './DriverLink';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useData } from '../lib/data';
import { supabase } from '../lib/supabase';
import { readyToShip, useRfqs } from '../lib/rfq';
import { resetIntro } from './Intro';
import { useEngTasks } from '../lib/engineering';
import { Wordmark } from './Brand';

export default function Layout() {
  const { D, ix, email, toastMsg, toast, perms, isOwner } = useData();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const me = D.team.find(t => t.email === email.toLowerCase());
  const rfqs = useRfqs();
  const ready = readyToShip(rfqs).reduce((a, g) => a + g.lines.length, 0);
  const engTasks = useEngTasks();
  const myEng = engTasks.filter(t => t.active && t.owner === email.toLowerCase() && !t.releasedAt).length;
  // engineers always get Engineering, whatever their sections say
  const isEng = !!me?.engineer || myEng > 0;
  const canSec = (sec: string) => perms.can(sec) || (sec === 'engineering' && isEng);
  // each link's section (for per-person permissions)
  const all: [string, string, number | null, string][] = [
    ['/', 'Home', null, ''],
    ['/analytics', 'Analytics', null, ''],
    ['/catalog', 'Catalog', null, 'compartments'],
    ['/rfqs', 'RFQs', null, 'rfqs'],
    ['/material', 'Material requests', D.requests.length, 'material'],
    ['/job-material', 'Job material', null, 'material'],
    ['/progress', 'In progress', null, 'progress'],
    ['/engineering', 'Engineering', myEng || null, 'engineering'],
    ['/packing', 'Packing slips', ready || null, 'packing'],
    ['/delivered', 'Delivered', null, 'packing'],
    ['/team', 'Team', D.team.length, ''],
  ];
  const links = all.filter(([, , , sec]) => !sec || canSec(sec)).map(([a, b, c]) => [a, b, c] as [string, string, number | null]);
  const secOf = (path: string) => (path.startsWith('/compartments') || path.startsWith('/catalog') || path.startsWith('/parts') || path.startsWith('/revisions') ? 'compartments'
    : path.startsWith('/rfqs') || path.startsWith('/check') ? 'rfqs' : path.startsWith('/material') || path.startsWith('/job-material') ? 'material'
    : path.startsWith('/progress') ? 'progress' : path.startsWith('/engineering') ? 'engineering' : path.startsWith('/packing') || path.startsWith('/delivered') ? 'packing'
    : path.startsWith('/prices') || path.startsWith('/pos') ? (perms.prices ? '' : 'prices') : '');
  const here = secOf(loc.pathname);
  const blocked = here === 'prices' ? true : here ? !canSec(here) : false;
  if (me?.mustChange) return <NewPin name={me.name || me.username || ''} username={me.username || ''} />;
  return (
    <div className="shell">
      <nav className={'nav' + (open ? ' open' : '')} aria-label="Sections" onClick={() => setOpen(false)}>
        <div className="brand"><Wordmark /><span>FabTek × nVent</span></div>
        <div className="navlinks">
          {links.map(([to, label, ct]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive || (to !== '/' && loc.pathname.startsWith(to)) ? 'active' : '') + (to === '/material' || to === '/job-material' || to === '/packing' || to === '/delivered' ? ' subnav' : '')}>
              {label}{ct != null && <span className="ct">{ct}</span>}
            </NavLink>
          ))}
          <a href="/floor/" title="Open Tandem floor screens">Floor</a>
        </div>
        <div className="me">
          <div className="avatar">{(me?.name || email)[0]?.toUpperCase()}</div>
          <div className="who"><b>{me?.name || email.split('@')[0]}</b><span>{email}</span>{!isOwner && (perms.access !== 'edit' || !perms.prices) && <span>{perms.access === 'view' ? 'view only' : perms.access === 'status' ? 'status updates' : 'can edit'}{perms.prices ? '' : ' · no prices'}</span>}</div>
          <div className="stack" style={{ gap: 2 }}>
            <button onClick={e => { e.stopPropagation(); changePassword(toast); }} title="Change your password">Password</button>
            <button onClick={() => { resetIntro(); supabase.auth.signOut(); }} title="Sign out">Sign out</button>
          </div>
        </div>
      </nav>
      <div className="main">
        <div className="mobilebar">
          <Wordmark small />
          <button className="btn sm" aria-label="Menu" onClick={() => setOpen(o => !o)} style={{ background: 'transparent', color: '#fff', borderColor: 'var(--nav-line)' }}>Menu</button>
        </div>
        {blocked ? <div className="content"><div className="empty">You don't have access to this part of TANDEM.{!isOwner && ' Ask the owner if you need it.'}</div></div> : <Outlet />}
      </div>
      <DriverLinkDialog />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

/** first sign-in (or after a reset): pick your own 6-digit PIN before anything else */
function NewPin({ name, username }: { name: string; username: string }) {
  const { reload } = useData();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    if (!/^\d{6}$/.test(a)) return setMsg('Your PIN has to be 6 digits.');
    if (a === '123456' || /^(\d)\1{5}$/.test(a) || '0123456789'.includes(a) || '9876543210'.includes(a)) return setMsg('Pick something harder to guess than that.');
    if (a !== b) return setMsg('The two PINs do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: a });
    if (error) { setBusy(false); return setMsg(error.message); }
    await supabase.rpc('pin_changed');
    await reload();
    setBusy(false);
  };
  return <div className="login"><section className="formside" style={{ margin: '0 auto' }}>
    <form className="card" onSubmit={save}>
      <h2 style={{ fontSize: 28 }}>Welcome{name ? ', ' + name.split(' ')[0] : ''}</h2>
      <span className="note">Pick your own 6-digit PIN. You sign in with your username <b>{username}</b> and this PIN from now on. Your browser can save it for you.</span>
      <label htmlFor="np1">New PIN<input id="np1" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={a} onChange={e => setA(e.target.value.replace(/\D/g, ''))} required /></label>
      <label htmlFor="np2">Type it again<input id="np2" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={b} onChange={e => setB(e.target.value.replace(/\D/g, ''))} required /></label>
      <button className="btn pri" disabled={busy}>{busy ? 'Saving…' : 'Save my PIN'}</button>
      {msg && <div className="callout bad">{msg}</div>}
      <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </form></section></div>;
}

async function changePassword(toast: (m: string) => void) {
  const p = window.prompt('New 6-digit PIN (or a password of at least 6 characters):');
  if (!p) return;
  if (p.length < 6) { toast('At least 6 characters.'); return; }
  if (p === '123456') { toast('Pick something other than 123456.'); return; }
  const { error } = await supabase.auth.updateUser({ password: p });
  toast(error ? error.message : 'Password changed');
}

export function Topbar({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return <header className="topbar"><h1>{title}</h1>{children}</header>;
}
