import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv, supabaseSecretKey } from "@/lib/env";
import type { Database } from "./database.types";

// Bypasses row-level security. Only for requests that have no signed-in user
// to act as (Clerk webhooks). Anything acting for a user goes through
// createServerSupabase so the policy decides what it sees.
export function createAdminSupabase(): SupabaseClient<Database> {
  const { url } = supabaseEnv();
  return createClient<Database>(url, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
