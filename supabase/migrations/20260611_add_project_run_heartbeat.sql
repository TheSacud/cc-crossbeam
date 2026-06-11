alter table crossbeam.projects
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_heartbeat_at timestamptz,
  add column if not exists processing_run_id uuid;

create index if not exists projects_processing_heartbeat_idx
  on crossbeam.projects (processing_heartbeat_at)
  where status in ('processing', 'processing-phase1', 'processing-phase2');
