-- CrossBeam database bootstrap for a fresh Supabase project.
-- Run this in Supabase SQL Editor before starting the app locally.

create extension if not exists pgcrypto;

drop schema if exists crossbeam cascade;
create schema crossbeam;

create table crossbeam.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  flow_type text not null
    check (flow_type in ('city-review', 'corrections-analysis')),
  project_name text not null,
  project_address text,
  city text,
  status text not null default 'ready'
    check (status in (
      'ready',
      'uploading',
      'processing',
      'processing-phase1',
      'awaiting-answers',
      'processing-phase2',
      'completed',
      'failed'
    )),
  error_message text,
  applicant_name text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crossbeam.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references crossbeam.projects(id) on delete cascade not null,
  file_type text not null
    check (file_type in ('plan-binder', 'corrections-letter', 'other')),
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table crossbeam.messages (
  id bigserial primary key,
  project_id uuid references crossbeam.projects(id) on delete cascade not null,
  role text not null
    check (role in ('system', 'assistant', 'tool')),
  content text not null,
  created_at timestamptz not null default now()
);

create table crossbeam.outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references crossbeam.projects(id) on delete cascade not null,
  flow_phase text not null
    check (flow_phase in ('analysis', 'response', 'review')),
  version integer not null default 1,
  corrections_letter_md text,
  corrections_letter_pdf_path text,
  review_checklist_json jsonb,
  corrections_analysis_json jsonb,
  applicant_questions_json jsonb,
  project_understanding_json jsonb,
  response_letter_md text,
  response_letter_pdf_path text,
  professional_scope_md text,
  corrections_report_md text,
  sheet_annotations_json jsonb,
  raw_artifacts jsonb not null default '{}'::jsonb,
  agent_cost_usd numeric(10, 4),
  agent_turns integer,
  agent_duration_ms integer,
  created_at timestamptz not null default now()
);

create table crossbeam.applicant_answers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references crossbeam.projects(id) on delete cascade not null,
  question_key text not null,
  question_text text not null,
  question_type text not null default 'text'
    check (question_type in ('text', 'number', 'choice', 'measurement')),
  options jsonb,
  context text,
  correction_item_id text,
  answer_text text,
  is_answered boolean not null default false,
  output_id uuid references crossbeam.outputs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on crossbeam.projects (user_id);
create index files_project_id_idx on crossbeam.files (project_id);
create index messages_project_id_id_idx on crossbeam.messages (project_id, id);
create index outputs_project_id_phase_created_idx on crossbeam.outputs (project_id, flow_phase, created_at desc);
create index applicant_answers_project_id_created_idx on crossbeam.applicant_answers (project_id, created_at);

create or replace function crossbeam.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on crossbeam.projects
for each row
execute function crossbeam.set_updated_at();

create trigger applicant_answers_set_updated_at
before update on crossbeam.applicant_answers
for each row
execute function crossbeam.set_updated_at();

alter table crossbeam.projects enable row level security;
alter table crossbeam.files enable row level security;
alter table crossbeam.messages enable row level security;
alter table crossbeam.outputs enable row level security;
alter table crossbeam.applicant_answers enable row level security;

create policy "Users can CRUD own projects"
  on crossbeam.projects
  for all
  using (auth.uid() = user_id or is_demo = true)
  with check (auth.uid() = user_id or is_demo = true);

create policy "Users can CRUD own files"
  on crossbeam.files
  for all
  using (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  )
  with check (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  );

create policy "Users can read messages for their projects"
  on crossbeam.messages
  for select
  using (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  );

create policy "Users can read outputs for their projects"
  on crossbeam.outputs
  for select
  using (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  );

create policy "Users can CRUD own applicant answers"
  on crossbeam.applicant_answers
  for all
  using (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  )
  with check (
    exists (
      select 1
      from crossbeam.projects p
      where p.id = project_id
        and (p.user_id = auth.uid() or p.is_demo = true)
    )
  );

alter publication supabase_realtime add table crossbeam.projects;
alter publication supabase_realtime add table crossbeam.messages;

insert into storage.buckets (id, name, public)
values
  ('crossbeam-uploads', 'crossbeam-uploads', false),
  ('crossbeam-outputs', 'crossbeam-outputs', false),
  ('crossbeam-demo-assets', 'crossbeam-demo-assets', true)
on conflict (id) do nothing;
