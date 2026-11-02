-- Every composite foreign key gets an index whose leading columns match it,
-- so cascading deletes from analyses and files don't scan child tables.
-- These replace the single-column indexes from init_schema that only covered
-- the first column.

drop index public.analyses_project_id_idx;
drop index public.edges_analysis_id_idx;
drop index public.edges_source_file_id_idx;
drop index public.edges_target_file_id_idx;
drop index public.routes_analysis_id_idx;
drop index public.file_roles_analysis_id_idx;
drop index public.insights_analysis_id_idx;

create index on public.analyses (project_id, org_id);
create index on public.files (analysis_id, org_id);
create index on public.edges (analysis_id, org_id);
create index on public.edges (source_file_id, analysis_id);
create index on public.edges (target_file_id, analysis_id);
create index on public.routes (analysis_id, org_id);
create index on public.routes (file_id, analysis_id);
create index on public.file_roles (analysis_id, org_id);
create index on public.file_roles (file_id, analysis_id);
create index on public.insights (analysis_id, org_id);
create index on public.insights (file_id, analysis_id);

-- Same plan as before (the claim is read once per query as an InitPlan), but
-- written as (select auth.jwt()) so Supabase's performance advisor
-- recognises it instead of flagging every policy.
alter policy "members read their organization" on public.organizations
  using (id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.projects
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.analyses
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.files
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.edges
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.routes
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.explanations
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.file_roles
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
alter policy "members read organization rows" on public.insights
  using (org_id = (select auth.jwt()) -> 'o' ->> 'id');
