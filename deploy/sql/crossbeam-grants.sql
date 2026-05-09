grant usage on schema crossbeam to anon, authenticated, service_role;
grant select on all tables in schema crossbeam to anon;
grant select, insert, update, delete on all tables in schema crossbeam to authenticated, service_role;
grant usage, select on all sequences in schema crossbeam to anon, authenticated, service_role;

alter default privileges in schema crossbeam grant select on tables to anon;
alter default privileges in schema crossbeam grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema crossbeam grant usage, select on sequences to anon, authenticated, service_role;
