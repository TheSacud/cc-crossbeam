-- Seed the minimum demo projects used by the current frontend.
-- Before running:
-- 1. Create your user in Supabase Auth.
-- 2. Replace the email below with that user's email.

with app_user as (
  select id
  from auth.users
  where email = 'a@a.com'
  limit 1
)
insert into crossbeam.projects (
  id,
  user_id,
  flow_type,
  project_name,
  project_address,
  city,
  status,
  applicant_name,
  is_demo
)
select *
from (
  values
    (
      'a0000000-0000-0000-0000-000000000001'::uuid,
      (select id from app_user),
      'city-review',
      'Pedido de licenciamento - Rua do Serrado 14',
      'Rua do Serrado 14',
      'Viseu',
      'ready',
      'Helena Marques',
      true
    ),
    (
      'a0000000-0000-0000-0000-000000000002'::uuid,
      (select id from app_user),
      'corrections-analysis',
      'Resposta a aperfeicoamento - Quinta das Regadas',
      'Quinta das Regadas, lote 3',
      'Viseu',
      'ready',
      'Manuel Almeida',
      true
    ),
    (
      'b0000000-0000-0000-0000-000000000001'::uuid,
      (select id from app_user),
      'city-review',
      'Demo Judge - Licenciamento Viseu',
      'Rua do Serrado 14',
      'Viseu',
      'ready',
      'Helena Marques',
      true
    ),
    (
      'b0000000-0000-0000-0000-000000000002'::uuid,
      (select id from app_user),
      'corrections-analysis',
      'Demo Judge - Aperfeicoamento Viseu',
      'Quinta das Regadas, lote 3',
      'Viseu',
      'ready',
      'Manuel Almeida',
      true
    )
) as seed_data (
  id,
  user_id,
  flow_type,
  project_name,
  project_address,
  city,
  status,
  applicant_name,
  is_demo
)
where user_id is not null
on conflict (id) do update
set
  user_id = excluded.user_id,
  flow_type = excluded.flow_type,
  project_name = excluded.project_name,
  project_address = excluded.project_address,
  city = excluded.city,
  status = excluded.status,
  applicant_name = excluded.applicant_name,
  is_demo = excluded.is_demo;
