import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

// Supabase never owns a session here: Clerk does. The Clerk session token
// (which carries the `o` organization claim) is attached to every request so
// policies can read it via auth.jwt(). Throwing on a missing token is
// deliberate: an anonymous request would pass silently and return no rows.
//
// auth() is awaited before the client exists because supabase-js calls
// accessToken() eagerly at construction to prime Realtime. Without this, a
// client built during prerender calls auth() outside a request and fails.
export async function createServerSupabase(): Promise<SupabaseClient<Database>> {
  const { getToken } = await auth();
  const { url, publishableKey } = supabaseEnv();
  return createClient<Database>(url, publishableKey, {
    async accessToken() {
      const token = await getToken();
      if (!token) {
        throw new Error("Supabase request attempted without a Clerk session");
      }
      return token;
    },
  });
}
