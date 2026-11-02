// NEXT_PUBLIC_ values are inlined at build time only when referenced as
// literal `process.env.NAME` expressions, so each one is spelled out here.
const values = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
};

const serverOnly = ["CLERK_SECRET_KEY"] as const;

// Called from next.config.ts, which runs before dev, build and start, so a
// missing value stops the process on boot instead of surfacing as a Clerk or
// Supabase error deep inside a request.
export function assertEnv(): void {
  const missing = [
    ...Object.entries(values)
      .filter(([, v]) => !v?.trim())
      .map(([k]) => k),
    ...serverOnly.filter((k) => !process.env[k]?.trim()),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}\nSet them in .env.local.`,
    );
  }
}

export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url?.trim() || !publishableKey?.trim()) {
    throw new Error("Supabase environment variables are missing");
  }
  return { url, publishableKey };
}
