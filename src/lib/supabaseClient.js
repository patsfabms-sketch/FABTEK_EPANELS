// AssemblyOS shared backend (Supabase). Every device — the desktop manager
// console and every technician's installed phone app — talks to this same
// project, which is what makes the roster, panels, work history, and live
// sessions actually shared instead of trapped in one browser's local
// storage.
//
// The URL and key below are the project's public anon key, meant to be
// embedded in client-side code (same as any Supabase app) — access control
// lives in Postgres Row Level Security policies and the login RPCs, not in
// keeping this key secret. See the assemblyos_* migration for the actual
// security model: operational tables (panels, work history, roster, etc.)
// are open to this key, while PIN/password hashes live in separate tables
// with zero policies, reachable only through the assemblyos_login /
// assemblyos_admin_login-style RPC functions below.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tmzgjhtkcgkhpbusnwcg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtemdqaHRrY2draHBidXNud2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzA3OTAsImV4cCI6MjEwMzIwNjc5MH0._M0X8QWa-DY2ghHrD7kZDvIH1ufROlJnDgHCQmwI0To";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Technicians and admins authenticate through the app's own
    // username+PIN/password RPCs (see assemblyos_login / assemblyos_admin_login),
    // not Supabase Auth sessions — nothing here needs a persisted auth
    // session or URL-based session detection.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const PDF_BUCKET = "assemblyos-pdfs";
