-- Demo rows for the dashboard until something creates real analyses.
-- Three organizations: two that a developer belongs to (so switching between
-- them visibly changes the list) and one nobody signs in to, whose rows must
-- never appear. Commit SHAs are left null rather than faked. Idempotent.

insert into public.organizations (id) values
  ('org_3LLVEqYodYDAqZAiJuD4LDQtW8Y'),
  ('org_3LWqhfY3XEhUl0zSnUJVJaCraDz'),
  ('org_seed_nobody')
on conflict (id) do nothing;

insert into public.projects (id, org_id, repo_owner, repo_name) values
  ('a0000000-0000-4000-8000-000000000001', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'vercel', 'next.js'),
  ('a0000000-0000-4000-8000-000000000002', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'facebook', 'react'),
  ('a0000000-0000-4000-8000-000000000003', 'org_3LWqhfY3XEhUl0zSnUJVJaCraDz', 'sindresorhus', 'ky'),
  ('a0000000-0000-4000-8000-000000000004', 'org_seed_nobody', 'expressjs', 'express')
on conflict (id) do nothing;

insert into public.analyses
  (id, org_id, project_id, status, error, files_total, files_parsed, files_skipped,
   created_by, created_at, started_at, finished_at)
values
  ('b0000000-0000-4000-8000-000000000001', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'a0000000-0000-4000-8000-000000000001',
   'complete', null, 2140, 2096, 44,
   'seed', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days' + interval '3 minutes'),
  ('b0000000-0000-4000-8000-000000000002', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'a0000000-0000-4000-8000-000000000002',
   'failed', 'Repository archive exceeded the size limit', null, null, null,
   'seed', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day' + interval '20 seconds'),
  ('b0000000-0000-4000-8000-000000000003', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'a0000000-0000-4000-8000-000000000001',
   'running', null, null, null, null,
   'seed', now() - interval '5 minutes', now() - interval '5 minutes', null),
  ('b0000000-0000-4000-8000-000000000004', 'org_3LLVEqYodYDAqZAiJuD4LDQtW8Y', 'a0000000-0000-4000-8000-000000000002',
   'queued', null, null, null, null,
   'seed', now() - interval '1 minute', null, null),
  ('b0000000-0000-4000-8000-000000000005', 'org_3LWqhfY3XEhUl0zSnUJVJaCraDz', 'a0000000-0000-4000-8000-000000000003',
   'complete', null, 38, 38, 0,
   'seed', now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' + interval '4 seconds'),
  ('b0000000-0000-4000-8000-000000000006', 'org_seed_nobody', 'a0000000-0000-4000-8000-000000000004',
   'complete', null, 142, 140, 2,
   'seed', now() - interval '6 hours', now() - interval '6 hours', now() - interval '6 hours' + interval '9 seconds')
on conflict (id) do nothing;
