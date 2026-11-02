import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

const LIST_LIMIT = 50;

// Fixed UTC format rather than toLocaleString: this renders on the server,
// whose locale and time zone say nothing about the reader's.
function formatTime(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

async function OrganizationHeader() {
  const { orgId, sessionClaims } = await auth();
  if (!orgId) return null;
  return (
    <div className="flex items-baseline gap-3">
      <h1 className="text-sm font-medium">
        {sessionClaims?.org_name ?? (
          <span className="text-text-muted">
            session token has no org_name claim
          </span>
        )}
      </h1>
      <span className="font-mono text-[11px] text-text-muted">{orgId}</span>
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
      <p className="py-6 text-text-muted">
        This organization hasn&apos;t analysed a repository yet.
      </p>
    );
  }

  return (
    <>
      <table className="w-full border-collapse text-left">
        <thead className="text-[11px] text-text-muted">
          <tr className="border-b border-border">
            <th className="py-1 pr-4 font-normal">repository</th>
            <th className="py-1 pr-4 font-normal">commit</th>
            <th className="py-1 pr-4 font-normal">state</th>
            <th className="py-1 pr-4 text-right font-normal">files parsed</th>
            <th className="py-1 pr-4 text-right font-normal">skipped</th>
            <th className="py-1 font-normal">started</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id} className="border-b border-border align-top">
              <td className="py-1 pr-4 font-mono text-xs">
                {a.project
                  ? `${a.project.repo_owner}/${a.project.repo_name}`
                  : null}
              </td>
              <td className="py-1 pr-4 font-mono text-xs text-text-muted">
                {a.commit_sha?.slice(0, 7)}
              </td>
              <td className="py-1 pr-4">
                {a.status}
                {a.error ? (
                  <div className="text-[11px] text-text-muted">{a.error}</div>
                ) : null}
              </td>
              <td className="py-1 pr-4 text-right font-mono text-xs tabular-nums">
                {a.files_parsed !== null && a.files_total !== null
                  ? `${a.files_parsed}/${a.files_total}`
                  : null}
              </td>
              <td className="py-1 pr-4 text-right font-mono text-xs tabular-nums">
                {a.files_skipped}
              </td>
              <td className="py-1 font-mono text-xs text-text-muted">
                {formatTime(a.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === LIST_LIMIT ? (
        <p className="pt-2 text-[11px] text-text-muted">
          Showing the {LIST_LIMIT} most recent.
        </p>
      ) : null}
    </>
  );
}

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-3 p-3">
      <Suspense>
        <OrganizationHeader />
      </Suspense>
      <Suspense
        fallback={<p className="py-6 text-text-muted">Loading analyses…</p>}
      >
        <AnalysesList />
      </Suspense>
    </section>
  );
}
