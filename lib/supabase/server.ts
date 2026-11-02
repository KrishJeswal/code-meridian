import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

// Supabase never owns a session here: Clerk does. The Clerk session token
// (which carries the `o` organization claim) is attached to every request so
// policies can read it via auth.jwt(). Throwing on a missing token is
// deliberate — an anonymous request would pass silently and return no rows
// once policies exist.
export function createServerSupabase(): SupabaseClient {
  const { url, publishableKey } = supabaseEnv();
  return createClient(url, publishableKey, {
    async accessToken() {
      const token = await (await auth()).getToken();
      if (!token) {
        throw new Error("Supabase request attempted without a Clerk session");
      }
      return token;
    },
  });
}
