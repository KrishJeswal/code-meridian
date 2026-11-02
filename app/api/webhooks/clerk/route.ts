import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Mirrors Clerk organizations into Postgres so every table's org_id foreign
// key has a row to point at, and deleting the organization in Clerk cascades
// to all of its data. Clerk retries on non-2xx, so both writes are idempotent.
export async function POST(req: NextRequest): Promise<Response> {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const db = createAdminSupabase();

  if (evt.type === "organization.created") {
    const { error } = await db
      .from("organizations")
      .upsert({ id: evt.data.id }, { onConflict: "id", ignoreDuplicates: true });
    if (error) return new Response(error.message, { status: 500 });
  } else if (evt.type === "organization.deleted") {
    if (!evt.data.id) return new Response("Missing organization id", { status: 400 });
    const { error } = await db.from("organizations").delete().eq("id", evt.data.id);
    if (error) return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
