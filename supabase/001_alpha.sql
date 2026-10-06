create table if not exists public.projects (
 id text primary key, owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, model jsonb not null, versions jsonb not null default '[]',
 updated_at timestamptz not null default now(), shared boolean not null default false,
 share_id uuid not null default gen_random_uuid() unique
);
alter table public.projects enable row level security;
create policy owner_projects on public.projects for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create or replace function public.save_home(home_id text, home_name text, home_model jsonb) returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into projects(id,name,model) values(home_id,home_name,home_model)
 on conflict(id) do update set name=excluded.name, model=excluded.model, updated_at=now(),
 versions=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(jsonb_build_array(projects.model)||projects.versions) with ordinality limit 10) v);
end $$;
create or replace function public.read_shared(share_token uuid) returns table(model jsonb) language sql security definer set search_path=public as $$
 select p.model from public.projects p where p.share_id=share_token and p.shared=true;
$$;
revoke all on function public.read_shared(uuid) from public;
grant execute on function public.read_shared(uuid) to anon,authenticated;
revoke all on function public.save_home(text,text,jsonb) from public;
grant execute on function public.save_home(text,text,jsonb) to authenticated;
