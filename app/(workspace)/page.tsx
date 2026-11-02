import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

async function CurrentOrganization() {
  const { orgId, orgRole, sessionClaims } = await auth();

  if (!orgId) {
    return <p className="text-text-muted">No active organization.</p>;
  }

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      <dt className="text-text-muted">organization</dt>
      <dd>
        {sessionClaims?.org_name ?? (
          <span className="text-text-muted">
            session token has no org_name claim
          </span>
        )}
      </dd>
      <dt className="text-text-muted">id</dt>
      <dd className="font-mono text-xs">{orgId}</dd>
      <dt className="text-text-muted">role</dt>
      <dd className="font-mono text-xs">{orgRole}</dd>
    </dl>
  );
}

export default function WorkspacePage() {
  return (
    <section className="p-3">
      <Suspense>
        <CurrentOrganization />
      </Suspense>
    </section>
  );
}
