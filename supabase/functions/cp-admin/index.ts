// Server-side gate for crocodile-pit's admin (host) writes.
//
// The 4 original tables used to have wide-open RLS (anon could insert/
// update/delete directly), so the client-side PIN check in admin.html
// was cosmetic only - anyone could bypass the UI and hit the Supabase
// REST API directly. RLS on these tables is now SELECT-only for anon;
// all writes must go through here, where the PIN is checked against a
// secret that never ships to the browser, using service_role to
// perform the actual write.
//
// cp_players added 2026-11-13: admin.html's unblock/kick/bulk-reassign/
// delteam/round-reset actions were writing to it directly, the same
// bypass as the original 4 tables. cp_players ALSO still needs real
// anon write access for the public join flow (index.html) - a player
// joining/leaving/self-blocking - so unlike the other 4 tables, RLS on
// it stays open for anon rather than SELECT-only. The 3 fields that are
// genuinely admin-only (team_id, quota_reset_at, blocked:true->false)
// are locked at the database level by a BEFORE UPDATE trigger instead
// (cp_players_guard_admin_fields, see migration) - this function being
// the only service_role caller is what lets that trigger's exception
// get bypassed for legitimate admin writes.
//
// Deploy with:
//   supabase functions deploy cp-admin
// then set the secret once with:
//   supabase secrets set CP_ADMIN_PIN=<the pin>

import { createClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
function applyFilter(q: any, filter: { column: string; value: unknown; op?: "eq" | "in" }) {
  return filter.op === "in" ? q.in(filter.column, filter.value as never[]) : q.eq(filter.column, filter.value as never);
}

const ALLOWED_TABLES = new Set(["cp_rooms", "cp_teams", "cp_rounds", "cp_sequences", "cp_players"]);
const ALLOWED_ACTIONS = new Set(["insert", "update", "delete", "upsert", "verify"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const adminPin = Deno.env.get("CP_ADMIN_PIN");
  if (!adminPin) {
    return new Response(JSON.stringify({ error: "CP_ADMIN_PIN not configured" }), { status: 500 });
  }

  let body: {
    pin?: string;
    table?: string;
    action?: string;
    payload?: unknown;
    filter?: { column: string; value: unknown; op?: "eq" | "in" };
    onConflict?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { pin, table, action, payload, filter, onConflict } = body;

  if (pin !== adminPin) {
    return new Response(JSON.stringify({ error: "Wrong PIN" }), { status: 401 });
  }

  if (action === "verify") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!table || !ALLOWED_TABLES.has(table)) {
    return new Response(JSON.stringify({ error: "Unknown or disallowed table" }), { status: 400 });
  }
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query;
  if (action === "insert") {
    query = supabaseAdmin.from(table).insert(payload as never).select();
  } else if (action === "upsert") {
    query = supabaseAdmin.from(table).upsert(payload as never, onConflict ? { onConflict } : undefined).select();
  } else if (action === "update") {
    let q = supabaseAdmin.from(table).update(payload as never);
    if (filter) q = applyFilter(q, filter);
    query = q.select();
  } else {
    // delete
    let q = supabaseAdmin.from(table).delete();
    if (filter) q = applyFilter(q, filter);
    query = q.select();
  }

  const { data, error } = await query;
  return new Response(JSON.stringify({ data, error }), {
    status: error ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
