import { useState } from 'react';
import { configured, supabase } from '../lib/supabase';
import { FullLogo } from '../components/Brand';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    // a username (first initial + last name) or an email
    const who = email.trim().toLowerCase();
    let addr = who;
    if (!who.includes('@')) {
      const { data } = await supabase.rpc('login_email', { p_user: who });
      addr = (data as string) || '';
    }
    const { error } = addr ? await supabase.auth.signInWithPassword({ email: addr, password }) : { error: { message: 'invalid' } };
    setBusy(false);
    if (error) setMsg(/invalid/i.test(error.message) ? 'That username and PIN do not match. Ask the owner to reset your PIN if you forgot it.' : error.message);
  }

  return (
    <div className="login">
      <section className="stage">
        <FullLogo className="stage-logo" />
        <p>RFQs, prints, estimates, POs, shop status and packing slips for nVent work, all in one place.</p>
      </section>
      <section className="formside">
        <form className="card" onSubmit={signIn}>
          <h2 style={{ fontSize: 28 }}>Sign in</h2>
          {!configured && <div className="callout bad">This build is missing its Supabase settings (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY).</div>}
          <label htmlFor="email">Username <span className="faint">or email</span>
            <input id="email" className="input" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. jsmith" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label htmlFor="pw">PIN <span className="faint">or password</span>
            <input id="pw" className="input" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button className="btn pri" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {msg && <div className="callout bad">{msg}</div>}
          <span className="faint" style={{ fontSize: 13 }}>Accounts are set up by the owner. Drawings and prices stay private to your team.</span>
        </form>
      </section>
    </div>
  );
}
