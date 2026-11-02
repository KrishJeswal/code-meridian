-- Every row belongs to a Clerk organization. Reads are authorized by policy
-- against the `o.id` claim of the Clerk session token (v2 token format);
-- application code never filters by organization.
--
-- Child tables carry org_id directly (so each policy is a single column
-- comparison, no joins) and also reference their parent through composite
-- keys that include org_id or analysis_id. That makes it impossible for a
-- file to sit under another organization's analysis, or for an edge to join
-- files from two different analyses.

create table public.organizations (
  id text primary key check (id like 'org\_%'),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  repo_owner text not null,
  repo_name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, repo_owner, repo_name),
  unique (id, org_id)
);

create type public.analysis_status as enum ('queued', 'running', 'complete', 'failed');

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  commit_sha text,
  status public.analysis_status not null default 'queued',
  error text,
  files_total integer check (files_total >= 0),
  files_parsed integer check (files_parsed >= 0),
  files_skipped integer check (files_skipped >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  unique (id, org_id),
  check ((status = 'failed') = (error is not null))
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  size_bytes integer check (size_bytes >= 0),
  parsed boolean not null,
  skip_reason text,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  unique (analysis_id, path),
  unique (id, analysis_id),
  -- A skipped file must say why; a parsed one must not claim a reason.
  check (parsed = (skip_reason is null))
);

create type public.edge_kind as enum ('import', 'reexport', 'dynamic', 'require');

-- One row per import the parser saw. A null target means the import could
-- not be resolved to a file in the repository, and the reason is mandatory.
create table public.edges (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid,
  specifier text not null,
  kind public.edge_kind not null,
  type_only boolean not null default false,
  unresolved_reason text,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (source_file_id, analysis_id) references public.files (id, analysis_id) on delete cascade,
  foreign key (target_file_id, analysis_id) references public.files (id, analysis_id) on delete cascade,
  check ((target_file_id is null) = (unresolved_reason is not null))
);

create table public.routes (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  path text not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, analysis_id) references public.files (id, analysis_id) on delete cascade,
  unique (file_id, method, path)
);

-- Keyed by a hash of everything the explanation was generated from (file
-- content, neighbour paths, prompt version, model), not by file row, so a
-- re-analysis of unchanged code is a cache hit.
create table public.explanations (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  input_hash text not null,
  model text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (org_id, input_hash)
);

create type public.file_role_source as enum ('convention', 'model');

create table public.file_roles (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null,
  source public.file_role_source not null,
  model text,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, analysis_id) references public.files (id, analysis_id) on delete cascade,
  unique (file_id),
  check ((source = 'model') = (model is not null))
);

-- Per-file facts computed from the edge list. blast_radius is the number of
-- distinct files that depend on this one within two levels.
create table public.insights (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  fan_in integer not null check (fan_in >= 0),
  fan_out integer not null check (fan_out >= 0),
  blast_radius integer not null check (blast_radius >= 0),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, analysis_id) references public.files (id, analysis_id) on delete cascade,
  unique (file_id)
);

-- org_id leads every policy predicate and every cascade from organizations.
create index on public.projects (org_id);
create index on public.analyses (org_id, created_at desc);
create index on public.analyses (project_id);
create index on public.files (org_id);
create index on public.edges (org_id);
create index on public.edges (analysis_id);
create index on public.edges (source_file_id);
create index on public.edges (target_file_id);
create index on public.routes (org_id);
create index on public.routes (analysis_id);
create index on public.file_roles (org_id);
create index on public.file_roles (analysis_id);
create index on public.insights (org_id);
create index on public.insights (analysis_id);

-- The project's dashboard trigger already enables RLS on new public tables,
-- but it swallows failures and lives outside version control. Enabling it
-- here makes the migration the source of truth.
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on
-- new tables. Nothing here is public, and no phase writes as a user yet, so
-- signed-in users get SELECT only; write grants arrive with the phase that
-- writes. The Clerk webhook writes organizations with the secret key
-- (service_role), which is unaffected.
revoke all on
  public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles,
  public.insights
from anon, authenticated;

grant select on
  public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles,
  public.insights
to authenticated;

create policy "members read their organization"
on public.organizations for select to authenticated
using (id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.projects for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.analyses for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.files for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.edges for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.routes for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.explanations for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.file_roles for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read organization rows"
on public.insights for select to authenticated
using (org_id = (select auth.jwt() -> 'o' ->> 'id'));
