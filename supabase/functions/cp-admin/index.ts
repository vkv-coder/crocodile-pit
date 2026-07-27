// Server-side gate for crocodile-pit's admin (host) writes.
//
// The 4 tables below used to have wide-open RLS (anon could insert/
// update/delete directly), so the client-side PIN check in admin.html
// was cosmetic only - anyone could bypass the UI and hit the Supabase
// REST API directly. RLS on these tables is now SELECT-only for anon;
// all writes must go through here, where the PIN is checked against a
// secret that never ships to the browser, using service_role to
// perform the actual write.
//
// Deploy with:
//   supabase functions deploy cp-admin
// then set the secret once with:
//   supabase secrets set CP_ADMIN_PIN=<the pin>

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_TABLES = new Set(["cp_rooms", "cp_teams", "cp_rounds", "cp_sequences"]);
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
    filter?: { column: string; value: unknown };
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
    if (filter) q = q.eq(filter.column, filter.value as never);
    query = q.select();
  } else {
    // delete
    let q = supabaseAdmin.from(table).delete();
    if (filter) q = q.eq(filter.column, filter.value as never);
    query = q.select();
  }

  const { data, error } = await query;
  return new Response(JSON.stringify({ data, error }), {
    status: error ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
