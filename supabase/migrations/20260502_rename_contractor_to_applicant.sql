do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'crossbeam'
      and table_name = 'outputs'
      and column_name = 'contractor_questions_json'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'crossbeam'
      and table_name = 'outputs'
      and column_name = 'applicant_questions_json'
  ) then
    alter table crossbeam.outputs
      rename column contractor_questions_json to applicant_questions_json;
  end if;

  if to_regclass('crossbeam.contractor_answers') is not null
     and to_regclass('crossbeam.applicant_answers') is null then
    alter table crossbeam.contractor_answers rename to applicant_answers;
  end if;

  if to_regclass('crossbeam.contractor_answers_project_id_created_idx') is not null then
    alter index crossbeam.contractor_answers_project_id_created_idx
      rename to applicant_answers_project_id_created_idx;
  end if;

  if exists (
    select 1 from pg_trigger
    where tgname = 'contractor_answers_set_updated_at'
      and tgrelid = to_regclass('crossbeam.applicant_answers')
  ) then
    alter trigger contractor_answers_set_updated_at on crossbeam.applicant_answers
      rename to applicant_answers_set_updated_at;
  end if;
end $$;

alter table crossbeam.outputs
  add column if not exists sheet_annotations_json jsonb;

drop policy if exists "Users can CRUD own contractor answers" on crossbeam.applicant_answers;
drop policy if exists "Users can CRUD own applicant answers" on crossbeam.applicant_answers;

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
