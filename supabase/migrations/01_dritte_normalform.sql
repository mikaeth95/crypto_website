-- =====================================================================
-- 01_dritte_normalform.sql
-- Stellt das Datenbankschema auf die dritte Normalform um.
--
-- VORHER PRÜFEN:
--   select assets from public.live_chart_presets limit 5;
--   Erwartet wird eine Liste aus Texten, z. B. ["BTC_EUR","ETH_EUR"].
--   Stehen dort Objekte wie [{"symbol":"BTC_EUR"}], muss Schritt B angepasst werden.
--
-- Das Skript läuft in einer Transaktion. Geht etwas schief, wird nichts übernommen.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. Alte Zugriffsregeln entfernen
-- Die Regeln hängen an owner_user_id. Solange sie existieren, lässt
-- PostgreSQL die Spalte nicht löschen. Sie werden in Schritt G neu angelegt.
-- ---------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('imported_transactions', 'import_history_files',
                        'live_chart_presets', 'user_preferences')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- B. Handelspaare der Chart-Zusammenstellungen in eine eigene Tabelle
-- Vorher lagen sie als JSON-Liste in einer Spalte (Verstoß gegen die 1. NF).
-- ---------------------------------------------------------------------
create table if not exists public.live_chart_preset_assets (
  preset_id  uuid     not null references public.live_chart_presets(id) on delete cascade,
  position   smallint not null check (position between 1 and 4),
  instrument text     not null,
  primary key (preset_id, position),
  unique (preset_id, instrument)
);

insert into public.live_chart_preset_assets (preset_id, position, instrument)
select p.id, a.ord::smallint, a.val
from public.live_chart_presets p
cross join lateral jsonb_array_elements_text(p.assets) with ordinality as a(val, ord)
where a.ord <= 4
on conflict do nothing;

-- ---------------------------------------------------------------------
-- C. Jede Zusammenstellung gehört zu genau einem Konto
-- Zusammenstellungen ohne Konto kommen zum Standardkonto "All" des Benutzers.
-- ---------------------------------------------------------------------
update public.live_chart_presets p
set represented_account_id = ra.id
from public.represented_accounts ra
where p.represented_account_id is null
  and ra.owner_user_id = p.owner_user_id
  and ra.name = 'All';

alter table public.live_chart_presets
  alter column represented_account_id set not null;

alter table public.live_chart_presets
  drop constraint if exists live_chart_presets_represented_account_id_fkey;
alter table public.live_chart_presets
  add constraint live_chart_presets_represented_account_id_fkey
  foreign key (represented_account_id)
  references public.represented_accounts(id) on delete cascade;

-- ---------------------------------------------------------------------
-- D. Herkunft einer Transaktion als echter Fremdschlüssel
-- Ersetzt source_file_name, das nur den Dateinamen als Text enthielt.
-- ---------------------------------------------------------------------
alter table public.imported_transactions
  add column if not exists import_file_id uuid
  references public.import_history_files(id) on delete set null;

update public.imported_transactions t
set import_file_id = f.id
from public.import_history_files f
where f.represented_account_id = t.represented_account_id
  and f.stored_file_name = t.source_file_name;

-- ---------------------------------------------------------------------
-- E. Doppelt gespeicherte Spalten entfernen
-- ---------------------------------------------------------------------
alter table public.imported_transactions
  drop column owner_user_id,
  drop column source_platform,
  drop column exchange,
  drop column data_source,
  drop column source_file_name;

alter table public.import_history_files
  drop column owner_user_id,
  drop column source_platform;

alter table public.live_chart_presets
  drop column owner_user_id,
  drop column provider,
  drop column assets;

-- ---------------------------------------------------------------------
-- F. Neue Eindeutigkeitsschlüssel
-- Neue Indizes sind nicht nötig: Die Indizes auf represented_account_id und
-- represented_accounts.owner_user_id bestehen bereits. Die Indizes auf den
-- entfallenen owner_user_id-Spalten hat PostgreSQL in Schritt E mit der
-- Spalte entfernt.
-- ---------------------------------------------------------------------
alter table public.imported_transactions
  add constraint imported_transactions_account_external_key
  unique (represented_account_id, external_id);

alter table public.import_history_files
  add constraint import_history_files_storage_key
  unique (storage_bucket, storage_path);

alter table public.live_chart_presets
  add constraint live_chart_presets_account_name_key
  unique (represented_account_id, name);

-- ---------------------------------------------------------------------
-- G. Zugriffsregeln neu. Der Eigentümer wird über das Konto geprüft.
-- ---------------------------------------------------------------------
create or replace function public.owns_account(acc uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.represented_accounts
    where id = acc and owner_user_id = auth.uid()
  );
$$;

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

create policy imported_transactions_select_own on public.imported_transactions
  for select to authenticated
  using (public.owns_account(represented_account_id));

create policy imported_transactions_insert_own on public.imported_transactions
  for insert to authenticated
  with check (
    public.owns_account(represented_account_id)
    and (import_file_id is null or exists (
      select 1 from public.import_history_files f
      where f.id = import_file_id
        and f.represented_account_id = imported_transactions.represented_account_id))
  );

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

create policy imported_transactions_delete_own on public.imported_transactions
  for delete to authenticated
  using (public.owns_account(represented_account_id));

create policy import_history_files_select_own on public.import_history_files
  for select to authenticated using (public.owns_account(represented_account_id));
create policy import_history_files_insert_own on public.import_history_files
  for insert to authenticated with check (public.owns_account(represented_account_id));
create policy import_history_files_update_own on public.import_history_files
  for update to authenticated
  using (public.owns_account(represented_account_id))
  with check (public.owns_account(represented_account_id));
create policy import_history_files_delete_own on public.import_history_files
  for delete to authenticated using (public.owns_account(represented_account_id));

create policy live_chart_presets_select_own on public.live_chart_presets
  for select to authenticated using (public.owns_account(represented_account_id));
create policy live_chart_presets_insert_own on public.live_chart_presets
  for insert to authenticated with check (public.owns_account(represented_account_id));
create policy live_chart_presets_update_own on public.live_chart_presets
  for update to authenticated
  using (public.owns_account(represented_account_id))
  with check (public.owns_account(represented_account_id));
create policy live_chart_presets_delete_own on public.live_chart_presets
  for delete to authenticated using (public.owns_account(represented_account_id));

alter table public.live_chart_preset_assets enable row level security;
grant select, insert, update, delete on public.live_chart_preset_assets to authenticated;

create policy live_chart_preset_assets_select_own on public.live_chart_preset_assets
  for select to authenticated using (public.owns_preset(preset_id));
create policy live_chart_preset_assets_insert_own on public.live_chart_preset_assets
  for insert to authenticated with check (public.owns_preset(preset_id));
create policy live_chart_preset_assets_update_own on public.live_chart_preset_assets
  for update to authenticated
  using (public.owns_preset(preset_id))
  with check (public.owns_preset(preset_id));
create policy live_chart_preset_assets_delete_own on public.live_chart_preset_assets
  for delete to authenticated using (public.owns_preset(preset_id));

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (owner_user_id = auth.uid());
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and (selected_represented_account_id is null or public.owns_account(selected_represented_account_id))
    and (selected_preset_id is null or public.owns_preset(selected_preset_id))
  );
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and (selected_represented_account_id is null or public.owns_account(selected_represented_account_id))
    and (selected_preset_id is null or public.owns_preset(selected_preset_id))
  );
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- H. Wertebereichsprüfungen
-- Diese Prüfungen sind im Pflichtenheft zugesagt und fehlten bisher.
-- Gibt es bereits Zeilen, die sie verletzen, bricht das Skript hier ab.
-- ---------------------------------------------------------------------

-- Anzeigename auf 60 Zeichen kuerzen, damit die Pruefung weiter unten
-- bestehende Zeilen nicht ablehnt.
update public.profiles
set display_name = left(display_name, 60)
where char_length(display_name) > 60;

alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 60);

alter table public.imported_transactions
  add constraint imported_transactions_not_negative
  check (coalesce(quantity, 0) >= 0
     and coalesce(execution_price, 0) >= 0
     and coalesce(fee, 0) >= 0);

-- ---------------------------------------------------------------------
-- I. Registrierung an die Längenprüfung anpassen
-- handle_new_user übernimmt den Anzeigenamen aus den Metadaten oder aus dem
-- Teil der E-Mail vor dem @. Ohne Kürzung würde die Prüfung aus Schritt H
-- bei einem längeren Namen die gesamte Registrierung abbrechen.
-- Gleiche Fassung wie in schema.sql.
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

commit;
