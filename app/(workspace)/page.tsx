import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

const LIST_LIMIT = 50;

// Fixed UTC format rather than toLocaleString: this renders on the server,
// whose locale and time zone say nothing about the reader's.
function formatTime(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

const th = "h-7 px-3 font-normal whitespace-nowrap";
const td = "px-3 py-1.5 whitespace-nowrap";

async function OrganizationHeader() {
  const { orgId, sessionClaims } = await auth();
  if (!orgId) return null;
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
        {sessionClaims?.org_name ?? (
          <span className="font-normal text-text-muted">
            session token has no org_name claim
          </span>
        )}
      </h1>
      <span className="truncate font-mono text-[11px] text-text-faint">
        {orgId}
      </span>
    </div>
  );
}

// No organization filter here on purpose: the row-level security policy on
// analyses returns only the active organization's rows, read from the token.
// If another organization's row ever shows up, the policy is the bug.
async function AnalysesList() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, commit_sha, created_at, finished_at, files_total, files_parsed, files_skipped, error, project:projects (repo_owner, repo_name)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw new Error(`Loading analyses failed: ${error.message}`);

  if (data.length === 0) {
    return (
      <p className="px-3 py-8 text-text-muted">
        This organization hasn&apos;t analysed a repository yet.
      </p>
    );
  }

  return (
    <>
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-sunken text-[11px] text-text-muted">
          <tr className="shadow-[inset_0_-1px_0_var(--border)]">
            <th className={th}>Repository</th>
            <th className={th}>Commit</th>
            <th className={th}>State</th>
            <th className={`${th} text-right`}>Files parsed</th>
            <th className={`${th} text-right`}>Skipped</th>
            <th className={`${th} w-full`}>Started</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border align-top hover:bg-surface-raised"
            >
              <td className={`${td} font-mono text-xs font-medium`}>
                {a.project ? (
                  <>
                    <span className="text-text-muted">
                      {a.project.repo_owner}/
                    </span>
                    {a.project.repo_name}
                  </>
                ) : null}
              </td>
              <td className={`${td} font-mono text-xs text-text-muted`}>
                {a.commit_sha?.slice(0, 7)}
              </td>
              <td className={td}>
                {a.status}
                {a.error ? (
                  <div className="mt-0.5 max-w-[40ch] whitespace-normal text-[11px] leading-snug text-text-muted">
                    {a.error}
                  </div>
                ) : null}
              </td>
              <td className={`${td} text-right font-mono text-xs`}>
                {a.files_parsed !== null && a.files_total !== null ? (
                  <>
                    {a.files_parsed}
                    <span className="text-text-faint">/{a.files_total}</span>
                  </>
                ) : null}
              </td>
              <td className={`${td} text-right font-mono text-xs`}>
                {a.files_skipped}
              </td>
              <td className={`${td} font-mono text-xs text-text-muted`}>
                {formatTime(a.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === LIST_LIMIT ? (
        <p className="px-3 py-2 text-[11px] text-text-muted">
          Showing the {LIST_LIMIT} most recent.
        </p>
      ) : null}
    </>
  );
}

export default function DashboardPage() {
  return (
    <section className="flex min-h-full flex-col">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-3">
        <Suspense>
          <OrganizationHeader />
        </Suspense>
      </div>
      <Suspense
        fallback={<p className="px-3 py-8 text-text-muted">Loading analyses…</p>}
      >
        <AnalysesList />
      </Suspense>
    </section>
  );
}
