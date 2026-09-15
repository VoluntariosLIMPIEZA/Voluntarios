-- Voluntarios de Limpieza — esquema Supabase
-- Pegar en: SQL Editor → New query → Run

create table if not exists public.voluntarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dias text[] not null default '{}',
  es_capitan boolean not null default false,
  dias_capitan text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.configuracion (
  id text primary key default 'default',
  dias jsonb not null default '{"Martes":3,"Miércoles":3,"Jueves":3,"Viernes":3,"Sábado":3}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.configuracion (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.planillas (
  id uuid primary key default gen_random_uuid(),
  periodo text not null unique,
  etiqueta text not null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  asignaciones jsonb not null default '{}'::jsonb,
  config_usada jsonb not null default '{}'::jsonb,
  creada timestamptz not null default now()
);

alter table public.voluntarios enable row level security;
alter table public.configuracion enable row level security;
alter table public.planillas enable row level security;

drop policy if exists "anon_voluntarios" on public.voluntarios;
drop policy if exists "anon_configuracion" on public.configuracion;
drop policy if exists "anon_planillas" on public.planillas;

create policy "anon_voluntarios"
  on public.voluntarios for all to anon
  using (true) with check (true);

create policy "anon_configuracion"
  on public.configuracion for all to anon
  using (true) with check (true);

create policy "anon_planillas"
  on public.planillas for all to anon
  using (true) with check (true);

grant select, insert, update, delete on public.voluntarios to anon, authenticated;
grant select, insert, update, delete on public.configuracion to anon, authenticated;
grant select, insert, update, delete on public.planillas to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['voluntarios', 'configuracion', 'planillas']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
