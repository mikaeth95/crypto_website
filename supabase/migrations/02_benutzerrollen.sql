-- =====================================================================
-- 02_benutzerrollen.sql
-- Zwei Benutzertypen: user und admin.
-- Erst ausführen, wenn 01_dritte_normalform.sql erfolgreich gelaufen ist.
-- =====================================================================

begin;

-- 1. Rollenspalte. Jeder bestehende und jeder neue Benutzer ist zuerst "user".
do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'user';

-- 2. Ist der angemeldete Benutzer Administrator?
-- security definer, damit die Funktion profiles lesen kann, ohne selbst
-- an den Zugriffsregeln hängen zu bleiben.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 3. Schutz der Rolle.
-- Ein Standardbenutzer darf seine Rolle nicht selbst ändern.
-- Der letzte Administrator darf nicht herabgestuft werden.
-- Zugriff ohne Anmeldung (SQL-Editor, Registrierungs-Trigger) bleibt erlaubt,
-- damit sich der erste Administrator setzen lässt.
create or replace function public.protect_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role <> 'user' then
      raise exception 'Neue Benutzer bekommen immer die Rolle user';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Nur ein Administrator darf Rollen ändern';
    end if;
    if old.role = 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Der letzte Administrator kann nicht herabgestuft werden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_role();

-- 4. Zusätzliche Rechte für den Administrator auf profiles.
-- Die bestehenden Regeln für den eigenen Datensatz bleiben unverändert.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 5. Benutzerübersicht für den Administrator.
-- Liefert nur Zählwerte, keine Transaktionen und keine Beträge.
-- Für Nicht-Administratoren kommt eine leere Liste zurück.
create or replace function public.admin_user_overview()
returns table (
  id                uuid,
  display_name      text,
  role              public.user_role,
  created_at        timestamptz,
  account_count     bigint,
  transaction_count bigint,
  last_import       timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.role,
    p.created_at,
    (select count(*) from public.represented_accounts ra
      where ra.owner_user_id = p.id),
    (select count(*) from public.imported_transactions t
      join public.represented_accounts ra on ra.id = t.represented_account_id
      where ra.owner_user_id = p.id),
    (select max(f.imported_at) from public.import_history_files f
      join public.represented_accounts ra on ra.id = f.represented_account_id
      where ra.owner_user_id = p.id)
  from public.profiles p
  where public.is_admin()
  order by p.created_at;
$$;

revoke all on function public.admin_user_overview() from public, anon;
grant execute on function public.admin_user_overview() to authenticated;

commit;

-- =====================================================================
-- Ersten Administrator setzen (einmalig, E-Mail anpassen):
--
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'DEINE@ADRESSE.AT');
-- =====================================================================
