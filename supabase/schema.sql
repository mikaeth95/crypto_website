-- =====================================================================
-- schema.sql
-- Sollzustand der Datenbank des Crypto Portfolio Dashboards.
--
-- Diese Datei beschreibt das Schema nach 01_dritte_normalform.sql und
-- 02_benutzerrollen.sql. Sie ist für eine LEERE Datenbank gedacht und setzt
-- dort alles in einem Durchlauf richtig auf.
-- Eine bestehende Datenbank wird NICHT mit dieser Datei, sondern mit den
-- Skripten in supabase/migrations/ in ihrer Reihenfolge umgestellt.
--
-- Grundsatz: Es gibt keinen eigenen Applikationsserver. Der Browser spricht
-- direkt mit der Datenbank. Die gesamte Zugriffskontrolle liegt deshalb in
-- den Row-Level-Security-Regeln weiter unten.
--
-- Eigentum wird nur an zwei Stellen gespeichert:
--   represented_accounts.owner_user_id  (Börsenkonten)
--   user_preferences.owner_user_id      (Einstellungen, 1:1 zum Benutzer)
-- Alle anderen Tabellen hängen über das Börsenkonto am Benutzer.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Hilfsfunktion: updated_at bei jeder Änderung setzen
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Benutzertypen
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

-- Profil je Benutzer aus auth.users. Die Rolle steuert die Zusatzrechte des Administrators.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_len
    check (display_name is null or char_length(display_name) <= 60)
);

-- Börsenkonto. provider ist die Plattform (z. B. crypto_com_exchange) oder
-- "all" für das Sammelkonto. Plattform und Börse einer Transaktion ergeben
-- sich ausschließlich von hier.
create table if not exists public.represented_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  provider text not null,
  base_currency text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint represented_accounts_owner_provider_name_key unique (owner_user_id, provider, name)
);

-- Kopf einer Chart-Zusammenstellung. Gehört zu genau einem Börsenkonto.
create table if not exists public.live_chart_presets (
  id uuid primary key default gen_random_uuid(),
  represented_account_id uuid not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_chart_presets_represented_account_id_fkey
    foreign key (represented_account_id)
    references public.represented_accounts (id) on delete cascade,
  constraint live_chart_presets_account_name_key unique (represented_account_id, name)
);

-- Handelspaare einer Zusammenstellung, eine Zeile je Paar (1. NF statt JSON-Liste).
create table if not exists public.live_chart_preset_assets (
  preset_id  uuid     not null references public.live_chart_presets (id) on delete cascade,
  position   smallint not null check (position between 1 and 4),
  instrument text     not null,
  primary key (preset_id, position),
  unique (preset_id, instrument)
);

-- Einstellungen je Benutzer (gewähltes Konto, gewählte Zusammenstellung, Zeitraster).
create table if not exists public.user_preferences (
  owner_user_id uuid primary key references auth.users (id) on delete cascade,
  selected_preset_id uuid references public.live_chart_presets (id) on delete set null,
  selected_timeframe text,
  selected_represented_account_id uuid references public.represented_accounts (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Protokoll der importierten Dateien. Die Datei selbst liegt im Storage.
create table if not exists public.import_history_files (
  id uuid primary key default gen_random_uuid(),
  represented_account_id uuid not null references public.represented_accounts (id) on delete cascade,
  stored_file_name text not null,
  original_file_name text,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  file_size_bytes bigint not null default 0,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint import_history_files_storage_key unique (storage_bucket, storage_path)
);

-- Importierte Transaktionen. Herkunft über import_file_id, Plattform über das Konto.
create table if not exists public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  represented_account_id uuid not null references public.represented_accounts (id) on delete cascade,
  import_file_id uuid references public.import_history_files (id) on delete set null,
  external_id text not null,
  occurred_at timestamptz not null,
  transaction_type text not null,
  asset text not null,
  quote text,
  quantity double precision,
  execution_price double precision,
  gross_value double precision,
  fee double precision,
  fee_currency text,
  net_quantity double precision,
  net_value double precision,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint imported_transactions_account_external_key unique (represented_account_id, external_id),
  constraint imported_transactions_not_negative
    check (coalesce(quantity, 0) >= 0
       and coalesce(execution_price, 0) >= 0
       and coalesce(fee, 0) >= 0)
);

-- ---------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------
create index if not exists represented_accounts_owner_idx
  on public.represented_accounts (owner_user_id);

create index if not exists user_preferences_selected_preset_id_idx
  on public.user_preferences (selected_preset_id);

create index if not exists user_preferences_selected_represented_account_id_idx
  on public.user_preferences (selected_represented_account_id);

create index if not exists imported_transactions_account_idx
  on public.imported_transactions (represented_account_id);

create index if not exists imported_transactions_occurred_at_idx
  on public.imported_transactions (occurred_at desc);

create index if not exists import_history_files_account_idx
  on public.import_history_files (represented_account_id);

create index if not exists import_history_files_imported_at_idx
  on public.import_history_files (imported_at desc);

-- ---------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_represented_accounts_updated_at on public.represented_accounts;
create trigger set_represented_accounts_updated_at
before update on public.represented_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists set_live_chart_presets_updated_at on public.live_chart_presets;
create trigger set_live_chart_presets_updated_at
before update on public.live_chart_presets
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_imported_transactions_updated_at on public.imported_transactions;
create trigger set_imported_transactions_updated_at
before update on public.imported_transactions
for each row
execute function public.set_updated_at();

drop trigger if exists set_import_history_files_updated_at on public.import_history_files;
create trigger set_import_history_files_updated_at
before update on public.import_history_files
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Prüffunktionen für die Zugriffsregeln
-- security definer, damit die Prüfung nicht selbst an den Regeln hängen bleibt.
-- ---------------------------------------------------------------------

-- Gehört das Börsenkonto dem angemeldeten Benutzer?
create or replace function public.owns_account(acc uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.represented_accounts
    where id = acc and owner_user_id = auth.uid()
  );
$$;

-- Gehört die Zusammenstellung (über ihr Konto) dem angemeldeten Benutzer?
create or replace function public.owns_preset(pre uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.live_chart_presets p
    join public.represented_accounts ra on ra.id = p.represented_account_id
    where p.id = pre and ra.owner_user_id = auth.uid()
  );
$$;

-- Ist der angemeldete Benutzer Administrator?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Schutz der Rolle
-- Ein Standardbenutzer darf seine Rolle nicht selbst ändern.
-- Der letzte Administrator darf nicht herabgestuft werden.
-- Zugriff ohne Anmeldung (SQL-Editor, Registrierungs-Trigger) bleibt erlaubt,
-- damit sich der erste Administrator setzen lässt.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Registrierung: Profil, Sammelkonto "All" und Einstellungen anlegen
-- Neue Profile bekommen über den Spaltenstandard immer die Rolle user.
-- Der Anzeigename wird auf 60 Zeichen gekürzt, sonst würde die Prüfung
-- profiles_display_name_len die gesamte Registrierung abbrechen.
-- (Diese Kürzung ist nicht Teil der Migrationsskripte, siehe README.)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_account_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 60)
  )
  on conflict (id) do nothing;

  insert into public.represented_accounts (owner_user_id, name, provider, base_currency)
  values (new.id, 'All', 'all', 'EUR')
  on conflict (owner_user_id, provider, name)
  do update
    set base_currency = excluded.base_currency,
        updated_at = timezone('utc', now())
  returning id into default_account_id;

  if default_account_id is null then
    select id
    into default_account_id
    from public.represented_accounts
    where owner_user_id = new.id
      and provider = 'all'
      and name = 'All'
    limit 1;
  end if;

  insert into public.user_preferences (
    owner_user_id,
    selected_preset_id,
    selected_timeframe,
    selected_represented_account_id
  )
  values (new.id, null, '1h', default_account_id)
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Benutzerübersicht für den Administrator
-- Liefert nur Zählwerte, keine Transaktionen und keine Beträge.
-- Für Nicht-Administratoren kommt eine leere Liste zurück.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.represented_accounts enable row level security;
alter table public.live_chart_presets enable row level security;
alter table public.live_chart_preset_assets enable row level security;
alter table public.user_preferences enable row level security;
alter table public.imported_transactions enable row level security;
alter table public.import_history_files enable row level security;

grant select, insert, update, delete on public.live_chart_preset_assets to authenticated;

-- profiles: eigener Datensatz; der Administrator darf zusätzlich alle lesen
-- und ändern (die Rolle schützt zusätzlich der Trigger protect_role).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- represented_accounts: Eigentum direkt über owner_user_id.
drop policy if exists "represented_accounts_select_own" on public.represented_accounts;
create policy "represented_accounts_select_own"
on public.represented_accounts
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_insert_own" on public.represented_accounts;
create policy "represented_accounts_insert_own"
on public.represented_accounts
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_update_own" on public.represented_accounts;
create policy "represented_accounts_update_own"
on public.represented_accounts
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_delete_own" on public.represented_accounts;
create policy "represented_accounts_delete_own"
on public.represented_accounts
for delete
to authenticated
using (auth.uid() = owner_user_id);

-- imported_transactions: Eigentum über das Konto; eine verknüpfte Importdatei
-- muss zum selben Konto gehören.
drop policy if exists imported_transactions_select_own on public.imported_transactions;
create policy imported_transactions_select_own on public.imported_transactions
  for select to authenticated
  using (public.owns_account(represented_account_id));

drop policy if exists imported_transactions_insert_own on public.imported_transactions;
create policy imported_transactions_insert_own on public.imported_transactions
  for insert to authenticated
  with check (
    public.owns_account(represented_account_id)
    and (import_file_id is null or exists (
      select 1 from public.import_history_files f
      where f.id = import_file_id
        and f.represented_account_id = imported_transactions.represented_account_id))
  );

drop policy if exists imported_transactions_update_own on public.imported_transactions;
create policy imported_transactions_update_own on public.imported_transactions
  for update to authenticated
  using (public.owns_account(represented_account_id))
  with check (
    public.owns_account(represented_account_id)
    and (import_file_id is null or exists (
      select 1 from public.import_history_files f
      where f.id = import_file_id
        and f.represented_account_id = imported_transactions.represented_account_id))
  );

drop policy if exists imported_transactions_delete_own on public.imported_transactions;
create policy imported_transactions_delete_own on public.imported_transactions
  for delete to authenticated
  using (public.owns_account(represented_account_id));

-- import_history_files: Eigentum über das Konto.
drop policy if exists import_history_files_select_own on public.import_history_files;
create policy import_history_files_select_own on public.import_history_files
  for select to authenticated using (public.owns_account(represented_account_id));
drop policy if exists import_history_files_insert_own on public.import_history_files;
create policy import_history_files_insert_own on public.import_history_files
  for insert to authenticated with check (public.owns_account(represented_account_id));
drop policy if exists import_history_files_update_own on public.import_history_files;
create policy import_history_files_update_own on public.import_history_files
  for update to authenticated
  using (public.owns_account(represented_account_id))
  with check (public.owns_account(represented_account_id));
drop policy if exists import_history_files_delete_own on public.import_history_files;
create policy import_history_files_delete_own on public.import_history_files
  for delete to authenticated using (public.owns_account(represented_account_id));

-- live_chart_presets: Eigentum über das Konto.
drop policy if exists live_chart_presets_select_own on public.live_chart_presets;
create policy live_chart_presets_select_own on public.live_chart_presets
  for select to authenticated using (public.owns_account(represented_account_id));
drop policy if exists live_chart_presets_insert_own on public.live_chart_presets;
create policy live_chart_presets_insert_own on public.live_chart_presets
  for insert to authenticated with check (public.owns_account(represented_account_id));
drop policy if exists live_chart_presets_update_own on public.live_chart_presets;
create policy live_chart_presets_update_own on public.live_chart_presets
  for update to authenticated
  using (public.owns_account(represented_account_id))
  with check (public.owns_account(represented_account_id));
drop policy if exists live_chart_presets_delete_own on public.live_chart_presets;
create policy live_chart_presets_delete_own on public.live_chart_presets
  for delete to authenticated using (public.owns_account(represented_account_id));

-- live_chart_preset_assets: Eigentum über Zusammenstellung und Konto.
drop policy if exists live_chart_preset_assets_select_own on public.live_chart_preset_assets;
create policy live_chart_preset_assets_select_own on public.live_chart_preset_assets
  for select to authenticated using (public.owns_preset(preset_id));
drop policy if exists live_chart_preset_assets_insert_own on public.live_chart_preset_assets;
create policy live_chart_preset_assets_insert_own on public.live_chart_preset_assets
  for insert to authenticated with check (public.owns_preset(preset_id));
drop policy if exists live_chart_preset_assets_update_own on public.live_chart_preset_assets;
create policy live_chart_preset_assets_update_own on public.live_chart_preset_assets
  for update to authenticated
  using (public.owns_preset(preset_id))
  with check (public.owns_preset(preset_id));
drop policy if exists live_chart_preset_assets_delete_own on public.live_chart_preset_assets;
create policy live_chart_preset_assets_delete_own on public.live_chart_preset_assets
  for delete to authenticated using (public.owns_preset(preset_id));

-- user_preferences: eigener Datensatz; ausgewähltes Konto und ausgewählte
-- Zusammenstellung müssen ebenfalls dem Benutzer gehören.
drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and (selected_represented_account_id is null or public.owns_account(selected_represented_account_id))
    and (selected_preset_id is null or public.owns_preset(selected_preset_id))
  );
drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and (selected_represented_account_id is null or public.owns_account(selected_represented_account_id))
    and (selected_preset_id is null or public.owns_preset(selected_preset_id))
  );
drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage: privater Bucket für importierte CSV-Dateien
-- Pfad: <benutzer-id>/<konto-id>/<dateiname>. Der erste Ordner muss die
-- eigene Benutzer-id sein.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('transaction-import-history', 'transaction-import-history', false)
on conflict (id) do nothing;

drop policy if exists "transaction_import_history_select_own" on storage.objects;
create policy "transaction_import_history_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_insert_own" on storage.objects;
create policy "transaction_import_history_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_update_own" on storage.objects;
create policy "transaction_import_history_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_delete_own" on storage.objects;
create policy "transaction_import_history_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);
