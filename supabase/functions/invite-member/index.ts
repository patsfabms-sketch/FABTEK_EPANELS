// Owner-only: add someone to the team (email optional: they sign in with a username), first PIN 123456 that they
// must change at their first sign-in; or reset someone back to 123456. No emails are sent.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, cors, json, teamMember } from "../_shared/auth.ts";

async function findUser(sb: ReturnType<typeof admin>, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await teamMember(req);
  if (!me || me.role !== "owner") return json({ error: "Only the team owner can add people or reset passwords." }, 403);

  const { email, name, role, password, action } = await req.json().catch(() => ({}));
  const sb = admin();
  // no email: sign in by username; the account gets an address nobody mails (username@team.fabtekindustries.com)
  let addr = String(email || "").trim().toLowerCase();
  let username = "";
  if (action !== "reset" && !addr) {
    if (!String(name || "").trim()) return json({ error: "Enter their name." }, 400);
    const { data: u, error: ue } = await sb.rpc("make_username_rpc", { p_name: name, p_email: null });
    if (ue) return json({ error: ue.message }, 500);
    username = String(u);
    addr = `${username}@team.fabtekindustries.com`;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return json({ error: "Enter a valid email address, or leave it empty to use a username." }, 400);
  // first sign-in: PIN 123456, and they have to pick their own
  const pw = String(password || "123456");
  if (pw.length < 6) return json({ error: "PINs and passwords need at least 6 characters." }, 400);
  const first = !password || pw === "123456";

  try {
    const existing = await findUser(sb, addr);
    if (action === "reset") {
      if (!existing) return json({ error: "That person has no account yet. Add them instead." }, 404);
      const { error } = await sb.auth.admin.updateUserById(existing.id, { password: pw });
      if (error) return json({ error: error.message }, 500);
      await sb.from("team_members").update({ must_change: first }).eq("email", addr);
      return json({ ok: true, email: addr, reset: true, pin: first ? "123456" : null });
    }
    const { error: rowErr } = await sb.from("team_members")
      .upsert({ email: addr, name: name || null, role: role === "owner" ? "owner" : "member", must_change: first,
        ...(username ? { username } : {}) }, { onConflict: "email" });
    if (rowErr) return json({ error: rowErr.message }, 500);
    if (existing) {
      const { error } = await sb.auth.admin.updateUserById(existing.id, { password: pw, email_confirm: true });
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await sb.auth.admin.createUser({ email: addr, password: pw, email_confirm: true });
      if (error) return json({ error: error.message }, 500);
    }
    // people added with an email get a username too
    const { data: row } = await sb.from("team_members").select("username").eq("email", addr).maybeSingle();
    if (!row?.username) {
      const { data: u } = await sb.rpc("make_username_rpc", { p_name: name || "", p_email: addr });
      await sb.from("team_members").update({ username: u }).eq("email", addr);
      username = String(u);
    } else username = row.username;
    return json({ ok: true, email: addr, username, pin: first ? "123456" : null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
